import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@darsi/design-system/styles.css";
import "./app.css";
// Learner path and app frame. Staff and landing styles load with their lazy chunks (admin, person, people, landing).
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/auth.css";
import "./styles/lesson.css";
import { App } from "./App";
import { keepPageFonts } from "./platform/fonts";
import { startBugLog } from "./bugs/log";

startBugLog(); // the last errors and failed requests, for "Report a problem" (in memory only)

// Dev only: drop a service worker left by `vite preview` on the same port, or learners keep a
// production bundle that cannot read /content/dev/* and fails CORS against live Storage.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
keepPageFonts();
