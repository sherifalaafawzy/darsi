# Darsi: handoff for the next agent

Written 2026-10-29, 20:05 local time, for whoever continues the work, including a bot reached through ngrok.

Read in this order: this file, then `CLAUDE.md` (conventions and live state), `TECHNICAL.md`, `docs/CURRICULUM.md` and `docs/CONTENT.md`. The video side is in `H:\htdocs\lessonstudio\HANDOFF.md`.

**If you only have Lesson Studio's MCP tools (over ngrok),** you can read, check and edit lessons. You cannot run the build steps below (narration, rendering, Darsi imports, seeding). Those need a shell on the PC, so hand them back to the user.

## Rules that must not be broken
- **Secrets:** never read or print `apps/web/.env.local`, `.secrets/`, Lesson Studio's `.env.local`, API keys or tokens. Never put a key in a reply or a file.
- **Commits:** only when the user asks. Use the repo-local identity Sherif Alaa Fawzy <sherifalaafawzy@gmail.com>, never the global one. Nothing has been committed today: `git status` shows 454 changed or new entries.
- **Deploys and live changes:** Hosting, functions, rules and live seeding only with the user's explicit go-ahead. Emulators are fine.
- **Firebase and gcloud:** always pass `--account=sherifalaafawzy@gmail.com`. Never the work account.
- **Publishing:** never publish live, and never push lessons into the live Lesson Studio, without asking.
- **Narration costs money.** Lesson Studio's `.cache/narrate/` holds audio already paid for. Never delete it.
- **Locks:** narration and seeding take turns. Narration: `H:/htdocs/lessonstudio/out/locks/narrate`, taken with `mkdir` and released when done. Seed: `H:/htdocs/lessonstudio/out/locks/seed`. Before you remove someone else's lock, check that its process has stopped. If unsure, ask the user.
- **Scratch files** go on H:, never the C: temp folder (C: has filled up before). Write scripts with the file tool; shell heredocs mangle backslashes on this PC.
- **Arabic:** never "·" as a separator; use "،" or `common.sep`. Code and formulas inside Arabic text sit in left-to-right isolates (see below).
- **Security content teaches defence only.** Light theme only. Startup stays at 4 files, and guests never load Firebase (`CLAUDE.md`).
- Pin dependency versions at least two weeks old.

