"""Resolver agent: decide the action + draft the reply, grounded in policy.

The LLM proposes; deterministic code decides the final risk from config
thresholds — never the prompt. On a revision (human rejected), the rejection
reason is injected into the prompt and the bounded counter increments.
"""

import re

from backend import config
from backend.state import TicketState, audit_entry
from backend.tools.llm import get_model, parse_json_or

FALLBACK = {
    "action": {
        "type": "answer",
        "params": {},
        "rationale": "Model output was unparseable; defaulting to an informational reply for human review.",
    },
    "draft_reply": "Thanks for reaching out. A member of our team is reviewing your request and will follow up shortly.",
}

PROMPT_HEADER = """You are the resolver agent for Northwind Desk customer support.
Given the customer message and the policy passages, decide ONE action and write the reply.

Allowed action types:
- "answer"          — informational reply only, no system change
- "reset_password"  — send password-reset instructions
- "refund"          — refund money; params MUST include a numeric "amount"
- "cancel_plan"     — cancel the customer's plan
- "close_account"   — close/delete the account

Rules:
- Choose the action type that FULFILLS the customer's explicit request: if they ask
  to cancel their plan use "cancel_plan"; to close or delete their account use
  "close_account"; to get money back use "refund" with the numeric amount; for a
  forgotten password use "reset_password". Risky actions are routed to a human
  approver automatically — do not avoid them.
- Use "answer" ONLY when the customer asks a question with no system change, or
  when their request is against policy (then explain the policy and offer the
  nearest allowed alternative).
- Ground the reply and rationale ONLY in the policy passages; never invent policy.
- The rationale must cite at least one passage like [support_faq.pdf p.1].
- Respond with ONLY a JSON object shaped exactly like:
{"action": {"type": "refund", "params": {"amount": 600}, "rationale": "... [pricing_and_plans.pdf p.1]"},
 "draft_reply": "..."}

Examples of the correct action type:
- "Please cancel my plan"            -> "type": "cancel_plan"   (NOT "answer")
- "Close my account for good"        -> "type": "close_account" (NOT "answer")
- "Refund my $600 charge"            -> "type": "refund", "params": {"amount": 600}
- "How do I reset my password?"      -> "type": "reset_password"
- "Does Starter include Slack?"      -> "type": "answer"
"""


def _parse_amount(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9.]", "", value)
        try:
            return float(cleaned) if cleaned else None
        except ValueError:
            return None
    return None


VALID_TYPES = {"answer", "reset_password", "refund", "cancel_plan", "close_account"}


def _normalize_action(data: dict) -> dict:
    """Small local models shape the JSON loosely — normalize or fail closed."""
    action = data.get("action")
    if isinstance(action, str):
        action = {"type": action, "params": data.get("params") or {}, "rationale": data.get("rationale", "")}
    elif not isinstance(action, dict):
        # sometimes the fields land at the top level
        action = {"type": data.get("type"), "params": data.get("params") or {},
                  "rationale": data.get("rationale", "")}
    if action.get("type") not in VALID_TYPES:
        return dict(FALLBACK["action"])
    if not isinstance(action.get("params"), dict):
        action["params"] = {}
    action.setdefault("rationale", "")
    return action


def classify_risk(action: dict) -> str:
    """Deterministic risk policy — config thresholds, not prompts."""
    action_type = action.get("type")
    if action_type in config.RISKY_ACTION_TYPES:
        return "risky"
    if action_type == "refund":
        amount = _parse_amount((action.get("params") or {}).get("amount"))
        if amount is None or amount > config.RISK_REFUND_THRESHOLD:
            return "risky"  # unknown amounts fail closed
    return "safe"


def resolver_node(state: TicketState) -> dict:
    approval = state.get("approval")
    is_revision = bool(approval and approval.get("decision") == "rejected")
    revisions = state.get("revisions", 0) + (1 if is_revision else 0)

    passages = "\n".join(
        f"[{p['source']} p.{p['page']}] {p['text']}" for p in state.get("kb_passages", [])
    ) or "(no passages retrieved)"

    prompt = (
        f"{PROMPT_HEADER}\n"
        f"Customer message:\n{state['customer_message']}\n\n"
        f"Ticket category: {state.get('category', 'unknown')}\n\n"
        f"Policy passages:\n{passages}\n"
    )
    if is_revision:
        prompt += (
            f"\nIMPORTANT — your previous proposal was REJECTED by a human supervisor.\n"
            f"Rejection reason: {approval.get('reason') or '(none given)'}\n"
            f"Previous proposal: {state.get('proposed_action')}\n"
            f"Previous draft: {state.get('draft_reply', '')[:500]}\n"
            f"Revise the action and reply to address the rejection reason while staying in policy.\n"
        )

    reply = get_model(json_mode=True).invoke(prompt)
    data = parse_json_or(reply.content, FALLBACK)

    action = _normalize_action(data)
    if action.get("type") == "refund":
        amount = _parse_amount((action.get("params") or {}).get("amount"))
        action["params"] = {**(action.get("params") or {}), "amount": amount}
    draft_reply = data.get("draft_reply") or FALLBACK["draft_reply"]
    risk = classify_risk(action)

    summary = (
        f"{'revised (rev ' + str(revisions) + ')' if is_revision else 'proposed'} "
        f"{action.get('type')} — risk {risk}"
    )
    return {
        "proposed_action": action,
        "draft_reply": draft_reply,
        "risk": risk,
        "revisions": revisions,
        "audit": [audit_entry("resolver", summary, {
            "rationale": action.get("rationale"),
            "rejection_reason": approval.get("reason") if is_revision else None,
        })],
    }
