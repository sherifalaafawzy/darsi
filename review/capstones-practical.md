# Capstones: practicality audit (after instructional rewrite)

Date: 2026-11-05 (Europe/Zurich). Units: `content/units/*-capstone.json`. Starters: `H:\htdocs\darsi-starters\<track>-capstone`. No commit/push/deploy/seed in the Darsi repo.

## Method

For each track: read the unit briefs + starter README/check.py, ask whether a student with only a laptop and internet can finish without guessing, whether tools are free, whether the end is a clear portfolio piece, and whether aisec/cyber stay defence-only. Scores are 1–5 (5 = ready to pilot).

## Per-track verdicts

| Track | Builds | Main skill they leave with | Hours (sum) | Score | Remaining risk |
|---|---|---|---:|---:|---|
| **data** | Weekly open-data pipeline: World Bank + Open-Meteo → DuckDB → quality checks → public report → scheduled Actions + DATA_NOTE + v1.0 | Fetch, model, check, and publish public data with honest sources | ~15 | **5** | GitHub Pages timing; World Bank API occasional timeouts (documented) |
| **ds** | Student-performance study: explore → baseline+3 models → bootstrap CI → fairness gaps → school memo + v1.0 | Honest modelling with uncertainty and fairness, written for a head teacher | ~16 | **5** | ucimlrepo download needs net; memo quality still needs human review |
| **ai** | Arabic sentiment: data card → TF-IDF baseline → CAMeLBERT on free Colab → Egyptian test set → Gradio Space + model card | Ship an Arabic classifier with dialect honesty and a refusal list | ~17 | **4** | Free Colab GPU queues; HF Space cold starts; CAMeLBERT download size |
| **agents** | School-helper agent: MCP tools → LangGraph+traces → allow-list+approval → 20-task eval (0 unapproved writes) → demo + DESIGN.md | Build a tool-using agent that asks before it writes | ~16 | **4** | Local Ollama optional; CI uses fake model (good) but live demo needs a model or recording |
| **aisec** | Own localhost chatbot: scope+threats → garak scan → LLM Guard layers → rescan+Semgrep → report + school policy (Law 151) | Defend an LLM app you own and prove it with the same scan | ~16 | **4** | Ollama install friction; garak runtime; must never leave localhost (scripts enforce) |
| **cyber** | Juice Shop lab: localhost Docker → ZAP baseline → five nginx defences → login detection → runbook+EG-CERT+Arabic poster | Harden and watch a practice web app without touching anyone else's system | ~17 | **4** | Docker Desktop/WSL on school PCs; ZAP image pull size; Wazuh stays optional |
| **code** | Teacher marks tool: stories → test-first core → Typer+RTL report → CI coverage floor → Docker + v1.0 | Ship a small product with tests, CI, and a container | ~15 | **5** | Lowest tool risk; Docker optional path via Codespaces if Desktop blocked |
| **iot** | Classroom weather: **Wokwi first** (or ESP32) → MQTT → dashboard → Open-Meteo compare → heat alert + SAFETY.md | Sense, send, graph, validate, and alert safely (USB only) | ~15 | **5** | Public MQTT test broker for Wokwi path; hardware optional, not required |
| **opt** | Exam timetable: validator first → CP-SAT → weighted wishes → HiGHS cross-check → Streamlit what-if + v1.0 | Model decisions, never trust a solver without an independent check | ~17 | **5** | Solver time limits; highspy wheels rare fail → Codespaces fallback documented |

## What we fixed in this pass

- Every milestone brief now has: why it matters, exact tools (name + how to get + one line), numbered do-this steps with copy-paste commands, done-when checks, 3–5 common errors, and what to understand.
- Setup tabs (Windows / Mac / Codespaces) carry full install commands; per-milestone setup supported.
- Arabic rewritten in Egyptian dialect for the course text of these capstones (user request this turn); glossary terms from `docs/curriculum/ar-lingo.md` kept.
- Bad LTR isolates from the previous pass largely avoided by not nesting Arabic words inside English parentheses; `isolate-code --fix` re-run.
- Starter READMEs rebuilt: Install once, What you will be able to do, full milestone briefs, review note that Darsi never runs student code.
- Iot: Wokwi called out as first-class; `README.wokwi.md` added. Aisec/cyber: defence-only + localhost refusal kept in scripts and briefs.
- Competency codes aligned to real catalogue / s3-check sets. Lesson `minutes` capped at 60 (validator).

## Gaps still for the user

1. Create `darsi-org` and push the nine starters as templates (placeholder URLs already in content).
2. Export `checkCapstone` from `functions/src/index.ts` (other session owns that file).
3. Move `capstoneText.ts` strings into `en.json`/`ar.json` when allowed.
4. Optional: paid Colab Pro is **not** required; document school Wi-Fi blocking of Docker Hub / HF if that shows up in a pilot.
5. Proofread Egyptian Arabic once with a native teacher — generator output is dialectal but long.
