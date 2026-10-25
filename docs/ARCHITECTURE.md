# Architecture

## Principles
1. **One codebase, three targets.** The web app *is* the mobile app: Capacitor wraps `apps/web/dist` in Android and iOS shells. Nothing in `src/` may call browser- or native-only APIs except `src/platform/`.
2. **Offline is normal.** Shell, fonts (all scripts) and lesson JSON are precached by the service worker; kits and media are cached per unit when the teacher taps Download. Progress lives on the device (IndexedDB).
3. **Content is data.** Units are JSON (`public/content/units/*.json`) typed by `src/content/types.ts`. The app and the kit generator read the same files, so slides never drift from lessons.
4. **Every language is a first language.** UI strings in `src/i18n/*.json`; content strings are `{ en, ar, … }`. Direction, numerals and separators follow the language.

## Layers
| Layer | Where | Notes |
| --- | --- | --- |
| Design system | `packages/design-system` | Tokens, fonts, icons, components. Change visuals there, not in the app. |
| Screens | `apps/web/src/screens` | Onboarding, Home, Lesson, Kit, Downloads, Lab, Me |
| Lesson engine | `apps/web/src/lesson/engine.ts` | Pure grading + retry queue — unit tested |
| State | `apps/web/src/state/store.tsx` | Reducer persisted to IndexedDB; versioned for migrations |
| Content | `apps/web/src/content` + `public/content` | Loader with in-memory cache; offline via service worker |
| Platform | `apps/web/src/platform` | storage, saveFile (download vs Filesystem+Share), share, Cache Storage |
| PWA | `vite.config.ts`, `src/pwa.tsx` | Workbox `generateSW`, prompt-to-update, install prompt, online status |

## Teacher kits (PDF + PPTX)
`npm run kits` reads each lesson's `slides` and steps and writes, per language:
- `slides-<lang>.pptx` — editable PowerPoint via pptxgenjs (RTL mode for Arabic, Arial so it renders on any school PC),
- `slides-<lang>.pdf` — the same slides with the brand fonts embedded (headless Chromium),
- `lesson-plan-<lang>.pdf` — A4 lesson plan + pupil worksheet built from the lesson's questions.
Files are committed to `public/kits/` so the app works without Chromium installed; regenerate after editing content.

## Next steps (recommended order)
1. **Backend + sync** — accounts (phone/OTP or school code), progress sync with conflict-free merge, certificate verification endpoint. Suggested: Go service for the API/execution path, Postgres; a Python (FastAPI) service for analytics/ML later.
2. **CMS for content** — authoring UI that writes the same JSON schema, with review and translation workflow; trigger `npm run kits` in CI.
3. **Video pipeline** — 144p/240p/360p HLS + captions (`<track>`) per language; set `src`/`captions` in content.
4. **More languages** — French, Swahili, Urdu (RTL), Hausa: add `src/i18n/<lang>.json`, register in `LANGUAGES`, translate content.
5. **IoT and Cyber units** — content only; all question types already exist.
6. **Native apps** — see NATIVE.md; add push (weekly reminder) via `@capacitor/push-notifications` / local notifications.
7. **Analytics with consent** — lesson completion, drop-off per step, accuracy per question — privacy-first, aggregated.

## Known gaps
- No server: progress stays on the device; certificates are not yet verifiable.
- Videos are placeholders (poster + transcript).
- AI-lab tools use pre-written examples and transparent toy logic by design (offline, safe); a live model would need moderation.
- Dev-tool advisories remaining in `npm audit` (pptxgenjs → image-size, Capacitor CLI → uuid) affect build tooling only, not the shipped app.
