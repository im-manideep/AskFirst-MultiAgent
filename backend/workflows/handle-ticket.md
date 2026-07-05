# Workflow: handle a ticket

1. Ticket arrives via `POST /tickets` with a `customer_message`; a `ticket_id`
   becomes the LangGraph `thread_id`.
2. **Triage** classifies category (billing/technical/account), urgency, and a
   preliminary risk read.
3. **Retrieval** pulls top BM25 passages from the KB PDFs (source + page kept).
4. **Resolver** proposes an action `{type, params, rationale}` grounded in the
   passages and drafts the reply. Risk is decided deterministically in code:
   refund > RISK_REFUND_THRESHOLD, cancel_plan, close_account, delete_data ⇒ risky.
5. **Risk gate**: safe → execute; risky → `interrupt()` pauses the graph.
   The ticket shows up in `GET /approvals`.
6. Human decision via `POST /approvals/{ticket_id}`:
   - approved → execute (mock action) → resolved.
   - rejected (+reason) → resolver revises (max MAX_REVISIONS) → gate again;
     revisions exhausted → escalate.
7. Every node appends to the audit trail; inspect via `GET /audit/{ticket_id}`.

## Lessons
- A paused ticket survives a backend restart: state lives in `checkpoints.db`.
- On resume, the approval node re-runs from its top — keep side effects after
  the `interrupt()` call.
