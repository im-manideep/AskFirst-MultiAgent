# Workflow: run the demo

1. Ollama must be running with the dev model: `ollama list` shows `llama3.2:3b`
   (or set `LLM_PROVIDER=openai` + `OPENAI_API_KEY` in `.env` for quality).
2. Backend: `uv run uvicorn backend.main:app --port 8000`
3. Frontend: `cd frontend; npm run dev` → http://localhost:5173
   (if 5173 is taken by another Vite app, it serves on 5174 — proxy still works)
4. Demo script:
   - Click preset "How do I reset my password?" → pipeline flows straight
     through, policy-grounded reply, no pause.
   - Click preset "double-charged, refund $600" → pipeline PAUSES at Approval.
   - (Optional) restart the backend here — the pause survives.
   - Open Approvals, approve it → timeline resumes, mock refund executes.
   - Reject flow: submit "cancel my plan", reject twice with reasons →
     escalates gracefully.
5. Audit: open the ticket detail page — every step, passage, and decision.

## Verification without the UI
- `curl.exe -N -X POST http://127.0.0.1:8000/tickets -H "Content-Type: application/json" -d "{\"customer_message\": \"refund my $600 charge\"}"`
- `curl.exe http://127.0.0.1:8000/approvals`
- `curl.exe -N -X POST http://127.0.0.1:8000/approvals/<ticket_id> -H "Content-Type: application/json" -d "{\"decision\": \"approved\"}"`
