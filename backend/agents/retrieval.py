"""Retrieval agent: BM25 top-k policy passages for the ticket."""

from backend.state import TicketState, audit_entry
from backend.tools.kb import get_kb

TOP_K = 5


def retrieval_node(state: TicketState) -> dict:
    query = f"{state.get('category', '')} {state['customer_message']}"
    passages = get_kb().search(query, k=TOP_K)
    return {
        "kb_passages": passages,
        "audit": [audit_entry(
            "retrieval",
            f"retrieved {len(passages)} passages",
            {"sources": [f"{p['source']} p.{p['page']} (score {p['score']})" for p in passages]},
        )],
    }
