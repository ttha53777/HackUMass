"""Document Agent: takes a read paper from the inbox into shared state.

The API has already read the file (services/documents.read_document) and put
the extraction, facts only, in the DocumentInbox. This node moves it into
`documents` and queues it for the Profile Agent (user_intelligence), which is
still the only writer of `profile`. Identity details never reach this node.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.graph.state import SafeError, SessionState
from app.services.documents import DocumentInbox

NO_FACTS_MESSAGE = (
    "We couldn't find anything we use in that document. You can type the details in instead."
)
COUNT_MISMATCH_MESSAGE = (
    "The household size on that paper doesn't match the people it lists, so we left it out."
)


def make_document_analysis(inbox: DocumentInbox | None = None):
    def document_analysis(state: SessionState) -> dict[str, Any]:
        evidence = state.get("pending_evidence")
        update: dict[str, Any] = {"pending_evidence": None}
        if evidence is None or evidence.kind != "document" or not evidence.document_ref:
            return update
        now = datetime.now(timezone.utc)
        errors = list(state.get("errors") or [])
        extraction = inbox.pop(evidence.document_ref) if inbox else None
        if extraction is not None:
            update["documents"] = list(state.get("documents") or []) + [extraction]
            if extraction.extracted_facts:
                update["document_queue"] = list(state.get("document_queue") or []) + [extraction.document_id]
            if "household_count_mismatch" in extraction.notes:
                errors.append(SafeError(code="document_count_mismatch", message=COUNT_MISMATCH_MESSAGE,
                                        agent="document_analysis", at=now))
        if extraction is None or not (extraction.extracted_facts or extraction.identity_keys):
            errors.append(SafeError(code="document_no_facts", message=NO_FACTS_MESSAGE,
                                    agent="document_analysis", at=now))
        if len(errors) != len(state.get("errors") or []):
            update["errors"] = errors
        return update

    return document_analysis
