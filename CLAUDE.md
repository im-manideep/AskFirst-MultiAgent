# CLAUDE.md — Deskmate: Customer Support Multi-Agent System

You're building a **multi-agent customer support system** with LangGraph. A
customer message comes in; a team of specialized agents triages it, retrieves
the relevant policy knowledge, decides an action, and drafts a reply — and when
the action is **risky** (e.g. a refund over a threshold), the entire run
**pauses and waits for a human to approve or reject** before anything executes.
The model is **provider-swappable** (free local Ollama for dev, cloud API for
quality). Everything is audited.

> "Deskmate" is a working product name — rename it anywhere it appears.

This file combines three things:
1. **The WAT framework** — how you operate.
2. **The backend** — the LangGraph agents, the interrupt/approval gate, audit.
3. **The frontend** — the liquid-glass UI adapted to a support-desk product.

---

## What we're building (the flow)

```
customer message
   → TRIAGE agent        (classify: billing/technical/account; urgency; risk)
   → RETRIEVAL agent     (pull relevant policy/KB passages — RAG over the docs)
   → RESOLVER agent      (decide action + draft the reply, grounded in policy)
   → [risk gate]
        safe action      → execute → respond → END
        risky action     → ⏸ INTERRUPT: human approves/rejects in the UI
                             approve → execute → respond → END
                             reject  → resolver revises (bounded) → back to gate
```

The knowledge base is the **Northwind Desk document set** (support FAQ, pricing
and plans, security policy, product guide, employee handbook) — place the PDFs
in `backend/kb/`. They define the policies the agents must follow (e.g. annual
plans refundable within 30 days; monthly plans not refundable; Starter has no
integrations; data deleted 30 days after account closure).

## Why human-in-the-loop is the point

An autonomous support agent that can issue refunds is a liability; one that
pauses for approval on risky actions is a product. The core mechanism is
LangGraph's **interrupt**: the graph stops mid-execution at the approval node,
persists its state via a **checkpointer**, and resumes — minutes or hours later
— when a human responds. This durable pause/resume is the enterprise feature
this project exists to demonstrate. Secondary robustness: bounded revision
loops (a rejected draft is revised at most MAX_REVISIONS times), per-node
try/except, and full audit logging.

## Risk policy (make it explicit and configurable)

- **Risky (requires approval):** refunds over $50, plan cancellations, account
  closure/deletion, anything touching stored data.
- **Safe (auto-execute):** answering questions, sending informational replies,
  password-reset instructions, refunds ≤ $50.
- Thresholds live in config/env, not hard-coded in prompts.

## ⚠️ Secrets rule

Cloud LLM keys (when used) live in `.env`, loaded via environment. **`.env` is
never committed** — add it to `.gitignore` before the first commit. Keys never
reach the frontend; the frontend talks only to the backend.

## Build order

1. Graph skeleton with stub nodes (triage → retrieval → resolver → respond),
   prove it runs end to end.
2. Real triage + resolver agents (LLM), real retrieval over the KB.
3. **The interrupt/approval gate + checkpointer** — the core deliverable.
   Prove a risky ticket pauses and a safe one flows through.
4. Mock action executors + audit log.
5. Streaming API + the frontend (live pipeline + approval inbox).
6. (Optional) deploy.

---

# PART 1 — THE WAT FRAMEWORK (how you operate)

Probabilistic AI reasons; deterministic code executes. The LangGraph graph is
the deterministic backbone; agents (LLM calls) reason inside it; the approval
gate puts a human inside the loop for consequential actions.

**Workflows** (`workflows/`): markdown SOPs (handle a ticket, add an action
type, run the demo, deploy). **Agent (you):** read the workflow, wire the graph
correctly, handle failures, ask when unsure. **Tools** (`tools/`): the LLM
provider, KB retrieval, action executors — deterministic, testable modules.

Operating rules: reuse existing tools before writing new ones; on failure read
the full trace, fix, retest, record the lesson in the workflow; don't overwrite
a workflow without asking.

---

# PART 2 — THE BACKEND (LangGraph + interrupts)

## Setup (verified — current LangGraph v1.x)

```bash
uv add langgraph langchain-core langchain-openai langchain-ollama fastapi uvicorn pypdf rank_bm25
```

