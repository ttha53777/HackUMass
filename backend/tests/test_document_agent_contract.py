"""Phase 2 contracts: the Document Agent node is registered but not yet routed to."""

from app.api.schemas import ReviewIn, SessionSnapshot
from app.graph.administrator import DOCUMENT_ANALYSIS, SPECIALISTS
from app.graph.build import RECURSION_LIMIT, build_graph
from app.graph.state import DocumentExtraction, Fact, TraceEvent
from app.services.session_store import get_checkpointer


def _noop(state):
    return {}


def test_graph_registers_the_document_agent():
    graph = build_graph(
        checkpointer=get_checkpointer(),
        user_intelligence=_noop, discovery=_noop, eligibility=_noop, action_planning=_noop,
    )
    assert DOCUMENT_ANALYSIS in graph.get_graph().nodes
    assert DOCUMENT_ANALYSIS not in SPECIALISTS  # dormant until decide() routes to it


def test_recursion_budget_covers_five_nodes():
    # 5 nodes x 2 runs x (node + administrator) + the first administrator step.
    assert 5 * 2 * 2 + 1 <= RECURSION_LIMIT


def test_new_fields_have_safe_defaults():
    ext = DocumentExtraction(document_id="d1", filename="x.pdf", status="extracted")
    assert ext.kind is None and ext.notes == [] and ext.identity_keys == []
    assert Fact.model_fields["source"].default is None
    assert TraceEvent(seq=1, invoke=1, step="routed", node="administrator").fields == []
    snap = SessionSnapshot(session_id="s", phase="intake")
    assert snap.pending_reviews == [] and snap.trace == []
    assert ReviewIn(document_id="d1").accept == []
