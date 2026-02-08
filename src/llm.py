"""
Centralized LLM Factory — single place to configure and instantiate language models.

All pipeline nodes use this factory instead of creating their own ChatOpenAI instances.
To change the model, temperature defaults, or provider, update this one file.

Rate-limit handling:
    The pipeline makes ~8 LLM calls per query (some in parallel). Free-tier
    OpenAI keys often have very low RPM limits (e.g. 3 RPM for gpt-4o).
    We handle this with:
    1. max_retries=8 — lets the OpenAI client auto-retry 429s with exponential backoff
    2. Default model gpt-4o-mini — much higher RPM limits while still being capable
    3. Optional override via OPENAI_MODEL env var
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from src.config import OPENAI_API_KEY, OPENAI_MODEL


def get_llm(*, temperature: float = 0.0, model: str | None = None) -> ChatOpenAI:
    """
    Return a configured ChatOpenAI instance with rate-limit resilience.

    Args:
        temperature: Sampling temperature (0.0 = deterministic, higher = creative).
        model: Override the default model for this call. If None, uses OPENAI_MODEL.

    Returns:
        A ready-to-use ChatOpenAI instance with retry/backoff configured.
    """
    return ChatOpenAI(
        model=model or OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=temperature,
        max_retries=8,
        request_timeout=120,
    )
