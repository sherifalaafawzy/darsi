"""
The tutor's tools. What the learner may see (their course, organization and language) comes from session state, which
the gateway (functions/src/agent.ts) sets when it opens the session; the model only chooses the words to search for.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_response import LlmResponse
from google.adk.tools.tool_context import ToolContext

NOTHING = "Nothing in the learner's courses covers this. It is outside the courses."


def _id_token(audience: str) -> str:
    """A Google-signed ID token for the search function, from this agent's service account (the metadata server)."""
    if os.environ.get("TUTOR_SEARCH_TOKEN"):  # local runs against the emulator
        return os.environ["TUTOR_SEARCH_TOKEN"]
    import google.auth.transport.requests
    import google.oauth2.id_token
    return google.oauth2.id_token.fetch_id_token(google.auth.transport.requests.Request(), audience)


def search_course(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Searches the learner's Darsi courses for the sections that answer a question. Use it whenever the question is not
    answered by the material you already have, and always before saying a question is outside the courses.

    Args:
        query: What to look for, in the learner's words (use the course's own spelling of a term).
    """
    st = tool_context.state
    url = st.get("search_url") or os.environ.get("TUTOR_SEARCH_URL", "")
    if not url:
        return {"result": NOTHING}
    body = json.dumps({"query": query[:300], "unitId": st.get("unit_id"), "orgId": st.get("org_id"), "lang": st.get("lang", "en")}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {_id_token(url)}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            hits = json.loads(r.read().decode()).get("hits", [])
    except Exception as e:  # the answer goes on without the search rather than failing the turn
        return {"result": NOTHING, "error": str(e)[:200]}
    if not hits:
        return {"result": NOTHING}
    return {"result": "\n\n".join(f"[{h['id']}] ({h['course']}: {h['lesson']})\n{h['text']}" for h in hits)}


def reply(in_scope: bool, sources: list[str], tool_context: ToolContext, answer: str = "") -> str:
    """Ends your turn, after you have written your answer as text. Call it exactly once, as your last step, every turn.

    Args:
        in_scope: true only if the answer comes from the course material or search results.
        sources: The section ids (in brackets in the material) the answer used. Empty when out of scope.
        answer: Leave empty: the learner reads the text you wrote before this call (it reaches them as you write it).
    """
    # The answer is normally the turn's streamed text, which the gateway collects; `answer` is only a fallback.
    tool_context.state["reply"] = {"inv": tool_context.invocation_id, "inScope": bool(in_scope), "answer": (answer or "").strip(), "sources": list(sources)[:5]}
    tool_context.actions.skip_summarization = True  # the turn ends here; the gateway reads the reply from state
    return "sent"


def start_turn(callback_context: CallbackContext) -> None:
    """Zeroes the turn's usage when the tutor starts a turn. The explainer runs as a tool under its own invocation id
    (AgentTool), so the count can't be keyed by invocation: it starts here and only ever adds."""
    callback_context.state["usage"] = {"in": 0, "cached": 0, "out": 0, "calls": 0}
    return None


def count_usage(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    """Adds every model call's tokens, the explainer's included (its state comes back through AgentTool), into
    state["usage"] for this turn (the gateway bills it)."""
    u = llm_response.usage_metadata
    if not u:
        return None
    st = callback_context.state
    cur = st.get("usage") or {"in": 0, "cached": 0, "out": 0, "calls": 0}
    cur = {
        **cur,
        "in": cur["in"] + (u.prompt_token_count or 0),
        "cached": cur["cached"] + (u.cached_content_token_count or 0),
        # Thinking is billed as output.
        "out": cur["out"] + (u.candidates_token_count or 0) + (u.thoughts_token_count or 0),
        "calls": cur["calls"] + 1,
    }
    st["usage"] = cur  # reassigned, so the change is recorded in the event's state delta
    return None
