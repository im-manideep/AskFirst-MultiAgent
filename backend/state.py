"""TicketState — the shared state flowing through the graph."""

import operator
from datetime import datetime, timezone
from typing import Annotated, Optional, TypedDict


class TicketState(TypedDict):
    ticket_id: str
    customer_message: str                                # input
    category: str                                        # triage: billing/technical/account
    urgency: str                                         # triage: low/medium/high
    risk: str                                            # triage+resolver: safe/risky
    kb_passages: Annotated[list[dict], operator.add]     # retrieval output
    proposed_action: Optional[dict]                      # resolver: {type, params, rationale}
    draft_reply: str                                     # resolver output
    # Dict (not the spec's plain string) so the rejection reason can reach the
    # resolver through state: {decision, reason, approver, at}
    approval: Optional[dict]
    revisions: int                                       # bounded revision counter
    final_status: str                                    # resolved / rejected / escalated
    audit: Annotated[list[dict], operator.add]           # every step logged


def audit_entry(agent: str, summary: str, detail: Optional[dict] = None) -> dict:
    return {
        "agent": agent,
        "summary": summary,
        "detail": detail or {},
        "at": datetime.now(timezone.utc).isoformat(),
    }
