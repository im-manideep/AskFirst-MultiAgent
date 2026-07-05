# Build prompt — paste into Claude Code

Build **Deskmate**, a customer-support multi-agent system with LangGraph and
human-in-the-loop approval. Follow `CLAUDE.md` — read all of it first. The
interrupt/approval gate is the core deliverable: a risky action must pause the
graph and wait for a human; everything else serves that. Keep secrets in `.env`
and gitignore it before the first commit.

## Phase 1 — graph skeleton
Set up with uv (`langgraph langchain-core langchain-openai langchain-ollama
fastapi uvicorn pypdf rank_bm25`). Build `state.py` (TicketState) and `graph.py`
wiring START → triage → retrieval → resolver → execute → END with **stub**
nodes. Compile WITH a SqliteSaver checkpointer from the start. Prove
`app.invoke({...}, config with thread_id)` runs end to end.

## Phase 2 — provider-swappable LLM
`tools/llm.py` by `LLM_PROVIDER` env: `ollama` (llama3.2:3b) dev, `openai`
(gpt-4o-mini) quality. All agents get models only from here.

## Phase 3 — real agents + KB
- `tools/kb.py`: ingest the PDFs in `backend/kb/` (pypdf), chunk with source +
  page metadata. `agents/retrieval.py`: BM25 (`rank_bm25`) top-k passages for
  the ticket. No vector DB needed at this scale.
- `agents/triage.py`: classify category (billing/technical/account) + urgency +
  preliminary risk.
- `agents/resolver.py`: from message + policy passages produce
  `proposed_action` ({type, params, rationale citing policy}) + `draft_reply`,
  and set final `risk` per the configurable risk policy (refunds > $50,
  cancellations, deletions = risky).

## Phase 4 — the interrupt/approval gate (CORE)
- Add the `approval` node using LangGraph's `interrupt()` and the conditional
  edges from CLAUDE.md (risk gate after resolver; approve → execute, reject →
  bounded revision (MAX_REVISIONS=2) → escalate when exhausted).
- Verify the exact interrupt/resume API against the INSTALLED LangGraph version
  (e.g. `Command(resume=...)`) — don't trust memory, check the installed docs.
- **Prove it**: a risky ticket pauses; resuming with "approved" continues to
  execute; resuming with "rejected"+reason triggers a revision. Also prove a
  paused ticket survives a process restart (checkpointer) and still resumes.

## Phase 5 — actions + audit
`tools/actions.py`: MOCK executors (issue_refund, cancel_plan, send_reply,
reset_password) writing to an actions log — never touch real systems. Every
node appends to `state["audit"]`; persist per ticket; expose `/audit/{id}`.

## Phase 6 — API + frontend
- FastAPI: streaming `POST /tickets` (node-by-node progress), `GET /approvals`
  (pending inbox), `POST /approvals/{id}` (approve/reject+reason → resumes the
  thread), `GET /audit/{id}`, `/health`.
- Invoke `frontend-design`. Build the liquid-glass UI per CLAUDE.md Part 3:
  intake page with preset demo tickets + a live pipeline timeline that visibly
  PAUSES at approval; an approval inbox with Approve/Reject cards that resume
  the run live; a ticket audit view. (A replacement design reference may be
  provided later — keep the frontend cleanly separated so restyling is easy.)

## Acceptance
- Safe ticket → auto-resolved, policy-grounded reply, no pause.
- Risky ticket → pauses, shows in inbox, approve resumes + executes (mock),
  timeline shows pause/resume live.
- Reject → bounded revision; exhausted → graceful escalation.
- Paused ticket survives backend restart and still resumes.
- Full audit trail per ticket. One env switch flips Ollama → cloud.

Stop and ask before installing anything global or calling a paid API. Never
print, echo, or log any API key.
