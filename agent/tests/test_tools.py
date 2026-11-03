"""The tutor agent's tools and wiring, without calling Google (agent/.venv/Scripts/python -m pytest agent/tests)."""
import json
from types import SimpleNamespace

import pytest

from darsi_tutor import tools
from darsi_tutor.agent import root_agent
from darsi_tutor.explainer import Explainer


def ctx(state=None, inv="inv-1"):
    return SimpleNamespace(state=dict(state or {}), invocation_id=inv, actions=SimpleNamespace(skip_summarization=False))


def usage(p, c, t=0, cached=0):
    return SimpleNamespace(usage_metadata=SimpleNamespace(prompt_token_count=p, candidates_token_count=c, thoughts_token_count=t, cached_content_token_count=cached))


def test_reply_ends_the_turn_with_scope_and_sources_the_answer_being_the_text_written_before_it():
    c = ctx()
    assert tools.reply(True, ["s1", "s2", "s3", "s4", "s5", "s6"], c) == "sent"
    assert c.state["reply"] == {"inv": "inv-1", "inScope": True, "answer": "", "sources": ["s1", "s2", "s3", "s4", "s5"]}
    assert c.actions.skip_summarization is True
    # An answer the model puts in the argument anyway is kept (the gateway prefers it to the text).
    tools.reply(False, [], c, answer="  Outside your courses. ")
    assert c.state["reply"]["answer"] == "Outside your courses."


def test_usage_adds_up_within_a_turn_counts_thinking_as_output_and_restarts_each_turn():
    c = ctx()
    tools.start_turn(c)
    tools.count_usage(c, usage(1000, 50, t=20))
    c.invocation_id = "inv-explainer"  # the explainer runs under its own invocation, and still adds to this turn
    tools.count_usage(c, usage(1200, 80, cached=900))
    assert c.state["usage"] == {"in": 2200, "cached": 900, "out": 150, "calls": 2}
    tools.start_turn(c)
    tools.count_usage(c, usage(10, 5))
    assert c.state["usage"] == {"in": 10, "cached": 0, "out": 5, "calls": 1}
    assert tools.count_usage(c, SimpleNamespace(usage_metadata=None)) is None


def test_search_sends_the_sessions_course_not_the_models_with_a_token(monkeypatch):
    seen = {}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return json.dumps({"hits": [{"id": "ai-1-1-2-r1", "course": "AI basics", "lesson": "Data", "text": "Models learn from examples."}]}).encode()

    def urlopen(req, timeout):
        seen["url"], seen["body"], seen["auth"] = req.full_url, json.loads(req.data), req.headers["Authorization"]
        return Resp()

    monkeypatch.setattr(tools.urllib.request, "urlopen", urlopen)
    monkeypatch.setenv("TUTOR_SEARCH_TOKEN", "tok")
    out = tools.search_course("how do models learn", ctx({"search_url": "https://x/tutorSearch", "unit_id": "ai-1-1", "org_id": None, "lang": "ar"}))
    assert seen == {"url": "https://x/tutorSearch", "body": {"query": "how do models learn", "unitId": "ai-1-1", "orgId": None, "lang": "ar"}, "auth": "Bearer tok"}
    assert out["result"].startswith("[ai-1-1-2-r1] (AI basics: Data)")


def test_search_failure_reads_as_nothing_found(monkeypatch):
    monkeypatch.setenv("TUTOR_SEARCH_TOKEN", "tok")
    monkeypatch.setattr(tools.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    out = tools.search_course("x", ctx({"search_url": "https://x"}))
    assert out["result"] == tools.NOTHING and "down" in out["error"]
    assert tools.search_course("x", ctx())["result"] == tools.NOTHING  # no search address: nothing to search


def test_the_agent_has_its_tools_and_the_explainer_as_a_tool():
    names = {getattr(t, "name", None) or getattr(t, "__name__", None) for t in root_agent.tools}
    assert {"search_course", "reply", "make_explainer"} <= names
    assert not root_agent.sub_agents  # a tool only, never a hand-off target
    assert next(t for t in root_agent.tools if getattr(t, "name", "") == "make_explainer").agent.output_key == "explainer"


def test_instructions_are_a_function_so_course_code_with_braces_is_safe():
    rules = "COURSE MATERIAL:\nprint({'a': 1})"
    text = root_agent.instruction(SimpleNamespace(state={"tutor_rules": rules}))
    assert text.startswith(rules) and "reply exactly once" in text


@pytest.mark.parametrize("template", ["title-hook", "steps", "flow", "message-mock", "quiz", "summary"])
def test_explainer_schema_takes_every_template(template):
    e = Explainer.model_validate({"title": "Phishing", "scenes": [{"template": template, "narration": "Hello."}]})
    assert e.scenes[0].template == template
    schema = Explainer.model_json_schema()
    assert "canvas" not in json.dumps(schema)  # free canvas scenes stay out until they're checked on phones
