"""Smoke test: run one ticket through the graph, printing node-by-node updates.

Usage (from project root):
    uv run python -m backend.scripts.smoke_graph ["customer message"]
"""

import json
import sqlite3
import sys
import uuid

from langgraph.checkpoint.sqlite import SqliteSaver

from backend import config
from backend.graph import build_graph


def main() -> None:
    message = sys.argv[1] if len(sys.argv) > 1 else "How do I reset my password?"
    ticket_id = f"smoke-{uuid.uuid4().hex[:8]}"

    conn = sqlite3.connect(config.CHECKPOINT_DB, check_same_thread=False)
    graph = build_graph(SqliteSaver(conn))
    cfg = {"configurable": {"thread_id": ticket_id}}

    print(f"ticket {ticket_id}: {message!r}")
    for chunk in graph.stream(
        {"ticket_id": ticket_id, "customer_message": message, "revisions": 0},
        cfg,
        stream_mode="updates",
    ):
        for node, update in chunk.items():
            if node == "__interrupt__":
                print(f"\n[PAUSED] interrupt payload: {json.dumps(update[0].value, indent=2)}")
            else:
                shown = {k: v for k, v in (update or {}).items() if k != "audit"}
                print(f"\n[{node}] {json.dumps(shown, indent=2, default=str)[:800]}")

    final = graph.get_state(cfg)
    print(f"\nfinal_status: {final.values.get('final_status', '(paused — no final status)')}")
    print(f"pending interrupts: {len(final.interrupts)}")


if __name__ == "__main__":
    main()
