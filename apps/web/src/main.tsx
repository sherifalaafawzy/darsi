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

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
