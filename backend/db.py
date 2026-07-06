"""App-owned SQLite (deskmate.db): tickets, audit, actions.

Separate from LangGraph's checkpoints.db, which this code never touches.
Small, lock-guarded writes — fine on a shared connection.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone

from backend import config

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id TEXT PRIMARY KEY,
    customer_message TEXT NOT NULL,
    status TEXT NOT NULL,               -- running | pending_approval | resolved | escalated | failed
    interrupt_payload TEXT,             -- JSON of the pending approval request
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail TEXT,                        -- JSON
    at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    params TEXT,                        -- JSON
    result TEXT,                        -- JSON receipt
    at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DESKMATE_DB, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        with _conn:
            _conn.executescript(SCHEMA)
    return _conn


def upsert_ticket(ticket_id: str, customer_message: str, status: str = "running") -> None:
    with _lock, get_conn() as conn:
        conn.execute(
            """INSERT INTO tickets (ticket_id, customer_message, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(ticket_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at""",
            (ticket_id, customer_message, status, _now(), _now()),
        )


def set_ticket_status(ticket_id: str, status: str, interrupt_payload: dict | None = None) -> None:
    with _lock, get_conn() as conn:
        conn.execute(
            "UPDATE tickets SET status=?, interrupt_payload=?, updated_at=? WHERE ticket_id=?",
            (status, json.dumps(interrupt_payload) if interrupt_payload else None, _now(), ticket_id),
        )


def get_ticket(ticket_id: str) -> dict | None:
    row = get_conn().execute("SELECT * FROM tickets WHERE ticket_id=?", (ticket_id,)).fetchone()
    return _ticket_dict(row) if row else None


def list_tickets(status: str | None = None) -> list[dict]:
    q = "SELECT * FROM tickets" + (" WHERE status=?" if status else "") + " ORDER BY updated_at DESC"
    rows = get_conn().execute(q, (status,) if status else ()).fetchall()
    return [_ticket_dict(r) for r in rows]


def _ticket_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    if d.get("interrupt_payload"):
        d["interrupt_payload"] = json.loads(d["interrupt_payload"])
    return d


def insert_audit(ticket_id: str, entry: dict) -> None:
    with _lock, get_conn() as conn:
        conn.execute(
            "INSERT INTO audit (ticket_id, agent, summary, detail, at) VALUES (?, ?, ?, ?, ?)",
            (ticket_id, entry.get("agent", "?"), entry.get("summary", ""),
             json.dumps(entry.get("detail") or {}), entry.get("at") or _now()),
        )


def get_audit(ticket_id: str) -> list[dict]:
    rows = get_conn().execute(
        "SELECT agent, summary, detail, at FROM audit WHERE ticket_id=? ORDER BY id", (ticket_id,)
    ).fetchall()
    return [{**dict(r), "detail": json.loads(r["detail"] or "{}")} for r in rows]


def insert_action(ticket_id: str, action_type: str, params: dict, result: dict) -> None:
    with _lock, get_conn() as conn:
        conn.execute(
            "INSERT INTO actions (ticket_id, action_type, params, result, at) VALUES (?, ?, ?, ?, ?)",
            (ticket_id, action_type, json.dumps(params), json.dumps(result), _now()),
        )


def get_actions(ticket_id: str) -> list[dict]:
    rows = get_conn().execute(
        "SELECT action_type, params, result, at FROM actions WHERE ticket_id=? ORDER BY id", (ticket_id,)
    ).fetchall()
    return [
        {**dict(r), "params": json.loads(r["params"] or "{}"), "result": json.loads(r["result"] or "{}")}
        for r in rows
    ]
