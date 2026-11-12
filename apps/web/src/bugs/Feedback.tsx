/**
 * "Share feedback" (TECHNICAL.md "Feedback"): the lazy chunk behind the button's menu, the nav rail's item and Home's
 * question under a finished course. A rating of 1 to 5 stars, an optional topic and an optional comment, sent to
 * /api/feedback with a plain fetch (guests never load the Firebase SDK). Signed in, the ID token says who. Nothing else
 * is gathered: no picture of the screen, no device details; only the page's path, the course it was about and the
 * language. Without a connection it waits on the device and goes when the phone is back online (flushFeedback).
 * Kept out of the precache (vite.config.ts), like the report sheet.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@darsi/design-system";
import { firebaseConfig, functionsRegion, useEmulators } from "../firebase-config";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { storage } from "../platform";
import type { FeedbackStart } from "./log";
import "../styles/bug.css";
import "./strings";

export const TOPICS = ["lessons", "videos", "labs", "app", "other"] as const;
type Topic = (typeof TOPICS)[number];
interface Body { rating: number; text: string; topic: Topic | null; path: string; unitId: string | null; source: "button" | "course"; lang: string; queuedAt?: string }
interface Queued { uid: string | null; at: number; body: Body }

const QUEUE = "darsi:feedback";
const WORDS: MessageKey[] = ["fb.r1", "fb.r2", "fb.r3", "fb.r4", "fb.r5"];

const endpoint = () => (useEmulators
  ? `http://${location.hostname}:5001/${firebaseConfig.projectId}/${functionsRegion}/sendFeedback`
  : "/api/feedback");

type Outcome = { ok: true } | { ok: false; why: "offline" | "tooMany" | "failed" };
async function post(body: Body, token: string | null): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST", body: JSON.stringify(body), credentials: "omit",
      // text/plain keeps the emulator's cross-origin request simple; the server reads the raw body either way.
      headers: { "Content-Type": "text/plain", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch { return { ok: false, why: "offline" }; }
  return res.ok ? { ok: true } : { ok: false, why: res.status === 429 ? "tooMany" : "failed" };
}

async function queued(): Promise<Queued[]> {
  const q = await storage.get<Queued[]>(QUEUE).catch(() => undefined);
  return Array.isArray(q) ? q : [];
}
let flushing = false;
/**
 * Sends the feedback that waited on this phone (the button calls it at startup and when the connection returns). Each
 * goes as the account that wrote it while that account is signed in here, otherwise without a token. Feedback the
 * server refuses is dropped; feedback that can't get through waits for next time (a month at most).
 */
export async function flushFeedback(uid: string | null, token: (() => Promise<string>) | null): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const keep: Queued[] = [];
    for (const item of await queued()) {
      if (Date.now() - item.at > 30 * 864e5) continue;
      const tok = item.uid && item.uid === uid && token ? await token().catch(() => null) : null;
      const r = await post({ ...item.body, queuedAt: new Date(item.at).toISOString() }, tok);
      if (!r.ok && r.why !== "failed") keep.push(item);
    }
    if (keep.length) await storage.set(QUEUE, keep); else await storage.remove(QUEUE);
  } catch { /* storage unavailable: nothing to send */ } finally { flushing = false; }
}

