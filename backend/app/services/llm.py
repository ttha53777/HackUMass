"""The single doorway to a language model (ticket T14). Provider: Google Gemini.

Everything the app needs from a model is "fill in this JSON schema", so there is
one call: `generate_json(prompt, schema)`. It returns a validated Pydantic object
or None. None always means "use the template", and every caller has one: with
`LLM_MODE=off`, a missing key, a timeout, an error or bad output, the app behaves
exactly as if no model existed.

`LLM_MODE=off` never imports the Gemini SDK.

Budget: one batched call per specialist run. A call gets CALL_TIMEOUT_SECONDS;
a fast failure is retried once, a timeout is not, so two model-using specialists
stay well inside the 45 s run limit (foundation plan B.5).

Privacy: prompts and responses are never logged; only the error class is.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "gemini-3.5-flash-lite"  # stable, fastest listed (ai.google.dev, 2026-11-14)
CALL_TIMEOUT_SECONDS = 12.0
RETRIES = 1


class LLMClient(Protocol):
    def generate_json(self, prompt: str, schema: type[T]) -> T | None: ...


class GeminiClient:
    def __init__(self, api_key: str, model: str, *, timeout: float = CALL_TIMEOUT_SECONDS,
                 retries: int = RETRIES) -> None:
        # Imported here so that off mode never loads the SDK.
        from google import genai
        from google.genai import types

        self._types = types
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._timeout = timeout
        self._retries = retries

    def generate_json(self, prompt: str, schema: type[T]) -> T | None:
        types = self._types
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
            temperature=0.2,
            http_options=types.HttpOptions(timeout=int(self._timeout * 1000)),
        )
        for attempt in range(self._retries + 1):
            started = time.monotonic()
            try:
                response = self._client.models.generate_content(
                    model=self._model, contents=prompt, config=config
                )
                return schema.model_validate_json(response.text or "")
            except ValidationError:
                logger.warning("model output did not match %s", schema.__name__)
                return None  # a retry rarely fixes a malformed answer; use the template
            except Exception as exc:  # network, quota, timeout, SDK errors
                elapsed = time.monotonic() - started
                logger.warning("model call failed (%s) after %.1fs", exc.__class__.__name__, elapsed)
                if elapsed >= self._timeout * 0.9:
                    return None  # timed out: do not spend the run budget again
        return None


_client: LLMClient | None = None
_resolved = False


def llm_mode() -> str:
    return "live" if os.environ.get("LLM_MODE", "off").strip().lower() == "live" else "off"


def get_llm() -> LLMClient | None:
    """The configured client, or None when wording must come from templates."""
    global _client, _resolved
    if _resolved:
        return _client
    _resolved = True
    if llm_mode() != "live":
        return None
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        logger.warning("LLM_MODE=live but GEMINI_API_KEY is not set; using templates")
        return None
    try:
        _client = GeminiClient(key, os.environ.get("LLM_MODEL", "").strip() or DEFAULT_MODEL)
    except Exception as exc:
        logger.warning("could not start the model client (%s); using templates", exc.__class__.__name__)
        _client = None
    return _client


def set_llm(client: LLMClient | None) -> None:
    """Replace the client (tests). None forces templates."""
    global _client, _resolved
    _client, _resolved = client, True


def reset_llm() -> None:
    """Re-read the environment on the next call (tests)."""
    global _client, _resolved
    _client, _resolved = None, False
