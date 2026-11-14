"""Logging helpers that never write user data.

Exception messages can carry values (a Pydantic error embeds the input, for
example), so failures are logged as the exception class and the innermost
code location only.
"""

from __future__ import annotations

import traceback


def describe_exception(exc: BaseException) -> str:
    """'ValueError at app/agents/eligibility.py:120 in assess' - no message, no values."""
    frames = traceback.extract_tb(exc.__traceback__)
    if not frames:
        return exc.__class__.__name__
    last = frames[-1]
    path = last.filename
    if "/app/" in path:
        path = "app/" + path.rsplit("/app/", 1)[1]
    return f"{exc.__class__.__name__} at {path}:{last.lineno} in {last.name}"
