# Prelive: Darsi capstones (local only) — 2026-11-06 Europe/Zurich

## Scope
LOCAL ONLY. No prod seed, no darsi app commit/push. Created NEW public template repos under `darsi-org` as requested.

## 1) Content dedupe (all 9 capstone units)
Updated via `scripts/rebuild-capstones-dedupe.py` (from prior 3-page rebuild).

| Stage | Kept | Removed |
|-------|------|---------|
| 1. Project description | why / what / hours+outcome / starter URL text link | template screenshot, stage-map narration ("Stage 1/2/3"), milestone summary checklist |
| 2. Starter | multi-step setup with photos under `/media/capstone-shared/` (account → template → Codespaces → local → install → check.py → short done) + track extras (Colab/Juice/Wokwi) | "Stage 2 is only setup…" meta; stage-3 pitch in check/done |
| 3. Project submission | what to send + Actions/Release photos + milestone project steps | "FINAL stage" framing; full re-setup (pip/venv click paths) — setup tabs now point back to Starter only |

Plain ReadingBody (no `##` / `**`). Egyptian Arabic preserved. Kits refreshed: **162 files** for 9×3 lessons. `apps/web/public/content/dev-catalog.json` updated (`kind: capstone`, `lessons: 3`).

Units: agents, ai, aisec, code, cyber, data, ds (starter repo `data-science-capstone`), iot, opt.

## 2) No score on project parts
`apps/web/src/screens/LessonScreen.tsx`:
- Passes `unitKind={unit.kind}` into `LessonPlayer`
- On complete: if `unitKind === "capstone"` OR lesson has no graded steps → `stats={[]}` (no XP / accuracy / time flash)
- Normal quiz lessons unchanged (`showScore` when graded steps exist)

## 3) GitHub template repos (darsi-org)
All **public**, **is_template=true**, default branch `main`, pushed from `H:\htdocs\darsi-starters`.

| Repo | Clone URL | Template |
|------|-----------|----------|
| agents-capstone | https://github.com/darsi-org/agents-capstone.git | yes |
| ai-capstone | https://github.com/darsi-org/ai-capstone.git | yes |
| aisec-capstone | https://github.com/darsi-org/aisec-capstone.git | yes |
| code-capstone | https://github.com/darsi-org/code-capstone.git | yes |
| cyber-capstone | https://github.com/darsi-org/cyber-capstone.git | yes |
| data-capstone | https://github.com/darsi-org/data-capstone.git | yes |
| data-science-capstone | https://github.com/darsi-org/data-science-capstone.git | yes |
| iot-capstone | https://github.com/darsi-org/iot-capstone.git | yes |
| opt-capstone | https://github.com/darsi-org/opt-capstone.git | yes |

HTTPS pages return 200; README + check.py + requirements.txt present on each (verified via API).

### Dry check (data-capstone)
Local venv + `pip install -r requirements.txt` + `python check.py`:
- Runs cleanly; writes `darsi-check.json`
- Milestones m1–m5 correctly report "not yet" on a fresh starter (expected)
- Secret scan check passes

## 4) Local preview tests (http://localhost:4173) — NOT go-live
- `/learn` → 200
- `/content/dev/{all 9}-capstone.json` → 200; kind=capstone; 3 lessons titled 1/2/3
- Capstone media JPGs under `/media/capstone-shared/` → 200
- No markdown leaks (`##`/`**`) in description/starter/submission bodies
- Description has starter URL, no template screenshot / stage map / milestone dump
- Starter multi-step images load
- Submission has Actions + Release figures; no pip re-setup
- Sample routes 200:  
  - http://localhost:4173/lesson/data-capstone/data-capstone-description  
  - http://localhost:4173/lesson/data-capstone/data-capstone-starter  
  - http://localhost:4173/lesson/data-capstone/data-capstone-submission  
  - http://localhost:4173/unit/data-capstone  
- Spot-checked ai, cyber, ds in addition to data

### Manual UI note
Finish description/starter in the browser to confirm LessonComplete shows **no XP/accuracy** (code path verified; SPA complete screen not automated here).

## Blockers / follow-ups
- None for local content + repos.
- **Do not** `npm run seed` / prod deploy / commit darsi app until Sherif explicitly asks.
- Optional: Playwright finish-lesson assertion for empty stats; dry `check.py` on remaining tracks.

## Files touched (local darsi working tree only)
- `content/units/*-capstone.json` (9)
- `apps/web/public/content/dev-catalog.json`
- `content/kits/*-capstone-*` (162 kit files)
- `apps/web/src/screens/LessonScreen.tsx`
- `scripts/rebuild-capstones-dedupe.py`