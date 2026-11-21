# The pipeline, in order

From a storyboard to a lesson a learner can open. Steps 1 to 5 cost nothing. Step 6 costs money: ask first.
Steps 10 and later change what learners see: only on the user's word.

Before anything: `git status` in both repositories. Other sessions work in the same folders.

```bash
export CHROMIUM_PATH="C:/Users/Sherif Alaa Fawzy/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe"
```

`<ID>` is the lesson id in capitals (`AGENTS-1-1-1`), `<id>` the same in lower case, `<course>` the unit id
(`agents-1-1`).

## Free checks (run as often as you like)

In `H:\htdocs\lessonstudio`:

```bash
# 1. English and Arabic side by side, sentence by sentence. Read every pair.
node scripts/darsi/sentences.ts <ID>

# 2. Convert. A new lesson must end "0 errors, 0 warnings". It writes content/darsi/lessons/<id>/ (generated) and
#    keeps existing narration.
node scripts/darsi/convert.ts <ID>

# 3. Layout, in the real player, both languages: no overflow, overlap, off-stage or bidi errors, and no new font errors.
npm run layout-check -- <id>

# 4. Contact sheets: every scene as it ends. Open both pictures and look at every scene.
node scripts/darsi/sheet.ts <id>
node scripts/darsi/sheet.ts <id> --lang ar-EG
#    → out/sheets/<id>-en.png, out/sheets/<id>-ar-EG.png
```

In `H:\htdocs\darsi`:

```bash
# 5. The teaching structure: hook, promise, order of parts, terms, checks, both languages, the unit's agreement.
node .claude/skills/darsi-course/scripts/check-lesson.mjs <id>

# 6. The unit: validator, content rules, code steps run for real, kits present, no "·", isolates.
node scripts/isolate-code.mjs --fix <course>
cd apps/web && npx vitest run tests/units.test.ts -t "course <course>"
```

**Rewriting a lesson that is already narrated.** The converter keeps the old recording, so it reports `timingStale`
for every word and prints only the first 12 issues: a real error can hide behind them. Check the storyboard on its
own first, with estimated timings (it writes nothing):

```bash
node .claude/skills/darsi-course/scripts/convert-fresh.mjs <ID>      # Darsi root; must say 0 errors, 0 warnings
```

Then run `convert.ts` so the layout check and the sheets can play the new scenes. If narration is not happening in
this session, put the generated lesson back afterwards, so Lesson Studio keeps the old lesson whole (old scenes with
their own recording) until the new one is voiced:

```bash
git restore -- content/darsi/lessons/<id>/manifest.json content/darsi/lessons/<id>/scenes.json    # Lesson Studio
```

What the converter's messages mean:

- `… has N sentences, English has M`: the Arabic scene doesn't split like the English. Fix the Arabic punctuation.
- `timingStale` (after a rewrite): the old narration no longer matches the text. Expected until you narrate again.
- `longLesson`, `heavyLesson`: expected for three-minute lessons, not counted.
- An unknown icon or a wrong body stops the converter with the scene named. Icons: the player's 18 and the library's
  115 (`packages/spec/src/library-icons.ts`).

What the layout check's `font` errors mean today (2026-11-13). Text under 32 px on the stage is under 9 px on a
360 px phone. Two errors come from the converter's own templates and appear in **every** lesson: the course line on
the title card (26 px) and the quiz's small title (26 px). They are known, shared, and not fixed by editing a lesson:
report them, don't chase them. Every other error is yours. Several bodies draw some of their text under the line, so
until the templates are fixed prefer the ones that pass:

| Passes | Trips the font check |
|---|---|
| `list` (38 px), `table` (34 px), `sequence` and `flow` labels (32–34 px), `big`, recap points | `compare` items (30 px), `steps` numbers (30 px), `cards` labels (27 px), a `code` caption (28 px), `chart` values (24–26 px) |

A `list` row beside a cast member wraps after about 30 English characters; without one, about 50.

## Narration (costs money: ask first)

Narration is Gemini text-to-speech through a key that Lesson Studio shares with other work. Voiced sentences are
cached by their text, so only new or changed sentences cost anything, and a re-run after a failure is free for what
already worked.

```bash
# What it would cost. Sends nothing.
npm run narrate -- --dir content/darsi/lessons/<id> --estimate
```

Show the user the sentences and the cost it prints, and wait for a yes. For scale: a rewritten three-minute lesson is
about 46 sentences per language, and on 2026-11-13 the estimate for one was about $0.02 per language voiced now (the
model was `gemini-3.8-flash-lite-tts`). A whole track of 32 lessons is then about $1.30; read the real figure from
`--estimate`, never from this page. Then, one lesson or one track at a time,
behind the lock (other sessions narrate too, and the key has a rate limit):

