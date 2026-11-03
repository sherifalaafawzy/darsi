"""
Deploys the tutor agent to Vertex AI Agent Runtime in Darsi's project (docs/FIREBASE.md §9 "The tutor agent").
Run from agent/ with the personal account's application-default login:
  .venv/Scripts/python deploy.py              first deploy: prints the reasoningEngines id for config/tutor.agentId
  .venv/Scripts/python deploy.py --update ID  a new version of the same agent (same id, same sessions)
It runs as the project's compute service account (no new IAM grant), which also signs its course searches.
"""
from __future__ import annotations

import argparse
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

import vertexai  # noqa: E402

PROJECT = "darsi-f0685"
LOCATION = "europe-west1"
BUCKET = "gs://darsi-f0685-agent"
vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=BUCKET)  # AdkApp reads the project when it's made

from darsi_tutor.app import app  # noqa: E402

ACCOUNT = "836458657044-compute@developer.gserviceaccount.com"

CONFIG = {
    "display_name": "darsi-tutor",
    "description": "Darsi's tutor: answers from the learner's courses and makes Lesson Studio explainers (agent/ in the Darsi repo).",
    "requirements": open("requirements.txt", encoding="utf-8").read().split("\n"),
    "extra_packages": ["darsi_tutor"],
    "staging_bucket": BUCKET,
    "service_account": ACCOUNT,
    "python_version": "3.12",
    # One warm instance: a cold one takes about 5 s. Google doesn't bill idle time between turns (pricing page, 2026).
    "min_instances": 1,
    "max_instances": 5,
    "env_vars": {"TUTOR_MODEL": "gemini-3.8-flash", "TUTOR_MODEL_LOCATION": "global"},
}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--update", help="the reasoningEngines id to update")
    a = p.parse_args()
    CONFIG["requirements"] = [r for r in CONFIG["requirements"] if r.strip() and not r.startswith("#")]
    client = vertexai.Client(project=PROJECT, location=LOCATION)
    if a.update:
        name = f"projects/{PROJECT}/locations/{LOCATION}/reasoningEngines/{a.update}"
        engine = client.agent_engines.update(name=name, agent=app, config=CONFIG)
    else:
        engine = client.agent_engines.create(agent=app, config=CONFIG)
    print("deployed:", engine.api_resource.name)


if __name__ == "__main__":
    main()
