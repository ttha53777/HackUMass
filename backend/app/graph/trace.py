"""The loop record ("How we got here"): one TraceEvent per routing step.

Codes, node names and field names only. Never a value, an answer, a file name
or any document text, so the trace is safe to show and to checkpoint.
"""

from __future__ import annotations

from typing import Any

from app.graph.state import TRACE_LIMIT, SessionState, TraceEvent


def append(state: SessionState, update: dict[str, Any], **event: Any) -> None:
    """Add one event to `update["trace"]` (building on any already added there)."""
    trace = list(update.get("trace") if "trace" in update else state.get("trace") or [])
    seq = trace[-1].seq + 1 if trace else 1
    invoke = update.get("invoke_count", state.get("invoke_count") or 0)
    trace.append(TraceEvent(seq=seq, invoke=invoke, **event))
    update["trace"] = trace[-TRACE_LIMIT:]


def finished_event(name: str, state: SessionState, update: dict[str, Any]) -> dict[str, Any]:
    """What a specialist did, as counts and field names."""
    if name == "user_intelligence":
        fields = list(update.get("changed_fields") or [])
        return {"fields": fields, "count": len(fields)}
    if name == "document_analysis":
        docs = update.get("documents") or []
        before = len(state.get("documents") or [])
        new = docs[before:] if len(docs) > before else []
        fields = sorted({f for d in new for f in d.extracted_facts})
        return {"fields": fields, "count": len(fields)}
    if name == "program_discovery":
        return {"count": len(update.get("programs") or [])}
    if name == "eligibility":
        return {"count": len(update.get("eligibility_assessments") or {})}
    if name == "action_planning":
        return {"count": len(update.get("action_plan") or [])}
    return {}
