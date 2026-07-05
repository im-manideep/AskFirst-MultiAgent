# Workflow: add a new action type

1. Add a mock executor in `backend/tools/actions.py` (write to the actions log
   only — never a real system) and register it in `EXECUTORS`.
2. Decide its risk class in `backend/config.py` / `resolver.py`'s deterministic
   override (`RISKY_ACTION_TYPES` or an amount threshold).
3. Teach the resolver prompt about the new type (allowed `type` values).
4. If policy governs it, make sure a KB document states the rule so the
   resolver can cite it (regenerate PDFs via `scripts/generate_kb.py`).
5. Test: one safe and one risky ticket exercising the new type
   (`backend/scripts/test_interrupt.py`).
