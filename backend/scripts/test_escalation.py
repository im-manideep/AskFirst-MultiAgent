"""Deterministic proof of the routing mechanics — no LLM involved.

Stubs the agents so the resolver ALWAYS proposes a risky refund, then drives:
  pause -> reject -> revise(1) -> pause -> reject -> revise(2) -> pause
        -> reject -> ESCALATE  (MAX_REVISIONS=2 exhausted)
and separately: pause -> approve -> execute -> resolved.

Usage: uv run python -m backend.scripts.test_escalation
"""

import sqlite3
import uuid

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from backend import config
from backend import graph as graph_mod
from backend.state import audit_entry


def fake_triage(state):
    return {"category": "billing", "urgency": "high", "risk": "risky",
            "audit": [audit_entry("triage", "stub")]}


def fake_retrieval(state):
    return {"kb_passages": [{"text": "stub policy", "source": "stub.pdf", "page": 1, "score": 1.0}],
            "audit": [audit_entry("retrieval", "stub")]}


def fake_resolver(state):
    approval = state.get("approval")
    is_revision = bool(approval and approval.get("decision") == "rejected")
    revisions = state.get("revisions", 0) + (1 if is_revision else 0)
    return {"proposed_action": {"type": "refund", "params": {"amount": 600}, "rationale": "stub"},
            "draft_reply": f"stub draft (rev {revisions})", "risk": "risky", "revisions": revisions,
            "audit": [audit_entry("resolver", f"stub rev {revisions}")]}


def paused(graph, cfg) -> bool:
    return len(graph.get_state(cfg).interrupts) > 0


def main() -> None:
    # patch the module globals build_graph() reads at call time
    graph_mod.triage_node = fake_triage
    graph_mod.retrieval_node = fake_retrieval
    graph_mod.resolver_node = fake_resolver

    conn = sqlite3.connect(config.CHECKPOINT_DB, check_same_thread=False)
    graph = graph_mod.build_graph(SqliteSaver(conn))

    # --- escalation path ---
    tid = f"esc-{uuid.uuid4().hex[:8]}"
    cfg = {"configurable": {"thread_id": tid}}
    graph.invoke({"ticket_id": tid, "customer_message": "stub", "revisions": 0}, cfg)
    assert paused(graph, cfg), "risky ticket should pause"

    for i, expect_pause in [(1, True), (2, True), (3, False)]:
        graph.invoke(Command(resume={"decision": "rejected", "reason": f"reject #{i}"}), cfg)
        snapshot = graph.get_state(cfg)
        assert paused(graph, cfg) == expect_pause, f"after reject #{i}: pause={not expect_pause} expected"
        print(f"reject #{i}: revisions={snapshot.values.get('revisions')} "
              f"paused={paused(graph, cfg)} final={snapshot.values.get('final_status') or '-'}")

    final = graph.get_state(cfg).values
    assert final["final_status"] == "escalated", f"expected escalated, got {final['final_status']}"
    assert final["revisions"] == config.MAX_REVISIONS

    # --- approve path ---
    tid2 = f"esc-{uuid.uuid4().hex[:8]}"
    cfg2 = {"configurable": {"thread_id": tid2}}
    graph.invoke({"ticket_id": tid2, "customer_message": "stub", "revisions": 0}, cfg2)
    assert paused(graph, cfg2)
    graph.invoke(Command(resume={"decision": "approved"}), cfg2)
    assert graph.get_state(cfg2).values["final_status"] == "resolved"
    print("approve path: resolved")

    print("OK - escalation and approval routing verified")


if __name__ == "__main__":
    main()