Use START/END constants (`set_entry_point` is deprecated). Nodes return ONLY the
state keys they changed.

## Provider-swappable LLM (build first)

`tools/llm.py` reads `LLM_PROVIDER`: `ollama` → `ChatOllama(model="llama3.2:3b")`
(dev, free); `openai` → `ChatOpenAI(model="gpt-4o-mini")` (quality). All agents
get their model from this module only. Triage/resolver quality matters, so
expect to flip to cloud for demo runs.

## State schema

```python
from typing import TypedDict, Annotated, Optional
import operator

class TicketState(TypedDict):
    ticket_id: str
    customer_message: str                       # input
    category: str                               # triage: billing/technical/account
    urgency: str                                # triage: low/medium/high
    risk: str                                   # triage+resolver: safe/risky
    kb_passages: Annotated[list[dict], operator.add]   # retrieval output
    proposed_action: Optional[dict]             # resolver: {type, params, rationale}
    draft_reply: str                            # resolver output
    approval: Optional[str]                     # human: approved/rejected (+reason)
    revisions: int                              # bounded revision counter
    final_status: str                           # resolved / rejected / escalated
    audit: Annotated[list[dict], operator.add]  # every step logged
```

## The graph — with the interrupt (the core)

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver   # durable pause/resume
from langgraph.types import interrupt                  # human-in-the-loop

MAX_REVISIONS = 2

def approval_node(state: TicketState):
    # Pauses the graph; the payload is surfaced to the UI.
    decision = interrupt({
        "ticket_id": state["ticket_id"],
        "proposed_action": state["proposed_action"],
        "draft_reply": state["draft_reply"],
    })
    return {"approval": decision}   # provided when the graph is resumed

def route_after_resolver(state):           # risk gate
    return "approval" if state["risk"] == "risky" else "execute"

def route_after_approval(state):
    if state["approval"] == "approved":
        return "execute"
    if state.get("revisions", 0) < MAX_REVISIONS:
        return "resolver"                  # revise the plan/draft
    return "escalate"                      # give up gracefully → human takes over

g = StateGraph(TicketState)
g.add_node("triage", triage_node)
g.add_node("retrieval", retrieval_node)
g.add_node("resolver", resolver_node)
g.add_node("approval", approval_node)
g.add_node("execute", execute_node)
g.add_node("escalate", escalate_node)
g.add_edge(START, "triage")
g.add_edge("triage", "retrieval")
g.add_edge("retrieval", "resolver")
g.add_conditional_edges("resolver", route_after_resolver,
                        {"approval": "approval", "execute": "execute"})
g.add_conditional_edges("approval", route_after_approval,
                        {"execute": "execute", "resolver": "resolver",
                         "escalate": "escalate"})
