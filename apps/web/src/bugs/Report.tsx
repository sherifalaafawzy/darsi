/**
 * "Report a problem" (TECHNICAL.md "Problem reports"): the lazy chunk behind the button on every screen. It takes a
 * picture of the screen first (capture), then opens a sheet where the person says what went wrong, sees the picture
 * and everything else that is sent, and sends it to /api/bug with a plain fetch (guests never load the Firebase SDK).
 * Without a connection the report waits on the device and goes when the phone is back online (flushReports).
 * Kept out of the precache (vite.config.ts), like the staff screens; the service worker caches it the first time.
 */
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { domToCanvas } from "modern-screenshot";
import { Button, Icon, Switch } from "@darsi/design-system";
import { firebaseConfig, functionsRegion, useEmulators } from "../firebase-config";
import { isolate, useI18n } from "../i18n";
import { storage } from "../platform";
import { familiesFor } from "../platform/fonts";
import { bugLog } from "./log";
import "../styles/bug.css";
import "./strings";

export interface Shot { url: string; w: number; h: number }
/** What App knows about the person and their settings. The server takes who sent it only from the ID token. */
export interface About { who: string | null; account: Record<string, unknown> | null; learner: Record<string, unknown> }
interface Body { text: string; url: string; details: Record<string, unknown>; shot: string | null; shotW?: number; shotH?: number }
interface Queued { uid: string | null; at: number; body: Body }

const QUEUE = "darsi:reports";
/** A data: URL of at most this many characters is about 1.1 MB of picture, under the server's 1.2 MB. */
const MAX_SHOT = 1_500_000;

const endpoint = () => (useEmulators
  ? `http://${location.hostname}:5001/${firebaseConfig.projectId}/${functionsRegion}/reportBug`
  : "/api/bug");

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const dataUrl = (b: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(b); });

/**
 * The @font-face rules of the page language's own fonts, with the files inlined: they are already in this phone's
 * font cache. Left to itself the screenshot library would fetch every family in the font stacks, Arabic files on an
 * English page included.
 */
async function fontCss(): Promise<string> {
  const families = familiesFor(document.documentElement.lang || "en");
  const rules: Promise<string>[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try { list = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(list)) {
      if (rule.type !== 5) continue; // CSSRule.FONT_FACE_RULE
      const r = rule as CSSFontFaceRule;
      if (!families.includes(r.style.getPropertyValue("font-family").replace(/["']/g, "").trim())) continue;
      const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(r.style.getPropertyValue("src"));
      if (!src) continue;
      rules.push(fetch(new URL(src[1], sheet.href ?? location.href).href)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then(dataUrl)
        .then((d) => r.cssText.replace(/url\([^)]*\)/, `url("${d}")`))
        .catch(() => ""));
    }
  }
  return (await Promise.all(rules)).filter(Boolean).join("\n");
}

/**
 * A picture of what is on the screen now, as a JPEG data: URL; null if the browser can't make one. The button itself
 * is left out. At most 1600 px on the long side (sharper than the phone's CSS pixels, still small to send).
 */
export async function capture(): Promise<Shot | null> {
  try {
    const w = window.innerWidth, h = window.innerHeight, y = window.scrollY;
    const scale = Math.min(window.devicePixelRatio || 1, 2, 1600 / Math.max(w, h, 1));
    const css = await within(fontCss(), 6000).catch(() => "");
    const body = document.body;
    const canvas = await within(domToCanvas(body, {
      width: w, height: h, scale,
      backgroundColor: getComputedStyle(body).backgroundColor || getComputedStyle(document.documentElement).backgroundColor || null,
      filter: (n) => !(n instanceof Element && (n.classList.contains("bug-fab") || n.classList.contains("bug-note"))),
      // The page scrolls the window; the picture shows the part on screen.
      style: y ? { marginTop: `${-y}px` } : null,
      features: { restoreScrollPosition: true },
      font: css ? { cssText: css } : false,
      timeout: 6000,
    }), 20000);
    for (const q of [0.72, 0.55, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.startsWith("data:image/jpeg") && url.length <= MAX_SHOT) return { url, w: canvas.width, h: canvas.height };
    }
    return null;
  } catch { return null; }
}

/** A picture the person chose instead, shrunk on the phone to at most 1600 px (like project photos). */
async function shrink(file: File): Promise<Shot> {
  const img = new Image();
  const src = URL.createObjectURL(file);
  try {
    await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error("not an image")); img.src = src; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.75, 0.55, 0.4]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= MAX_SHOT) return { url, w: c.width, h: c.height };
    }
    throw new Error("too big");
  } finally { URL.revokeObjectURL(src); }
}

