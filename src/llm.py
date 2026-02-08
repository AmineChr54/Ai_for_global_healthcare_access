"""
Centralized LLM Factory — single place to configure and instantiate language models.

All pipeline nodes use this factory instead of creating their own ChatOpenAI instances.
To change the model, temperature defaults, or provider, update this one file.

Rate-limit handling:
    The lite pipeline makes only 2 LLM calls per query. Even on the free
    tier (3 RPM for gpt-4o-mini) this fits comfortably with a small gap.
    We keep a throttle to be safe, but set it to just 3 seconds instead of 21.
"""

from __future__ import annotations

import logging
import threading
import time

from langchain_openai import ChatOpenAI

from src.config import OPENAI_API_KEY, OPENAI_MODEL

logger = logging.getLogger(__name__)

# ── Global rate-limit throttle ───────────────────────────────────────────────
# Free-tier: 3 RPM. With only 2 calls, a 22-second gap guarantees both calls
# fit within the rate window without triggering retries. Total ~50s per query.
# On paid tier (500+ RPM) this is negligible. Set to 1.0 if you upgrade.

_MIN_GAP_SECONDS: float = 22.0
_lock = threading.Lock()
_last_call_time: float = 0.0


def _throttle() -> None:
    """Block until enough time has passed since the last LLM call."""
    global _last_call_time
    with _lock:
        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < _MIN_GAP_SECONDS:
            wait = _MIN_GAP_SECONDS - elapsed
            logger.debug(f"Rate-limit throttle: waiting {wait:.1f}s")
            time.sleep(wait)
        _last_call_time = time.time()


class ThrottledChatOpenAI(ChatOpenAI):
    """ChatOpenAI subclass that applies a global rate-limit throttle before each call."""

    def _generate(self, *args, **kwargs):
        _throttle()
        return super()._generate(*args, **kwargs)


def get_llm(*, temperature: float = 0.0, model: str | None = None) -> ChatOpenAI:
    """
    Return a configured ChatOpenAI instance with rate-limit resilience.

    Args:
        temperature: Sampling temperature (0.0 = deterministic, higher = creative).
        model: Override the default model for this call. If None, uses OPENAI_MODEL.

    Returns:
        A ready-to-use ChatOpenAI instance with retry/backoff + throttling.
    """
    return ThrottledChatOpenAI(
        model=model or OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=temperature,
        max_retries=3,
        request_timeout=120,
    )
