"""Form-Fill Agent v2 ("Filler"). Spec: the "Form-Fill Agent v2 - Spec Sheet" doc.

A separate package from `app.execution` (v1): neither imports the other, so either
can be removed without breaking the other.

Phase 1 (this code) is the spike: a cloud or local browser, a CDP screencast pushed
over a WebSocket, and Gemini Computer Use turns whose actions are shown live (cursor,
captions). Consent, extraction, the gate and session-scoped runs come in phases 2-3.
"""