/** Query values can hold invite codes and reset links; the server checks again. */
export function redact(href: string): string {
  try {
    const u = new URL(href);
    for (const k of [...u.searchParams.keys()]) if (/code|token|key|secret|pass|oob|session|auth|sig/i.test(k)) u.searchParams.set(k, "…");
    return u.toString();
  } catch { return ""; }
}

type Nav = Navigator & {
  connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
  deviceMemory?: number; userAgentData?: { platform?: string; mobile?: boolean; brands?: { brand: string; version: string }[] };
  standalone?: boolean;
};

/** Everything that goes with the person's words, besides the picture: the sheet shows all of it before it is sent. */
export async function gather(about: About): Promise<Record<string, unknown>> {
  const n = navigator as Nav;
  const est = await within(navigator.storage?.estimate?.() ?? Promise.resolve(undefined), 1500).catch(() => undefined);
  const media = (q: string) => (typeof matchMedia === "function" ? matchMedia(q).matches : false);
  const build = Array.from(document.scripts).map((s) => /\/assets\/(index-[\w-]+\.js)/.exec(s.src)?.[1]).find(Boolean) ?? import.meta.env.MODE;
  return {
    page: { title: document.title.slice(0, 200), referrer: redact(document.referrer), scrollY: Math.round(window.scrollY), lang: document.documentElement.lang, dir: document.documentElement.dir },
    app: {
      build, sw: navigator.serviceWorker?.controller ? "controlled" : "none",
      installed: media("(display-mode: standalone)") || n.standalone === true,
      storageMb: est?.usage != null ? Math.round(est.usage / 1e5) / 10 : null, quotaMb: est?.quota != null ? Math.round(est.quota / 1e6) : null,
    },
    device: {
      ua: navigator.userAgent, platform: n.userAgentData?.platform ?? navigator.platform, mobile: n.userAgentData?.mobile ?? null,
      brands: n.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`) ?? null,
      languages: [...(navigator.languages ?? [navigator.language])].slice(0, 5),
      viewport: [window.innerWidth, window.innerHeight], screen: [screen.width, screen.height], dpr: window.devicePixelRatio,
      orientation: screen.orientation?.type ?? null, touch: navigator.maxTouchPoints ?? 0,
      memoryGb: n.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, localTime: new Date().toString(),
      reducedMotion: media("(prefers-reduced-motion: reduce)"), cookies: navigator.cookieEnabled,
    },
    network: { online: navigator.onLine, type: n.connection?.type ?? null, effectiveType: n.connection?.effectiveType ?? null, downlinkMbps: n.connection?.downlink ?? null, rttMs: n.connection?.rtt ?? null, saveData: n.connection?.saveData ?? null },
    account: about.account, learner: about.learner,
    log: bugLog(),
  };
}

type Outcome = { ok: true; id: string } | { ok: false; why: "offline" | "tooMany" | "failed" };

async function post(body: Body, token: string | null): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST", body: JSON.stringify(body), credentials: "omit",
      // text/plain keeps the emulator's cross-origin request simple; the server reads the raw body either way.
      headers: { "Content-Type": "text/plain", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch { return { ok: false, why: "offline" }; }
  if (res.ok) { const j = await res.json().catch(() => ({})) as { id?: string }; return { ok: true, id: String(j.id ?? "") }; }
  return { ok: false, why: res.status === 429 ? "tooMany" : "failed" };
}

async function queued(): Promise<Queued[]> {
  const q = await storage.get<Queued[]>(QUEUE).catch(() => undefined);
  return Array.isArray(q) ? q : [];
}
async function enqueue(item: Queued) {
  // At most five wait on the phone; each can hold a picture of up to ~1 MB.
  await storage.set(QUEUE, [...(await queued()), item].slice(-5));
}
let flushing = false;
/**
 * Sends the reports that waited on this phone (App calls it at startup and when the connection returns). Each goes as
 * the account that wrote it while that account is signed in here, otherwise without a token (its details still say
 * whose it was). A report the server refuses is dropped; one that can't get through waits for next time.
 */
export async function flushReports(uid: string | null, token: (() => Promise<string>) | null): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const keep: Queued[] = [];
    for (const item of await queued()) {
      if (Date.now() - item.at > 30 * 864e5) continue; // a month old: let it go
      const tok = item.uid && item.uid === uid && token ? await token().catch(() => null) : null;
      const r = await post({ ...item.body, details: { ...item.body.details, queuedAt: new Date(item.at).toISOString() } }, tok);
      if (!r.ok && r.why !== "failed") keep.push(item);
    }
    if (keep.length) await storage.set(QUEUE, keep); else await storage.remove(QUEUE);
  } catch { /* storage unavailable: nothing to send */ } finally { flushing = false; }
}

export function ReportSheet({ shot: taken, about, uid, getToken, onClose }: {
  shot: Shot | null; about: About; uid: string | null; getToken: (() => Promise<string>) | null; onClose: () => void;
}) {
  const { t } = useI18n();
  const ids = { title: useId(), text: useId(), hint: useId() };
  const [text, setText] = useState("");
  const [shot, setShot] = useState<Shot | null>(taken);
  const [withShot, setWithShot] = useState(true);
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<"edit" | "sending" | "sent" | "queued">("edit");
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState("");
  const url = useMemo(() => redact(location.href), []);
  const box = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { void gather(about).then(setDetails); }, [about]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    try { setShot(await shrink(f)); setWithShot(true); } catch { setError(t("bug.badPicture")); }
  };

  const send = async () => {
    if (text.trim().length < 3) { setError(t("bug.tooShort")); box.current?.focus(); return; }
    setError(null); setState("sending");
    const body: Body = {
      text: text.trim(), url, details: details ?? await gather(about),
      shot: withShot && shot ? shot.url : null, ...(withShot && shot ? { shotW: shot.w, shotH: shot.h } : {}),
    };
    const token = getToken ? await getToken().catch(() => null) : null;
    const r = navigator.onLine ? await post(body, token) : { ok: false as const, why: "offline" as const };
    if (r.ok) { setId(r.id.slice(0, 8).toUpperCase()); setState("sent"); return; }
    if (r.why === "offline") {
      try { await enqueue({ uid, at: Date.now(), body }); setState("queued"); return; } catch { /* no storage: say it failed */ }
    }
    setState("edit");
    setError(t(r.why === "tooMany" ? "bug.tooMany" : "bug.failed"));
  };

  const done = state === "sent" || state === "queued";
  return (
    <div className="bug-sheet" role="dialog" aria-modal="true" aria-labelledby={ids.title} ref={sheet}>
      <div className="bug-head">
        <h2 className="bug-title" id={ids.title}>{t("bug.title")}</h2>
        <Button variant="ghost" iconOnly icon="close" onClick={onClose}>{t("bug.close")}</Button>
      </div>
      <div className="bug-body">
        {done ? (
          <div className="bug-done" role="status">
            <p className="bug-done-title">{state === "sent" ? t("bug.thanks") : t("bug.queued")}</p>
            {state === "sent" && id && <p className="muted">{t("bug.thanksBody", { id: isolate(id) })}</p>}
            <Button onClick={onClose}>{t("bug.done")}</Button>
          </div>
        ) : (
          <>
            <label className="bug-label" htmlFor={ids.text}>{t("bug.what")}</label>
            <p className="muted small" id={ids.hint}>{t("bug.whatHint")}</p>
            <textarea ref={box} id={ids.text} className="bug-text" rows={4} maxLength={4000} value={text} aria-describedby={ids.hint}
              aria-invalid={Boolean(error && text.trim().length < 3)} onChange={(e) => setText(e.target.value)} />

            <h3 className="bug-h3">{t("bug.shot")}</h3>
            {shot ? (
              <>
                <img className={withShot ? "bug-shot" : "bug-shot is-off"} src={shot.url} alt={t("bug.shotAlt")} />
                <Switch label={t("bug.shotInclude")} description={t("bug.shotNote")} checked={withShot} onChange={setWithShot} />
                {shot !== taken && <Button size="sm" variant="ghost" onClick={() => setShot(taken)}>{t("bug.removePicture")}</Button>}
              </>
            ) : <p className="muted small">{t("bug.noShot")}</p>}
            <label className="file-pick">
              <input type="file" accept="image/*" onChange={(e) => void pick(e)} />
              <Icon name="image" size={20} /><span>{t("bug.addPicture")}</span>
            </label>

            <h3 className="bug-h3">{t("bug.alsoSent")}</h3>
            <ul className="bug-list">
              <li>{t("bug.sentPage")}: <bdi dir="ltr">{new URL(url || location.href).pathname}</bdi></li>
              <li>{about.who ? t("bug.sentAccount", { who: isolate(about.who) }) : t("bug.sentGuest")}</li>
              <li>{t("bug.sentDevice")}</li>
              <li>{t("bug.sentNetwork")}</li>
              <li>{t("bug.sentLog")}</li>
              <li>{t("bug.sentLearning")}</li>
            </ul>
            <details className="bug-all">
              <summary>{t("bug.everything")}</summary>
              <pre dir="ltr" className="bug-json">{JSON.stringify({ url, ...details }, null, 2)}</pre>
            </details>

            {error && <p className="err-text" role="alert">{error}</p>}
            <Button block loading={state === "sending"} onClick={() => void send()}>{t("bug.send")}</Button>
          </>
        )}
      </div>
    </div>
  );
}
