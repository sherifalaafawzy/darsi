# Darsi (درسي)

Five-minute lessons in **AI, IoT and cyber security** for school and university teachers — in their own language, on any phone, offline. Web-first PWA, built so the same code ships as **Android and iOS apps** with Capacitor.

```
darsi/
├─ apps/web/                 the PWA (React + Vite + TypeScript)
│  ├─ public/content/        lesson content as JSON (EN + AR) — the single source for app and kits
│  ├─ public/kits/           generated teacher kits: slides (PDF + PPTX) and lesson plans (PDF)
│  ├─ scripts/build-kits.mjs generates the kits from the content
│  ├─ src/platform/          the only web/native-aware code (storage, file save, share, caching)
│  ├─ capacitor.config.ts    native shell config (Android/iOS)
│  └─ e2e/, tests/           Playwright end-to-end + Vitest unit tests
├─ packages/design-system/   @darsi/design-system — tokens, fonts, icons, 45 RTL-ready components
└─ docs/                     architecture, native apps, content authoring
```

## Getting started

Requires Node 20+ (22 recommended).

```bash
npm install          # installs everything and builds the design system
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload (service worker off in dev) |
| `npm run build` | Production build of the design system and the PWA → `apps/web/dist` |
| `npm run preview` | Serve the production build at http://localhost:4173 (service worker on — test offline here) |
| `npm test` | Unit tests (design system + app) |
| `npm run e2e` | End-to-end tests on desktop and phone (first time: `npx playwright install chromium`) |
| `npm run kits` | Regenerate teacher slides (PDF + PPTX) and lesson plans from the content |
| `npm run typecheck` | TypeScript across the workspace |
| `npm run cap:android` / `npm run cap:ios` | Create and open the native projects (see docs/NATIVE.md) |

## What works today

- Onboarding: language (English / العربية, the whole app switches to RTL), where you teach, tracks, weekly goal, 9-question placement check.
- Home with weekly goal, teaching-week streak, unit path and next lesson.
- Lesson player: video step with "pause and answer" checkpoint (transcript fallback until videos are produced), choose one, select all, true/false, pick the picture, match, put in order, fill the gaps, type the answer, spot it, scenarios, reflections, AI-lab steps; wrong answers come back once at the end; read-aloud.
- Classroom kit: per lesson, **slides as PDF or PowerPoint** and a lesson plan + worksheet PDF, in the teacher's language. Downloads on web; native apps save and open the share sheet.
- Downloads: cache a whole unit for offline use (respects Data saver).
- AI lab: prompt builder, next-word / temperature, tokens, teach-the-machine classifier, fact-check — all offline.
- Me: language, Sunlight (high-contrast) mode, data saver, reminder, name, levels, certificates.
- Installable PWA with offline shell, update prompt (never mid-lesson) and install prompt.

See `docs/ARCHITECTURE.md` for how it fits together and what comes next.
