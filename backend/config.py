"""Central configuration. Risk thresholds live here (env-driven), never in prompts."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Risk policy (see CLAUDE.md): refunds above the threshold, and any of the
# action types below, require human approval before execution.
RISK_REFUND_THRESHOLD = float(os.getenv("RISK_REFUND_THRESHOLD", "50"))
RISKY_ACTION_TYPES = {"cancel_plan", "close_account", "delete_data"}
MAX_REVISIONS = int(os.getenv("MAX_REVISIONS", "2"))

CHECKPOINT_DB = PROJECT_ROOT / "checkpoints.db"   # LangGraph-owned (pause/resume)
DESKMATE_DB = PROJECT_ROOT / "deskmate.db"        # app-owned (tickets/audit/actions)
KB_DIR = Path(__file__).resolve().parent / "kb"
