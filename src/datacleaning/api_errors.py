"""Shared helpers for API error handling (e.g. rate limit)."""

try:
    from openai import APIStatusError, RateLimitError
except ImportError:
    RateLimitError = type("RateLimitError", (Exception,), {})
    APIStatusError = type("APIStatusError", (Exception,), {})


def is_rate_limit_error(exc: BaseException) -> bool:
    """True if this is an API rate-limit (429) error."""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) == 429:
        return True
    return False


def format_rate_limit_message(exc: BaseException) -> str:
    """Return the error message from a rate-limit (or any) exception for console output."""
    msg = getattr(exc, "message", None) or getattr(exc, "body", None)
    if isinstance(msg, dict) and "error" in msg:
        err = msg["error"]
        if isinstance(err, dict) and "message" in err:
            return str(err["message"])
        return str(err)
    if msg:
        return str(msg)
    return str(exc) or "Rate limit exceeded (429)."