/** One star, drawn here (the design system has no star icon): filled when chosen, an outline when not. */
const Star = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false">
    <path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={on ? "var(--sunbird)" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

export function FeedbackSheet({ start, uid, getToken, onClose }: {
  start: FeedbackStart; uid: string | null; getToken: (() => Promise<string>) | null; onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const ids = { title: useId(), stars: useId(), word: useId(), topic: useId(), text: useId(), hint: useId() };
  const first = typeof start.rating === "number" && start.rating >= 1 && start.rating <= 5 ? Math.round(start.rating) : 0;
  const [rating, setRating] = useState(first);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"edit" | "sending" | "sent" | "queued">("edit");
  const [error, setError] = useState<string | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const starsBox = useRef<HTMLFieldSetElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The page it was sent from, as the router has it, without its query or fragment.
  const here = useLocation().pathname;
  const [path] = useState(here);
  const course = start.unitId ? start.course ?? "" : "";

  // A real modal (<dialog> opened with showModal), as the report sheet is. The focus starts on the stars, or on the
  // comment when a course's stars were already chosen on Home.
  useLayoutEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", "");
    if (first) box.current?.focus();
    else starsBox.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Browsers without <dialog>: Escape closes.
  useEffect(() => {
    const d = sheet.current;
    if (!d || typeof d.showModal === "function") return;
    const keys = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [onClose]);

  const send = async () => {
    if (!rating) { setError(t("fb.needStars")); starsBox.current?.querySelector<HTMLInputElement>("input")?.focus(); return; }
    setError(null); setState("sending");
    const body: Body = { rating, text: text.trim(), topic, path, unitId: start.unitId ?? null, source: start.unitId ? "course" : "button", lang };
    const token = getToken ? await getToken().catch(() => null) : null;
    const r = navigator.onLine ? await post(body, token) : { ok: false as const, why: "offline" as const };
    if (r.ok) { setState("sent"); return; }
    if (r.why === "offline") {
      try { await storage.set(QUEUE, [...(await queued()), { uid, at: Date.now(), body }].slice(-10)); setState("queued"); return; } catch { /* no storage: say it failed */ }
    }
    setState("edit");
    setError(t(r.why === "tooMany" ? "fb.tooMany" : "fb.failed"));
  };

  const done = state === "sent" || state === "queued";
  return (
    <dialog className="bug-sheet" aria-modal="true" aria-labelledby={ids.title} ref={sheet}
      onCancel={(e) => { e.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="bug-head">
        <h2 className="bug-title" id={ids.title}>{t("fb.title")}</h2>
        <Button variant="ghost" iconOnly icon="close" onClick={onClose}>{t("bug.close")}</Button>
      </div>
      <div className="bug-body">
        {done ? (
          <div className="bug-done" role="status">
            <p className="bug-done-title">{state === "sent" ? t("fb.thanks") : t("fb.queued")}</p>
            {state === "sent" && <p className="muted">{t("fb.thanksBody")}</p>}
            <Button onClick={onClose}>{t("bug.done")}</Button>
          </div>
        ) : (
          <>
            <fieldset className="fb-stars" ref={starsBox} aria-describedby={rating ? ids.word : undefined}>
              <legend className="bug-label" id={ids.stars}>{course ? t("fb.rateCourse", { course: isolate(course) }) : t("fb.rate")}</legend>
              <div className="fb-star-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={n <= rating ? "fb-star is-on" : "fb-star"}>
                    <input type="radio" name={ids.stars} value={n} checked={rating === n} aria-label={t("fb.starN", { n })}
                      onChange={() => { setRating(n); setError(null); }} />
                    <Star on={n <= rating} />
                  </label>
                ))}
              </div>
              <p className="fb-word" id={ids.word} aria-live="polite">{rating ? t(WORDS[rating - 1]) : ""}</p>
            </fieldset>

            <fieldset className="fb-topics">
              <legend className="bug-label" id={ids.topic}>{t("fb.topic")}</legend>
              <div className="fb-chip-row">
                {TOPICS.map((x) => (
                  <button key={x} type="button" className="fb-chip" aria-pressed={topic === x} onClick={() => setTopic(topic === x ? null : x)}>{t(`fb.t.${x}` as MessageKey)}</button>
                ))}
              </div>
            </fieldset>

            <label className="bug-label" htmlFor={ids.text}>{t("fb.comment")}</label>
            <p className="muted small" id={ids.hint}>{t("fb.commentHint")}</p>
            <textarea ref={box} id={ids.text} className="bug-text" rows={4} maxLength={2000} value={text} aria-describedby={ids.hint} onChange={(e) => setText(e.target.value)} />

            <p className="muted small">{t(uid ? "fb.privacy" : "fb.privacyGuest")}</p>
            {error && <p className="err-text" role="alert">{error}</p>}
            <Button block loading={state === "sending"} onClick={() => void send()}>{t("fb.send")}</Button>
          </>
        )}
      </div>
    </dialog>
  );
}
