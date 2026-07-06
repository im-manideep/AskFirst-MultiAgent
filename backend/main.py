"""FastAPI: NDJSON-streaming ticket runs, the approval inbox, audit.

Run:  uv run uvicorn backend.main:app --port 8000
"""

import json
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from pydantic import BaseModel

from backend import config, db
from backend.graph import build_graph


@asynccontextmanager
async def lifespan(app: FastAPI):
    # AsyncSqliteSaver.from_conn_string is a context manager (current LangGraph);
    # holding it open for the app's lifetime keeps pause/resume durable and
    # closes the sqlite handle cleanly on shutdown (Windows file locks).
    async with AsyncSqliteSaver.from_conn_string(str(config.CHECKPOINT_DB)) as saver:
        app.state.graph = build_graph(saver)
        await _reconcile_running_tickets(app.state.graph)
        yield


app = FastAPI(title="Deskmate", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _reconcile_running_tickets(graph) -> None:
    """A crash mid-run can leave tickets 'running'; restore their true status."""
    for ticket in db.list_tickets("running"):
        snapshot = await graph.aget_state({"configurable": {"thread_id": ticket["ticket_id"]}})
        if snapshot.interrupts:
            db.set_ticket_status(ticket["ticket_id"], "pending_approval", snapshot.interrupts[0].value)
        elif snapshot.values.get("final_status"):
            db.set_ticket_status(ticket["ticket_id"], snapshot.values["final_status"])
        else:
            db.set_ticket_status(ticket["ticket_id"], "failed")


class TicketIn(BaseModel):
    customer_message: str


class DecisionIn(BaseModel):
    decision: str            # "approved" | "rejected"
    reason: str | None = None
    approver: str = "human"


def _line(obj: dict) -> str:
    return json.dumps(obj, default=str) + "\n"


async def _stream_run(graph, run_input, ticket_id: str):
    """Shared NDJSON generator for fresh runs and resumes."""
    cfg = {"configurable": {"thread_id": ticket_id}}
    try:
        async for chunk in graph.astream(run_input, cfg, stream_mode="updates"):
            for node, update in chunk.items():
                if node == "__interrupt__":
                    payload = update[0].value
                    db.set_ticket_status(ticket_id, "pending_approval", payload)
                    yield _line({"event": "paused", "ticket_id": ticket_id, "interrupt": payload})
                else:
                    for entry in (update or {}).get("audit", []):
                        db.insert_audit(ticket_id, entry)
                    shown = {k: v for k, v in (update or {}).items() if k != "audit"}
                    yield _line({"event": "node", "ticket_id": ticket_id, "node": node, "update": shown})

        snapshot = await graph.aget_state(cfg)
        if not snapshot.interrupts:
            final = snapshot.values.get("final_status", "resolved")
            db.set_ticket_status(ticket_id, final)
            yield _line({"event": "done", "ticket_id": ticket_id, "final_status": final,
                         "draft_reply": snapshot.values.get("draft_reply", "")})
    except Exception as exc:  # keep the stream well-formed even on node failure
        db.set_ticket_status(ticket_id, "failed")
        yield _line({"event": "error", "ticket_id": ticket_id, "detail": str(exc)})


@app.post("/tickets")
async def submit_ticket(ticket: TicketIn):
    ticket_id = f"tkt-{uuid.uuid4().hex[:8]}"
    db.upsert_ticket(ticket_id, ticket.customer_message, "running")
    run_input = {"ticket_id": ticket_id, "customer_message": ticket.customer_message, "revisions": 0}
    return StreamingResponse(_stream_run(app.state.graph, run_input, ticket_id),
                             media_type="application/x-ndjson")


@app.get("/approvals")
async def list_approvals():
    return db.list_tickets("pending_approval")


@app.post("/approvals/{ticket_id}")
async def decide(ticket_id: str, decision: DecisionIn):
    if decision.decision not in {"approved", "rejected"}:
        raise HTTPException(422, "decision must be 'approved' or 'rejected'")
    graph = app.state.graph
    snapshot = await graph.aget_state({"configurable": {"thread_id": ticket_id}})
    if not snapshot.interrupts:
        raise HTTPException(409, f"ticket {ticket_id} is not waiting for approval")
    db.set_ticket_status(ticket_id, "running")
    resume = Command(resume={"decision": decision.decision, "reason": decision.reason,
                             "approver": decision.approver})
    return StreamingResponse(_stream_run(graph, resume, ticket_id),
                             media_type="application/x-ndjson")


@app.get("/tickets")
async def list_tickets():
    return db.list_tickets()


@app.get("/audit/{ticket_id}")
async def get_audit(ticket_id: str):
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(404, f"unknown ticket {ticket_id}")
    snapshot = await app.state.graph.aget_state({"configurable": {"thread_id": ticket_id}})
    return {
        "ticket": ticket,
        "audit": db.get_audit(ticket_id),
        "actions": db.get_actions(ticket_id),
        "state": {
            "category": snapshot.values.get("category"),
            "urgency": snapshot.values.get("urgency"),
            "risk": snapshot.values.get("risk"),
            "kb_passages": snapshot.values.get("kb_passages", []),
            "proposed_action": snapshot.values.get("proposed_action"),
            "draft_reply": snapshot.values.get("draft_reply"),
            "approval": snapshot.values.get("approval"),
            "revisions": snapshot.values.get("revisions"),
            "final_status": snapshot.values.get("final_status"),
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok", "provider": config.LLM_PROVIDER}