```bash
L="H:/htdocs/lessonstudio/out/locks/narrate"
until mkdir "$L" 2>/dev/null; do sleep 60; done; echo "<who> $(date)" > "$L/owner"     # run in the background

npm run narrate -- --dir content/darsi/lessons/<id> --now --workers 2    # run again until no sentence fails

rm -rf "$L"                                                               # release as soon as you finish or give up
```

- Never delete `.cache/narrate`. Never read or print `.env.local`.
- The tool transcribes each sentence back to check the voice read it as written. Listen to any line it flags
  (numbers and dialect words are the usual ones).
- **Change words before narration, not after.** A word changed after voicing is voiced again. That is why the layout
  check and both contact sheets come first.

## After narration

In `H:\htdocs\lessonstudio`:

```bash
# 7. Convert again (it now uses the measured timings: 0 errors, 0 warnings, no timingStale), then package and render.
node scripts/darsi/convert.ts <ID>
npm run package-lessons -- <id>
npm run mp4 -- <id> --lang en,ar-EG --sizes 240          # about 40 seconds per language
```

(If you put the generated lesson back after the free checks, run `convert.ts` once before narrating too: narration
reads `content/darsi/lessons/<id>/scenes.json`.)

In `H:\htdocs\darsi`:

```bash
# 8. Fill the unit's video steps: media, chapter and checkpoint times per language, transcript, the video kit item.
node scripts/import-media.mjs <course>
#    It refuses when the unit's chapter labels and the storyboard's chapters differ in number: fix the unit.

# 9. Kits (slides, lesson plan; Chromium for the PDFs), isolates, then the tests again.
npm run kits -w @darsi/web -- <course>
node scripts/isolate-code.mjs --fix <course>
cd apps/web && npx vitest run tests/units.test.ts -t "course <course>"
```

Kits can be built before narration too (they come from the slides and the questions, not the video), and should be
whenever the slides or questions change. After building, count the pages of each PDF in both languages:

```bash
for f in content/kits/<lesson>/*.pdf; do echo "$f $(grep -a -o '/Count [0-9]*' "$f" | head -1)"; done
```

Slides are 6 pages and a lesson plan 2 (the plan, then the worksheet). One line too many on the plan page makes a
nearly empty third page, and Arabic runs longer than English: a line of the Arabic plan holds about 110 characters.
Shorten the activity's `details` until both languages are back to 2 pages, and keep each item's `pages` in the unit
equal to what was built. PyMuPDF is installed (`python -I -c "import fitz"`) if you need to see which page spilled.

Then look at it as a learner: seed the course to the emulators (`npm run seed -- --emulator --replace <course>`,
behind the lock folder `H:/htdocs/lessonstudio/out/locks/seed`) or use `npm run local`, and play the lesson at
375 px in English and in Arabic: the light lesson, the switch to the MP4, captions, both checks, the lab, the kit.

## Only on the user's word

```bash
npm run seed -- --replace <course>      # publishes to the live site
```

Also only on the user's word: commit, push, deploy, and pushing lessons to the live Lesson Studio.

## Traps

- **Until a rewritten lesson is narrated**, the unit's video step still points at the old recording in
  `content/media/`. Say so in your report. Don't run `import-media` between the rewrite and the narration: it would
  pair old audio with new scenes.
- The three pack courses (`ai-1-1`, `cyber-1-1`, `iot-1-2`; storyboards `AI-1-1-*`, `CY-1-1-*`, `IOT-1-2-*`) import
  with `scripts/import-packs.mjs`. Its `--force` rebuilds the unit from the pack and undoes every hand edit.
- Some courses were first made by generators that are now stale (code: `out/code-tmp`; data science: `out/ds-work`;
  and the old ones for aisec, opt and data). Edit the unit JSON and the storyboards; never rebuild from a generator.
- Courses quote numbers from the Labs apps. After changing a number, search `content/units` and the storyboards for
  it; after changing a lab's model, search for the lab's id.
- Type-check the web app with `npx tsc --noEmit`, never `tsc -b` (it writes `.js` files beside the sources).
- Keep scratch work on `H:` or in the session's scratch folder, never in `C:\…\Temp` by hand.
- Kits are binary and differ on every build, and the builder always builds a whole course. Rebuild only the course
  you changed. If you changed one lesson and the course's other kit files are someone's uncommitted work, copy those
  folders aside first and put them back after the build.
- The kit build sometimes stops with `UNKNOWN: unknown error, open '…pdf'` (the file was locked for a moment). It
  leaves a hidden `.slides-<lang>.html` or `.lesson-plan-<lang>.html` beside the PDF: delete the ones your run left
  and build again.
