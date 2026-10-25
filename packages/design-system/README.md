# @darsi/design-system

The Darsi (درسي) design system as code: design tokens, self-hosted fonts, icons, logos, PWA templates and **45 RTL-ready React components** for an offline-first app that teaches school and university teachers AI, IoT and cyber security in their own language.

The brand book (voice, colour rules, RTL rules, question-type guidance, print rules) lives in the Darsi design-system page; this package is its implementation. `src/tokens/tokens.json` is the same file the page edits — copy it here and run `npm run tokens` to sync.

## Install and use

```bash
npm install @darsi/design-system   # or add this folder as a workspace package
```

```tsx
import "@darsi/design-system/styles.css";            // tokens + fonts + component styles (once, at the app root)
import { applyLocale, Button, LessonCard, QuizOption } from "@darsi/design-system";

applyLocale("ar", "light");   // sets <html lang="ar" dir="rtl" data-theme="light">

<LessonCard track="ai" offline title="كيف تكشف رسائل التصيّد؟" meta="الدرس ٢، ٥ دقائق" progress={20}
  action={<Button size="sm" iconEnd="next">تابِع</Button>} />
```

Requires React 18+. Every component takes its visible strings as props (English defaults), so localisation stays in your i18n layer.

## What's inside

| Export | Contents |
| --- | --- |
| `@darsi/design-system` | Components, `Icon`, `Mark`, locale helpers (`applyLocale`, `dirFor`, `formatNumber`, `formatPercent`, `formatMB`), PWA hooks (`registerDarsiSW`, `useOnline`, `useInstallPrompt`, `cacheUnit`), `tokens` |
| `/tokens` | Typed token values: `colors.light`, `colors.sunlight`, `spacing`, `radius`, `size`, `zIndex`, `typography`, `cssVar()` |
| `/styles.css` | `tokens.css` + `components.css` in one file |
| `/tokens.css`, `/components.css`, `/tokens.json` | The parts separately |
| `/tailwind-preset` | Tailwind preset whose colours point at the CSS variables (themes switch at runtime) |
| `/fonts/*` | Baloo 2, Baloo Bhaijaan 2 (Arabic), Noto Sans, Noto Sans Arabic — WOFF2, SIL OFL 1.1 (`fonts/OFL.txt`) |
| `/icons/*`, `/logos/*`, `/app-icons/*` | SVG icons, the mark and bilingual lockups, PWA icons (any, maskable, monochrome, apple-touch) |
| `/pwa/*` | `manifest.webmanifest` and an offline-first `sw.js` template |

### Components

- **Actions & identity:** Button, TrackChip, Icon, Mark, StreakCounter
- **App shell:** AppBar, BottomNav, DarsiRoot, PhoneFrame
- **Lessons:** LessonCard, UnitPath, LessonTopBar, FeedbackSheet, LessonComplete, CertificateCard, ProgressBar
- **Question types:** QuestionHeader, QuizOption (single and `multi`), TrueFalse, ImageChoice, MatchPairs, OrderSteps, FillBlank, HotspotImage, ScenarioCard, Reflection, VideoPlayer (with in-video `checkpoint` questions)
- **AI lab:** PromptBuilder, TokenViewer, NextWordLab, TrainClassifier, FactCheck (plus the pure functions `approximateTokens`, `withTemperature`, `classify`)
- **Teacher kit:** ClassroomKit, ResourceCard, PagePreview
- **Onboarding & settings:** OnboardingStep, ChoiceCard, PlacementResult, LanguagePicker, Switch, TextField
- **PWA states:** ConnectionStatus, InstallPrompt, UpdateToast, DownloadRow, EmptyState

## Themes and direction

- Two themes: `light` ("Day", default) and `sunlight` (high contrast, 7:1 text). Set `data-theme` on `<html>` via `applyLocale(lang, theme)` or scope a subtree with `<DarsiRoot theme="sunlight">`.
- There is deliberately no dark theme.
- All component CSS uses logical properties, so `dir="rtl"` mirrors every layout. `back`/`next` icons, progress, the unit path and switches mirror; logos, check/cross, media controls and hotspot pictures do not.
- Use `formatNumber`/`formatPercent` with the teacher's locale (e.g. `ar-EG`) for Arabic-Indic digits. In Arabic text, use "،" or ":" as separators — never "·", which reads as the Arabic zero.

## PWA

1. Copy `dist/pwa/manifest.webmanifest`, `dist/pwa/sw.js`, `dist/app-icons/` and `dist/fonts/` into your public folder; adjust `SHELL` in `sw.js` to your build output.
2. `registerDarsiSW("/sw.js", (update) => showUpdateToast(update))` — new versions wait until the teacher taps Reload; never mid-lesson.
3. `useOnline()` drives `ConnectionStatus`; `useInstallPrompt()` drives `InstallPrompt` (show it after the first completed lesson; on iOS show Share → Add to Home Screen steps).
4. `cacheUnit(unitId, urls)` caches a downloaded unit (lesson JSON, 240p video, caption files, kit PDFs).
5. Post `{ type: "PRECACHE_SCRIPT", script: "arabic" }` to the worker for Arabic-language teachers so only the scripts they need are stored.

Budget: install ≤ 2 MB including fonts for one script; a lesson ≤ 300 KB; first screen interactive < 3 s on a low-end Android over 3G.

## Classroom-kit PDFs

`assets/print/` holds two finished samples (English and Arabic, A4: lesson plan + worksheet) and their HTML templates. `scripts/build-kit.py` fills the template from lesson data and needs Playwright to print the PDF. Print rules: black-and-white safe, toner-light, 15 mm margins, mark and "free to copy for your school" on every page, Arabic editions typeset RTL with Arabic-Indic numbering.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run tokens` | Regenerates `tokens.css`, `tokens/index.ts` and the Tailwind preset from `tokens.json` |
| `npm run contrast` | Checks every promised text/background pair: 4.5:1 Day, 7:1 Sunlight, 3:1 borders and focus |
| `npm run build` | Tokens → library (ESM + CJS + types) → copies CSS, fonts, icons, logos and PWA files to `dist/` |
| `npm test` | Vitest + Testing Library: roles, RTL behaviour, question interactions, AI-lab logic |
| `npm run dev` | Playground with all components, a language switch (English LTR / العربية RTL) and a theme switch |
| `npm run build:playground` | Static playground in `playground-dist/` (serve over HTTP) |

## Known limits

- The AI-lab tools run on pre-written examples and transparent toy logic (word-overlap classifier, approximate tokens). That is deliberate — they work offline and never show unreviewed AI output — but they are teaching models, not real ones.
- `VideoPlayer` is a lightweight shell around `<video>`: wire seeking, quality switching and checkpoint timing to your player logic or an HLS library.
- Default strings are English; pass translated labels for every locale you ship.
- QR codes in the PDF templates are placeholders.
