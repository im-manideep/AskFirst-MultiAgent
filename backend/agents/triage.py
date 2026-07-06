"""Triage agent: category + urgency + a preliminary risk read."""

from backend.state import TicketState, audit_entry
from backend.tools.llm import get_model, parse_json_or

VALID_CATEGORY = {"billing", "technical", "account"}
VALID_URGENCY = {"low", "medium", "high"}

# Fail closed: an unparseable classification goes to a human-reviewed path.
FALLBACK = {"category": "billing", "urgency": "medium", "risk": "risky"}

PROMPT = """You are the triage agent for Northwind Desk customer support.
Classify the customer message below. Respond with ONLY a JSON object shaped exactly like:
{"category": "billing", "urgency": "medium", "risk": "safe"}

Rules:
- "category" is one of: "billing", "technical", "account".
- "urgency" is one of: "low", "medium", "high".
- "risk" is "risky" if the message asks for a refund, plan cancellation, account
  closure, or deletion of data — anything a human should approve first.
  Otherwise "safe".

Customer message:
"""


def triage_node(state: TicketState) -> dict:
    message = state["customer_message"]
    reply = get_model(json_mode=True).invoke(PROMPT + message)
    data = parse_json_or(reply.content, FALLBACK)

    category = data.get("category") if data.get("category") in VALID_CATEGORY else FALLBACK["category"]
    urgency = data.get("urgency") if data.get("urgency") in VALID_URGENCY else FALLBACK["urgency"]
    risk = "risky" if data.get("risk") == "risky" else ("safe" if data.get("risk") == "safe" else "risky")

    return {
        "category": category,
        "urgency": urgency,
        "risk": risk,
        "audit": [audit_entry(
            "triage",
            f"classified as {category}/{urgency}, preliminary risk {risk}",
            {"message": message[:200]},
        )],
    }
