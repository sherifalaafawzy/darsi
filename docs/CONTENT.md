# Writing content

Courses are made in the course editor (`/super/content`), which publishes them to Cloud Storage; the app ships none. The starting courses also live as files in `content/units/<id>.json` at the repo root, published with `npm run seed`. Types: `apps/web/src/content/types.ts`.

- A course is for teachers unless it says `"audience": "students"` ("Who is it for?" in the editor). Students see only courses for students, and teachers only courses for teachers, in the same tracks. Write a course for students to students: its `tryTomorrow` is something to try at school or at home, not with a class.
- Every learner-facing string is `{ "en": "…", "ar": "…" }`. English is the fallback.
- Arabic: Modern Standard Arabic, friendly; use "،" or ":" as separators — never "·".
- Step types: `video`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `reflect`, `lab`.
- A `lab` step's `tool` is any Labs app id, the name of its folder in `apps/web/src/labs/apps/` (for example `neuron`, `playground`, `rag`, `twofactor`); the course editor's lab picker lists them all.
- Mix at least three question types per lesson; never two of the same in a row; every graded step has an `explain` that says *why*.
- `order.steps` and `match.pairs` are written in the correct order — the app shuffles them.
- Each lesson needs `tryTomorrow`, 6 `slides` (title, bullets, bullets, activity, questions, exit) and a `kit` list.
- After editing a file in `content/units/`, run `npm run kits` and `npm test` (content integrity tests), then `npm run seed -- --replace <id>` to publish it (or import the file in the editor).
