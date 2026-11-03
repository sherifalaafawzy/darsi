"""The object Agent Runtime serves (agent/deploy.py points at it): the tutor wrapped as an AdkApp, with Agent Runtime Sessions."""
from vertexai.agent_engines import AdkApp

from .agent import root_agent

app = AdkApp(agent=root_agent)
