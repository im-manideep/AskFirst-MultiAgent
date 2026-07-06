

<img width="1907" height="857" alt="001" src="https://github.com/user-attachments/assets/f0027766-0291-4e53-86e1-6c4c78a327c2" />

<img width="1912" height="862" alt="002" src="https://github.com/user-attachments/assets/a0cf4fbb-cba0-4115-9699-48f075372bc5" />

<img width="1906" height="857" alt="003" src="https://github.com/user-attachments/assets/4c7251af-248b-487c-ace5-05f40a05a70b" />

<img width="1901" height="857" alt="004" src="https://github.com/user-attachments/assets/a9e07cfd-cce7-4b59-9202-33e42bef5dba" />

<img width="1896" height="807" alt="005" src="https://github.com/user-attachments/assets/3ed9ac8d-efda-47b3-bab3-a0e6f9a50c2a" />

<img width="1912" height="845" alt="006" src="https://github.com/user-attachments/assets/c56cc04b-cab8-4af5-9e2c-0d7db5dc020a" />



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

The app serves at http://localhost:5173 (Vite picks 5174 if 5173 is busy —
the `/api` proxy works either way).

See `backend/workflows/run-demo.md` for the demo script.

## Backend test scripts (run from the project root)
```powershell
uv run python -m backend.scripts.smoke_graph "How do I reset my password?"
uv run python -m backend.scripts.test_interrupt start   # pause → new process → resume
uv run python -m backend.scripts.test_escalation        # deterministic routing proof
```

## Secrets
`.env` is gitignored. Keys never reach the frontend; the frontend talks only
to the backend.