## The goal
Five new tracks: Programming (`code`), Data engineering (`data`), AI agents (`agents`), Optimization (`opt`) and AI security (`aisec`). Each has four teacher levels and four school-stage student courses, so 40 courses. Each course is four lessons plus a unit check, with a voiced video in English and Egyptian Arabic, a Labs app, code exercises that run on the phone, and placement questions. The approved plan is `~/.claude/plans/velvet-mapping-key.md` (the user's Claude plans folder). The eight built-in tracks are defined in `apps/web/src/content/tracks.ts`.

## Where each track stands (checked 2026-10-29, 20:05)

| Track | Courses | Videos narrated and rendered | Units test (`course <track>-`) | Placement file | Status |
|---|---|---|---|---|---|
| data | 8 | 32 of 32 | 56 passed | `content/placement/data.json` (24) | Done apart from the placement merge. Seeded to the emulators as v1. Browser check done. |
| opt | 8 | 32 of 32 | 56 passed | `content/placement/opt.json` (24) | Done apart from the placement merge. Seeded to the emulators (`opt-1-1` v2, the rest v1). Browser check done. |
| aisec | 8 | 32 of 32 | 56 passed | `content/placement/aisec.json` (24) | Done apart from the placement merge. Seeded to the emulators as v1. Browser check done. |
| agents | 8 | 32 of 32 narrated; packaged, rendered and imported (`out/agents-tmp/post/watch.log`: 0 failures) | 56 passed | `content/placement/agents.json` (24) | Media is in place. Still to do: check the final `isolate-code --fix`, seed, and the browser check. Its agent stopped at the account's weekly usage limit (resets Oct 31, 10:00 Europe/Zurich) and wrote no final report. |
| code | 8 | **In progress.** Narration round 1 reached `code-3-1-4` at 20:01 (20 of 32 attempted). It holds the narration lock. | not yet (no media) | `content/placement/code.json` (24) | Next: finish narration, then the rendering run below, then the checks. |

- Kits exist for all 40 lessons of each track (`content/kits/`). Rebuild them after any unit change.
- The unit files were generated from sources outside the repo. Those are `H:\htdocs\lessonstudio\out\data-work`, `out\aisec-src`, `out\code-tmp\units` and `out\agents-tmp\work`, plus opt's drafts in `H:\tmp\darsi-opt`. Keep them. A regeneration overwrites hand edits to the JSON, so use one method or the other. After any rebuild, run `import-media`, then `isolate-code --fix`, then the kits.
- `apps/web/public/content/placement.json` (version 2, 72 questions for AI, IoT and cyber) is not yet merged with the five track files.

## Decisions only the user can make (do not decide these yourself)
1. **Readability on upright phones.** Video text on canvas scenes renders at 7–9 px on a phone. Options: portrait layouts for canvas scenes (my suggestion), or bigger text only. This blocks the final video review.
2. **Darsi Tiny.** v3 is the shipped model. v5 was trained and measured in a separate folder and is not shipped. It passes all four gates. It picks tools better on new wordings, especially Arabic (70% against 51% on the "fresh" set). But it asks before acting less often on new wordings (90% to 72% in English) and says "I can't" less often (100% to 80%). Five Labs tests check v3's exact outputs and would need re-pinning. Options: ship v5, keep v3, or try v6. Do not switch the shipped model without the answer.
3. **Training process PID 42500.** It is `python train.py --steps 16000 --out out/ckpt.pt` in `tools/tinylm`, started 16:49 the day before. Its parent has gone, it holds about 15 GB, and it uses one core. Do not end it without the user's word.

## Steps to finish, in order
1. **Code narration and rendering.** Narration runs from `out/code-tmp/gen/narrate-all.sh`, and its log is `out/code-tmp/narrate.log`. It does not start the next step. When it has released the lock and every code lesson has both audio files, run `bash H:/htdocs/lessonstudio/out/code-tmp/gen/media-all.sh` by hand. That script packages and renders every lesson at 240p (English and Egyptian Arabic), imports the media, rebuilds the units, runs the isolates, rebuilds the kits, and ends by printing the kits' page counts (`out/code-tmp/checks/kitpages.mjs`). Its log is `out/code-tmp/media.log`. Look there for failures. Re-run narration for any lesson that is still missing audio, under the lock.
2. **Checks per track** (in `H:\htdocs\darsi`, unless noted):
   - `node scripts/isolate-code.mjs --fix <units>`
   - `cd apps/web && npm run kits -- <units>`
   - `cd apps/web && npx vitest run tests/units.test.ts -t "course <track>-"`. Expect 56 passed for each track.
   - Seed to the emulators under the seed lock: `npm run seed -- --emulator --replace <units>`. This needs JDK 21 and the emulators. See `docs/FIREBASE.md`, "Local development with the emulators". On this PC, set `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Public`.
   - Browser check at 375 px on `http://localhost:5173` (`npm run dev`): one lesson per course in English and one in Arabic. The light lesson must play with voice and captions, the lab must open, the code steps must show "Correct!", there must be no page errors, and the Firebase SDK must not download for a guest. Playwright scripts from earlier runs: `H:\htdocs\lessonstudio\out\data-work\e2e.mjs` (data), `H:\htdocs\lessonstudio\out\aisec-src\browse.mjs` (aisec), and the opt scripts in `H:\tmp\darsi-opt`.
3. **Placement.** Merge the five track files into `apps/web/public/content/placement.json`, making it version 3 (72 + 120 = 192 questions). The track files have the same shape: `{ "questions": [...] }`, with ids `<track>-t<level>-<n>` for teachers and `<track>-s<level>-<n>` for students. `tests/placement.test.ts` checks the rules but does not read the track files yet, so extend it to cover all eight tracks. Then run `cd apps/web && npx vitest run tests/placement.test.ts`.
4. **Full checks** (`H:\htdocs\darsi`): `npm run typecheck`, `npm run lint:css`, `npm test`, the functions tests (see `functions/package.json`), the design-system contrast check, and `npm run e2e` (it builds a private copy first; set `CHROMIUM_PATH` to the installed chromium-1243 `chrome.exe`, as `CLAUDE.md` says). Measure the startup bundle: it must stay at 4 files.
5. **Older tracks' fitting pass** (approved, not started). The student courses `ai-s1…s4`, `cyber-s1…s4` and `iot-s1…s4` should fit their school stages: `s1` simpler, for ages 9–12; `s3` and `s4` deeper, with `s4` at university level. Add code where it fits: AI levels 3–4 (a perceptron and gradient descent with `ulab`), IoT levels 2–4 (the virtual board), cyber levels 3–4 (a password checker, Caesar, hashing). Re-voice only the narration that changes.
6. **Live publish, only with the user's go-ahead.** Seed live with `npm run seed -- <units>`, which uses the personal account's application-default login (`CLAUDE.md`). Then deploy functions and Hosting the way the earlier deploys did (`CLAUDE.md`, "Firebase project"). Afterwards check the live catalog, and check that a guest still never loads the Firebase SDK.
7. **Docs.** Update `TECHNICAL.md` (tracks, code steps, Labs, languages), `docs/CURRICULUM.md` and `CLAUDE.md` item 19. Do this after the work is verified.
8. **Commit** only when the user asks.

## Shared problems not yet fixed
- **Text below 32 px in the converter's templates** (Lesson Studio, `scripts/darsi/convert.ts`). Every lesson shows the layout-check errors for these: title kicker 26 px, quiz title 26 px, quiz option letters, steps numbers 30 px, card labels 24–27 px, comparison items 30 px, flow nodes 28 px, chart values and units 24–26 px, code captions 28 px. This waits on decision 1. Some tracks work around it with lists and tables in their storyboards.
- **Plot tick labels at 28 px** in the science plot code (Lesson Studio, `packages/player/src/science/`). aisec-s4-3's ticks were fixed in the player. Check the rest.
- **Knapsack pack truck** squeezes its rows in the narrow English layout. Opt worked around it with custom items.
- **Student worksheets with code** spill onto a nearly empty third page (`apps/web/scripts/build-kits.mjs`).
- **Long code lines** of 45–63 characters at levels 3–4 and `s3`/`s4` scroll sideways in the phone code editor. Most steps are now 12 lines or fewer.
- **Arabic tables** stay at the left of the stage and do not mirror.
- **Narration to listen to.** Whisper flagged lines, mostly numbers spoken as digits and Egyptian wording. The five worst in aisec: «هتعمل إيه؟» (`aisec-4-1-3`, `aisec-s1-4`), «الفحص هيرجّع إيه؟» and «والنظام.» (`aisec-s3-2`), «ده أنهي تهديد من STRIDE؟» (probably `aisec-s4-1`), and «ده بينفع، بس النموذج بيبقى أقل فايدة.» (`aisec-3-1-2`). Check these IDs before acting on them.
- **Overflowing text in published lessons.** `iot-3-1-3` (a flow node), `ai-2-1-1` ("photosynthesis") and `cyber-3-1-2` ("Microphone"). Re-render them, check them with the layout check, then reseed.

## Code and runtime facts
- **Code steps** (`code`, `parsons`, `codefill`, `bug`, `blocks`, and `snippet` on questions) run in a sandbox: `apps/web/src/code/sandbox.ts` (an iframe with an opaque origin, a CSP, a worker and a 3-second limit). MicroPython is loaded there, with Python helper modules in `apps/web/src/code/pylib/` (`csv`, `machine`, `cp_model`, `pywraplp`).
- **Solver fixes, 2026-10-29:** `cp_model` no longer divides by zero when the objective has a zero coefficient. `pywraplp` GLOP now returns real shadow prices: each constraint's `dual_value()` re-solves with its bound nudged. It returns 0 for whole-number models, as OR-Tools does. The routes lab now says 25 villages.
- **Labs** are in `apps/web/src/labs/apps/<id>/` (`meta.ts`, `index.tsx`, `model.ts`). The agents and AI security labs are described in `docs/curriculum/labs-agents-aisec.md`.
- **Darsi Tiny:** training code is in `tools/tinylm/` (PyTorch). The phone inference is `apps/web/src/tinylm/`.
- **Arabic isolates:** the rules are in `scripts/lib/isolates.mjs`, applied by `scripts/isolate-code.mjs`, and tested in `apps/web/tests/units.test.ts`. They are described in `TECHNICAL.md`, "Languages and right-to-left". The lesson engine ignores isolates when it compares answers.
- **Placement** is the only content the app ships: `apps/web/public/content/placement.json`.

## Commands
Run these in `H:\htdocs\darsi` unless a line says otherwise.
- Dev server: `npm run dev` (port 5173).
- All tests: `npm test`. Units for one track: `cd apps/web && npx vitest run tests/units.test.ts -t "course <track>-"`.
- Kits: `cd apps/web && npm run kits -- <unit> …`
- Isolates: `node scripts/isolate-code.mjs --fix <unit> …`
- Media import after rendering: `node scripts/import-media.mjs <unit> …`
- Seed to the emulators: `npm run seed -- --emulator --replace <unit> …`
- Seed live (needs the user's go-ahead): `npm run seed -- <unit> …`
- Lesson Studio's commands are in its `HANDOFF.md`.
