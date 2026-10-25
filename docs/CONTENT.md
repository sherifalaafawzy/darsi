# Writing content

Units live in `apps/web/public/content/units/<id>.json` and are listed in `catalog.json`. Types: `apps/web/src/content/types.ts`.

- Every learner-facing string is `{ "en": "…", "ar": "…" }`. English is the fallback.
- Arabic: Modern Standard Arabic, friendly; use "،" or ":" as separators — never "·".
- Step types: `video`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `reflect`, `lab`.
- Mix at least three question types per lesson; never two of the same in a row; every graded step has an `explain` that says *why*.
- `order.steps` and `match.pairs` are written in the correct order — the app shuffles them.
- Each lesson needs `tryTomorrow`, 6 `slides` (title, bullets, bullets, activity, questions, exit) and a `kit` list.
- After editing, run `npm run kits` and `npm test` (content integrity tests).
