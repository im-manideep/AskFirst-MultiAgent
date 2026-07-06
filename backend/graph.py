"""The LangGraph graph: triage → retrieval → resolver → [risk gate] → approval/execute.

The approval node calls interrupt() — the graph pauses there, the state is
checkpointed, and the run resumes (minutes or a restart later) when a human
responds via Command(resume={...}).

NOTE vs CLAUDE.md: SqliteSaver lives in the separate langgraph-checkpoint-sqlite
package, and SqliteSaver.from_conn_string() is a context manager in current
versions — so the graph is compiled via build_graph(checkpointer) and callers
own the saver's lifecycle (FastAPI lifespan / scripts).
"""

from datetime import datetime, timezone

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from backend import config
from backend.agents.resolver import resolver_node
from backend.agents.retrieval import retrieval_node
from backend.agents.triage import triage_node
from backend.state import TicketState, audit_entry
from backend.tools import actions


def approval_node(state: TicketState) -> dict:
    # On resume this node RE-EXECUTES from the top — keep all side effects
    # after the interrupt() call.
    decision = interrupt({
        "ticket_id": state["ticket_id"],
        "proposed_action": state["proposed_action"],
        "draft_reply": state["draft_reply"],
        "revisions": state.get("revisions", 0),
    })
    if isinstance(decision, str):  # tolerate a bare "approved"/"rejected"
        decision = {"decision": decision}
    approval = {
        "decision": decision.get("decision", "rejected"),  # unknown input fails closed
        "reason": decision.get("reason"),
        "approver": decision.get("approver", "human"),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "approval": approval,
        "audit": [audit_entry("approval", f"human {approval['decision']}",
                              {"reason": approval["reason"], "approver": approval["approver"]})],
    }


def execute_node(state: TicketState) -> dict:
    action = state["proposed_action"] or {"type": "answer", "params": {}}
    receipts = actions.execute(state["ticket_id"], action, state.get("draft_reply", ""))
    return {
        "final_status": "resolved",
        "audit": [audit_entry("execute", f"executed {action.get('type')} (mock)", {"receipts": receipts})],
    }


def escalate_node(state: TicketState) -> dict:
    return {
        "final_status": "escalated",
        "audit": [audit_entry("escalate", "revisions exhausted — escalated to a human agent", {
            "proposed_action": state.get("proposed_action"),
            "last_rejection_reason": (state.get("approval") or {}).get("reason"),
            "revisions": state.get("revisions", 0),
        })],
    }


def route_after_resolver(state: TicketState) -> str:
    return "approval" if state["risk"] == "risky" else "execute"


def route_after_approval(state: TicketState) -> str:
    if (state.get("approval") or {}).get("decision") == "approved":
        return "execute"
    if state.get("revisions", 0) < config.MAX_REVISIONS:
        return "resolver"
    return "escalate"


def build_graph(checkpointer):
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
                            {"execute": "execute", "resolver": "resolver", "escalate": "escalate"})
    g.add_edge("execute", END)
    g.add_edge("escalate", END)

    return g.compile(checkpointer=checkpointer)
