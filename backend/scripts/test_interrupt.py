"""Interrupt/resume acceptance proof. Each mode is a FRESH process, so passing
`state`/`approve` after `start` proves a paused ticket survives process death.

Usage (from project root):
    uv run python -m backend.scripts.test_interrupt start [message] [thread_id]
    uv run python -m backend.scripts.test_interrupt state   <thread_id>
    uv run python -m backend.scripts.test_interrupt approve <thread_id>
    uv run python -m backend.scripts.test_interrupt reject  <thread_id> "reason"
"""

import json
import sqlite3
import sys
import uuid

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from backend import config
from backend.graph import build_graph


def get_graph():
    conn = sqlite3.connect(config.CHECKPOINT_DB, check_same_thread=False)
    return build_graph(SqliteSaver(conn))


def run_stream(graph, payload, cfg) -> None:
    for chunk in graph.stream(payload, cfg, stream_mode="updates"):
        for node, update in chunk.items():
            if node == "__interrupt__":
                print(f"[PAUSED] payload: {json.dumps(update[0].value, indent=2)}")
            else:
                keys = ", ".join(k for k in (update or {}) if k != "audit")
                print(f"[{node}] -> {keys}")
    snapshot = graph.get_state(cfg)
    status = snapshot.values.get("final_status")
    print(f"final_status: {status or '(paused)'} | pending interrupts: {len(snapshot.interrupts)}")


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "start"
    graph = get_graph()

    if mode == "start":
        message = sys.argv[2] if len(sys.argv) > 2 else "I was double-charged - refund my $600 annual payment"
        thread_id = sys.argv[3] if len(sys.argv) > 3 else f"test-{uuid.uuid4().hex[:8]}"
        cfg = {"configurable": {"thread_id": thread_id}}
        print(f"thread_id: {thread_id}")
        run_stream(graph, {"ticket_id": thread_id, "customer_message": message, "revisions": 0}, cfg)
        return

    thread_id = sys.argv[2]
    cfg = {"configurable": {"thread_id": thread_id}}

    if mode == "state":
        snapshot = graph.get_state(cfg)
        print(f"next nodes: {snapshot.next}")
        print(f"interrupts: {[i.value for i in snapshot.interrupts]}")
        print(f"revisions: {snapshot.values.get('revisions')}")
    elif mode == "approve":
        run_stream(graph, Command(resume={"decision": "approved", "approver": "cli"}), cfg)
    elif mode == "reject":
        reason = sys.argv[3] if len(sys.argv) > 3 else "not compliant with policy"
        run_stream(graph, Command(resume={"decision": "rejected", "reason": reason, "approver": "cli"}), cfg)
    else:
        raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    main()
