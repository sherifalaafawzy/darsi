"""
Darsi's tutor, an ADK agent deployed on Vertex AI Agent Runtime (agent/deploy.py). It answers typed questions from the
learner's courses and makes explainers; the voice tutor (functions/src/relay.ts) calls it for explainers too.

Who may ask, Super and the credits are checked by the gateway (functions/src/agent.ts) before every call: Agent Runtime
doesn't see Darsi's users. The gateway opens each session with this state:
  tutor_rules  the tutor's rules and the lesson material (functions/src/tutorCore.ts `instructions`, one source for both engines)
  material     the lesson material alone, for the explainer
  lang         "en" or "ar"
  unit_id, org_id, search_url   what search_course may search, and where
"""
from __future__ import annotations

import os

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models import Gemini
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

from . import explainer
from .tools import count_usage, reply, search_course, start_turn

MODEL = os.environ.get("TUTOR_MODEL", "gemini-3.8-flash")
# Agent Runtime runs in europe-west1; the Flash models are called on Google's global endpoint (cheapest, most capacity).
model = Gemini(model=MODEL, client_kwargs={"enterprise": True, "location": os.environ.get("TUTOR_MODEL_LOCATION", "global")})

HOW = """HOW YOU WORK:
- The learner's message may come with SECTIONS THAT MAY HELP, found in their courses for this question. Use them like the course material.
- If neither answers the question, call search_course before deciding it is outside the courses.
- When the learner asks to be shown something, or when a process, a flow or a message is clearly easier to see than to read, call make_explainer with the topic and the key points from the material; then say in your answer that the explainer is ready to watch.
- Finish every turn by calling reply exactly once. Out of scope: in_scope false, the answer one kind sentence, no sources."""


def _instruction(ctx: ReadonlyContext) -> str:
    # A function, not a template: course text can hold braces (code), which a template would try to fill.
    return f"{ctx.state.get('tutor_rules', '')}\n\n{HOW}"


root_agent = LlmAgent(
    name="darsi_tutor",
    model=model,
    description="Darsi's tutor: answers from the learner's courses and makes short animated explainers.",
    instruction=_instruction,
    # The explainer is a tool, not a sub-agent: as a sub-agent it was also offered as a hand-off target, and the model
    # used both (two explainers, 140 s). AgentTool forwards its state (the explainer, the usage) to this session.
    tools=[search_course, reply, AgentTool(explainer.make(model))],
    before_agent_callback=start_turn,
    after_model_callback=count_usage,
    generate_content_config=types.GenerateContentConfig(temperature=0.4, max_output_tokens=1500, thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)),
)
