"""
The explainer: an agent the tutor calls as a tool (AgentTool), that turns a topic into a short Lesson Studio lesson (4–6 scenes) the phone's
light player draws, a few KB of JSON instead of a video file. The scenes are flat here (one shape for every template, so
the model fills a simple schema); the gateway (functions/src/explainer.ts) turns them into Lesson Studio scenes, then
checks the package with Lesson Studio's own validatePackage and times it with estimateTiming.
"""
from __future__ import annotations

from typing import Literal, Optional

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types
from pydantic import BaseModel, Field

from .tools import count_usage

# The player's own icons (Lesson Studio CoreIcon), so an explainer never needs the shared library.
Icon = Literal["user", "page", "bot", "server", "data", "lock", "shield", "phone", "mail", "link", "warning", "key", "cloud", "chip", "wifi", "check", "cross", "spark"]


class ExplainerRequest(BaseModel):
    topic: str = Field(description="What to explain, in the learner's words")
    key_points: list[str] = Field(description="The 2 to 5 points from the course material the explainer must make, in order")


class FlowNode(BaseModel):
    id: str = Field(description="Short id, letters and digits")
    label: str = Field(description="One to three words")
    icon: Optional[Icon] = None
    tone: Optional[Literal["neutral", "trusted", "system", "danger"]] = None


class FlowEdge(BaseModel):
    source: str = Field(description="The id of the node it starts at")
    target: str = Field(description="The id of the node it goes to")
    label: Optional[str] = Field(default=None, description="One to three words")


class Message(BaseModel):
    kind: Literal["sms", "chat", "email"]
    sender: str
    subject: Optional[str] = None
    lines: list[str] = Field(description="1 to 4 short lines")
    link: Optional[str] = None
    flag: Optional[str] = Field(default=None, description="A warning sign to point at, two to four words")
    flag_line: Optional[int] = Field(default=None, description="The 0-based line the flag points at")


class Option(BaseModel):
    id: str = Field(description="a, b, c or d")
    text: str


class Question(BaseModel):
    prompt: str
    options: list[Option] = Field(description="3 or 4 options")
    answer: str = Field(description="The id of the right option")
    explain: str = Field(description="One sentence on why it is right")


class Scene(BaseModel):
    template: Literal["title-hook", "steps", "flow", "message-mock", "quiz", "summary"]
    narration: str = Field(description="What the tutor says during this scene: one to three short sentences, the learner's language")
    title: Optional[str] = Field(default=None, description="Up to six words")
    kicker: Optional[str] = Field(default=None, description="title-hook only: a few words above the title")
    hook: Optional[str] = Field(default=None, description="title-hook only: one short line under the title")
    icon: Optional[Icon] = Field(default=None, description="title-hook only")
    items: Optional[list[str]] = Field(default=None, description="steps: 2 to 5 steps; summary: 2 to 4 points. A few words each")
    reveal_words: Optional[list[str]] = Field(default=None, description="steps and summary: for each item, one word from this scene's narration that is said when it should appear")
    takeaway: Optional[str] = Field(default=None, description="summary only: one line to remember")
    nodes: Optional[list[FlowNode]] = Field(default=None, description="flow only: 2 to 5 nodes")
    edges: Optional[list[FlowEdge]] = Field(default=None, description="flow only")
    message: Optional[Message] = Field(default=None, description="message-mock only")
    question: Optional[Question] = Field(default=None, description="quiz only")


class Explainer(BaseModel):
    title: str = Field(description="Up to six words")
    scenes: list[Scene] = Field(description="4 to 6 scenes: start with title-hook, end with summary; at most one quiz")


def _instruction(ctx: ReadonlyContext) -> str:
    lang = ctx.state.get("lang", "en")
    speak = ("Write in Egyptian Arabic (العامية المصرية), warm and simple; keep technical terms as the course writes them."
             if lang == "ar" else "Write clear, simple English.")
    return "\n\n".join([
        "You make short animated explainers for Darsi, a learning app for teachers and students on low-cost phones.",
        "Make one explainer of 4 to 6 scenes about the topic you are given, using only facts from the COURSE MATERIAL below. "
        "Start with a title-hook scene and end with a summary scene. Use steps for a sequence, flow for how something moves "
        "between people or machines, message-mock for a message the learner might receive, and at most one quiz.",
        f"LANGUAGE: {speak} Every narration and on-screen text is in that language.",
        "SCREEN TEXT is short: titles up to six words, items a few words. The narration says more than the screen shows. "
        "Narration is spoken: no lists, symbols or markdown. Fill only the fields of each scene's template.",
        "Never include personal information.",
        "COURSE MATERIAL:",
        ctx.state.get("material", ""),
    ])


def make(model) -> LlmAgent:
    return LlmAgent(
        name="make_explainer",
        model=model,
        description=("Draws a short animated explainer (4 to 6 scenes) on the learner's board. Call it only after you have said you will "
                     "show it on the board, and only when the learner asked to be shown."),
        instruction=_instruction,
        input_schema=ExplainerRequest,
        output_schema=Explainer,
        output_key="explainer",
        after_model_callback=count_usage,
        generate_content_config=types.GenerateContentConfig(temperature=0.5, max_output_tokens=4000, thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)),
    )
