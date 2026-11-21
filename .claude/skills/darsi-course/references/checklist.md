# Review checklist

Go through it for every lesson before you call it done, in English and then again in Arabic. The structure check
(`scripts/check-lesson.mjs`) covers the lines marked ⚙; the rest need a reader.

## Starts from zero

- [ ] ⚙ The `teaching` block is filled: assumes, outcome, hook, terms, misconception, next.
- [ ] Everything in `assumes` is taught by an earlier lesson in the same path. For a track's first lesson it is empty.
- [ ] Read the lesson as someone who has never met the subject. Every word they wouldn't know is explained where it
      first appears, or cut.
- [ ] ⚙ No term in `terms` is said before the `show` part.
- [ ] Code steps use only Python (or SQL) taught earlier in the path or explained in this lesson's reading.
- [ ] A course above Beginner ends its summary with "Before this: …". A Beginner course says no experience is needed.

## The video

- [ ] ⚙ Scene 1 is the hook: a cast member, at most 40 words, the first sentence at most 12 words.
- [ ] The hook passes the seven tests (`video.md`): their world, leaves a gap, no new word, specific, short, paid
      off, honest.
- [ ] ⚙ Scene 2 is the promise: "By the end, you'll be able to…" and one thing a person can be seen doing.
- [ ] ⚙ The parts are in order: hook, promise, show, name, work, check, reveal, widen, lab, check, recap, try.
- [ ] ⚙ An example comes before the first definition.
- [ ] One idea per scene. No scene needs "and also".
- [ ] The worked case is the lab's case, with the lab's numbers and button names.
- [ ] ⚙ Check 1 is about a case the video has not just answered, and one wrong option is the misconception.
- [ ] ⚙ Check 2 is the hook's question, and the recap's first sentence answers it.
- [ ] ⚙ Options are about the same length; both feedback lines exist in both languages.
- [ ] There is a non-example in "widen it".
- [ ] ⚙ The last scene names the next lesson.
- [ ] ⚙ Length and words are inside the budget for the audience; no scene over its budget.
- [ ] Both contact sheets looked at: every scene says something on screen, nothing cut off or overlapping, items
      arrive as they are said, the Arabic reads right to left, no text under 32 px.

## The lesson around it

- [ ] The reading opens on the hook's problem and uses the video's worked case and numbers.
- [ ] ⚙ The reading's key terms include every term in the video's `teaching.terms`, in the same words.
- [ ] The first practice question is the video's second check.
- [ ] Questions rise in difficulty; at least three types; every `explain` says why.
- [ ] One question after the lab meets the misconception head on.
- [ ] The lab's prompt names real buttons, one thing to watch for, and what finishes it.
- [ ] The project is the activity the video's last scene names, needs no devices (teachers), and its rubric lists
      things a person can be seen doing.
- [ ] Numbers, names and terms are the same in the video, the reading, the questions, the lab and the slides.
- [ ] Teachers' lessons never talk down; students' lessons never say "your pupils" and fit the stage's age.

## Both languages

- [ ] ⚙ No "·" in any Arabic. ⚙ The Arabic scenes split into the same number of sentences as the English.
- [ ] The narration is Egyptian from start to finish; the course text is friendly Standard Arabic.
- [ ] Every term matches `docs/curriculum/ar-lingo.md`; new terms were added there first.
- [ ] Every adjective in the Egyptian has its noun; numbers match the English.
- [ ] `node scripts/isolate-code.mjs --fix <course>` was the last edit to the unit file.

## Machine checks

- [ ] `check-lesson.mjs <id>`: no problems.
- [ ] `convert-fresh.mjs <ID>`: 0 errors, 0 warnings. `convert.ts <ID>`: the same, or only `timingStale` between a
      rewrite and its narration.
- [ ] `layout-check -- <id>`, both languages: no overflow, overlap, off-stage or bidi errors, and no font errors
      beyond the two template ones every lesson has (the title card's course line, the quiz's small title).
- [ ] `vitest run tests/units.test.ts -t "course <course>"`: all pass.
- [ ] Kits rebuilt: slides 6 pages and lesson plan 2 pages, in English and in Arabic.
- [ ] After narration: package, MP4, `import-media`, kits, tests again, and the lesson played at 375 px in both
      languages.

## The report

Say plainly: what you changed (files), what each check printed, what you did not check (a native speaker's read of
the Arabic, a real phone), what is still the old recording, and what needs the user's decision or money.
