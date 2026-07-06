"""MOCK action executors. They write to the actions log — never real systems."""

import uuid

from backend import db


def _receipt(kind: str, **fields) -> dict:
    return {"mock": True, "kind": kind, "reference": f"{kind}-{uuid.uuid4().hex[:8]}", **fields}


def issue_refund(ticket_id: str, params: dict) -> dict:
    return _receipt("refund", amount=params.get("amount"), currency=params.get("currency", "USD"))


def cancel_plan(ticket_id: str, params: dict) -> dict:
    return _receipt("cancel_plan", plan=params.get("plan"), effective=params.get("effective", "next_renewal"))


def close_account(ticket_id: str, params: dict) -> dict:
    return _receipt("close_account", data_deletion_in_days=30)


def reset_password(ticket_id: str, params: dict) -> dict:
    return _receipt("reset_password", link_expires_minutes=60)


def send_reply(ticket_id: str, params: dict) -> dict:
    return _receipt("send_reply", chars=len(params.get("body", "")))


EXECUTORS = {
    "refund": issue_refund,
    "cancel_plan": cancel_plan,
    "close_account": close_account,
    "reset_password": reset_password,
    "answer": send_reply,
}


def execute(ticket_id: str, action: dict, draft_reply: str) -> list[dict]:
    """Run the proposed action, then send the reply. Everything is logged."""
    receipts = []
    action_type = action.get("type", "answer")
    params = action.get("params") or {}
    if action_type == "answer":
        params = {"body": draft_reply}

    executor = EXECUTORS.get(action_type, send_reply)
    receipt = executor(ticket_id, params)
    log_params = {**params, "body": params["body"][:200]} if "body" in params else params
    db.insert_action(ticket_id, action_type, log_params, receipt)
    receipts.append(receipt)

    if action_type != "answer":  # "answer" already sent the reply above
        reply_receipt = send_reply(ticket_id, {"body": draft_reply})
        db.insert_action(ticket_id, "send_reply", {"body": draft_reply[:200]}, reply_receipt)
        receipts.append(reply_receipt)
    return receipts
