# Deskmate — Support that knows when to ask

A multi-agent customer support system (LangGraph) where risky actions pause
for human approval. A customer message is triaged, researched against the
policy KB, and resolved by AI agents — but refunds over $50, cancellations,
and anything touching stored data **interrupt the graph and wait for a human**
in the approval inbox. The pause is durable: it survives a backend restart.

## Stack
- **Backend**: Python 3.12 (uv), LangGraph 1.x + SQLite checkpointer, FastAPI
  (NDJSON streaming), BM25 retrieval over the Northwind Desk policy PDFs,
  mock action executors, full audit trail.
- **LLM**: provider-swappable via `.env` — `ollama` (llama3.2:3b, local/free)
  or `openai` (gpt-4o-mini).
- **Frontend**: React + TypeScript + Vite + Tailwind, liquid-glass UI.

## Run
```powershell
# one-time
Copy-Item .env.example .env          # then fill OPENAI_API_KEY if using openai
uv sync
uv run python backend/scripts/generate_kb.py

# backend
uv run uvicorn backend.main:app --port 8000

# frontend
cd frontend; npm install; npm run dev
```

See `backend/workflows/run-demo.md` for the demo script.

## Secrets
`.env` is gitignored. Keys never reach the frontend; the frontend talks only
to the backend.
