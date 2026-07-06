"""Provider-swappable chat model. Every agent gets its model from here ONLY.

LLM_PROVIDER=ollama -> local llama3.2:3b (free, dev)
LLM_PROVIDER=openai -> gpt-4o-mini (quality; needs OPENAI_API_KEY in .env)
"""

import json
import re

from backend import config


def parse_json_or(text: str, fallback: dict) -> dict:
    """Parse an LLM JSON reply; fail CLOSED to the caller's safe fallback."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        match = re.search(r"\{.*\}", text or "", re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return fallback


def get_model(json_mode: bool = False):
    if config.LLM_PROVIDER == "openai":
        from langchain_openai import ChatOpenAI

        kwargs = {"model": config.OPENAI_MODEL, "temperature": 0}
        if json_mode:
            # OpenAI requires the word "json" in the prompt when this is set —
            # all our json_mode prompts ask for JSON explicitly.
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kwargs)

    from langchain_ollama import ChatOllama

    kwargs = {"model": config.OLLAMA_MODEL, "temperature": 0}
    if json_mode:
        kwargs["format"] = "json"
    return ChatOllama(**kwargs)