g.add_edge("execute", END)
g.add_edge("escalate", END)

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
app = g.compile(checkpointer=checkpointer)
# Run with a thread id so the paused ticket can be resumed later:
#   config = {"configurable": {"thread_id": ticket_id}}
#   app.invoke({...}, config)                  # runs until interrupt
#   app.invoke(Command(resume="approved"), config)   # human resumes it
```

Notes that matter:
- **A checkpointer is REQUIRED for interrupts** — it's what lets a paused ticket
  survive and resume later (even after a restart). SQLite for dev.
- Each ticket = one `thread_id`. The approval UI resumes the right thread.
- Verify the exact resume API (`Command(resume=...)`) against the installed
  LangGraph version at build time; the interrupt/resume surface has evolved.

## The agents

- **triage_node**: LLM classifies category + urgency, and makes a *first* risk
  read (mentions of refunds/cancellation/deletion → risky candidates).
- **retrieval_node**: search the KB for passages relevant to the category +
  message. Keep it simple and local: chunk the PDFs at ingest (pypdf), score
  with BM25 (`rank_bm25`) — no vector DB needed for 5 documents. Return
  passages with source file + page.
- **resolver_node**: given message + policy passages, decide the
  `proposed_action` ({type: refund/cancel/answer/reset..., params, rationale
  citing policy}) and write the `draft_reply`. It sets the final `risk` per the
  risk policy. On a revision (rejected), it must incorporate the rejection
  reason.
- **execute_node**: run the action via `tools/actions.py` — **mock executors**
  (issue_refund, cancel_plan, send_reply, reset_password) that write to an
  actions log instead of touching real systems. Log everything.
- **escalate_node**: mark the ticket escalated with the full context attached.

## Audit (required)

Every node appends to `state["audit"]`: agent, inputs summary, outputs summary,
tool calls, timestamps. Persist per-ticket (SQLite). Approvals record who/when/
what was approved. Expose via `/audit/{ticket_id}`.

## API (FastAPI)

- `POST /tickets` — submit a customer message; **streams** node-by-node progress
  (graph stream) so the UI shows the pipeline live; returns paused-for-approval
  status when the interrupt fires.
- `GET /approvals` — list tickets waiting for approval (the inbox).
- `POST /approvals/{ticket_id}` — approve/reject (+reason); resumes the thread.
- `GET /audit/{ticket_id}`, `GET /health`.

---

# PART 3 — THE FRONTEND (liquid glass — placeholder, may be replaced)

> **NOTE:** the user may supply a MotionSites design reference to replace/extend
> this section. Until then, build with the established liquid-glass system.

## Always do first
- **Invoke the `frontend-design` skill** before writing any frontend code.

## Stack & aesthetic
React + TypeScript + Vite + Tailwind + framer-motion + lucide-react on
`bg-black`; Instrument Serif display headings; the `.liquid-glass` class on all
glass elements (same CSS as previous projects — navbar pill, cards, buttons;
animate only transform/opacity; never `transition-all`; monochrome).

## Screens (the product)

1. **Ticket intake / demo page** — a glass input to submit a customer message
   (plus 3–4 preset demo buttons: "double-charged, refund $600" (risky),
   "how do I reset my password?" (safe), "cancel my plan" (risky), "does Starter
   include Slack?" (safe/KB)). On submit: a **live pipeline timeline** — glass
   step cards Triage → Retrieval → Resolver → (Approval) → Execute lighting up
   as the stream progresses. When the interrupt fires, the pipeline visibly
   pauses with a "⏸ waiting for human approval" state. This pause is the demo.
2. **Approval inbox** — the human's console: pending tickets as glass cards
   showing the proposed action, amount, rationale (with policy citations), and
   the draft reply, with **Approve / Reject (+reason)** buttons. Acting on a
   card resumes that ticket's graph and the timeline continues live.
3. **Ticket detail / audit** — the full trail: every agent's input/output, KB
   passages used (with sources), the human decision, timestamps.

## Landing copy (adapted to THIS product)
Hero (Instrument Serif): **"Support that knows when to** *ask***."** Subtitle:
"AI agents triage, research, and resolve — and pause for a human before any
risky action." CTA: "See it pause."

---

## Project structure

```
deskmate/
  backend/
    main.py               # FastAPI: /tickets (stream), /approvals, /audit
    graph.py              # StateGraph + interrupt + checkpointer wiring
    state.py              # TicketState
    agents/
      triage.py
      retrieval.py        # BM25 over the KB PDFs
      resolver.py
    tools/
      llm.py              # provider-swappable model
      kb.py               # PDF ingest + chunking
      actions.py          # MOCK executors + actions log
    kb/                   # the Northwind PDFs (knowledge base)
    workflows/            # WAT SOPs
    .env                  # keys — NEVER commit
  frontend/               # React + TS + Vite (liquid-glass UI)
  README.md
```

## Definition of done

- A **safe** ticket ("how do I reset my password?") flows through all agents and
  auto-resolves with a policy-grounded reply. No pause.
- A **risky** ticket ("refund me $600") pauses at the approval gate; it appears
  in the approval inbox; approving it resumes the graph and executes the (mock)
  refund; the timeline shows the pause and resume live.
- **Rejecting** with a reason sends it back for a bounded revision; exhausting
  revisions escalates gracefully.
- A paused ticket **survives a backend restart** (checkpointer) and can still be
  approved after.
- Every step is in the audit trail with sources and timestamps.
- One env switch flips Ollama → cloud.

## Bottom line

The interrupt is the product. Get the graph pausing and resuming on a risky
ticket before polishing anything else — then make the pause *visible* in the UI,
because "watch the AI stop and ask permission" is the whole demo.
