import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@darsi/design-system/styles.css";
import "./app.css";
// Learner path and app frame. Staff and landing styles load with their lazy chunks (admin, person, people, landing).
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/auth.css";
import "./styles/lesson.css";
// The labs catalogue's styles stay global, though its screen (screens/Labs.tsx, which imports them too) is a lazy chunk.
import "./styles/labs.css";
import { App } from "./App";
import { keepPageFonts } from "./platform/fonts";
import { startBugLog } from "./bugs/log";
import { tellAppError } from "./app/AppBoundary";

startBugLog(); // the last errors and failed requests, for "Report a problem" (in memory only)

// A lazy chunk (or its stylesheet) that failed to load, as Vite reports it: the same "darsi:app-error" event the
// boundaries send, so it is heard even where no boundary of ours is (a lab, the report sheet). Not cancelled: the
// rejected import must still reach the screen's boundary, which then says nothing twice (tellAppError tells once).
window.addEventListener("vite:preloadError", (e) => tellAppError((e as Event & { payload?: unknown }).payload ?? new Error("A chunk failed to load"), true));

// Dev only: drop a service worker left by `vite preview` on the same port, or learners keep a
// production bundle that cannot read /content/dev/* and fails CORS against live Storage.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
keepPageFonts();
