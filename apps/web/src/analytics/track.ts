/**
 * Usage statistics for phones on expensive, patchy data (TECHNICAL.md "Analytics"). Startup code, so no Firebase:
 * - track() only adds an event to a queue kept in IndexedDB, so nothing is lost offline and nothing waits on the network.
 * - The queue goes out in one batch, gzipped where the browser can, to darsiai.org/api/collect (same site: no second
 *   connection). It is sent when the app goes to the background, when the connection returns, and once 30 events
 *   have built up. No timers, no polling. With Data saver (or the browser's Save-Data) it waits for 100.
 * - A failed send keeps the batch for next time; a batch the server refuses as malformed is dropped.
 * - The server counts the events for /super/analytics and forwards them to Google Analytics (Firebase's web stream).
 * - Nothing names a person: a random id for this phone, the role, language and organization id. Me can switch it off.
 */
import { firebaseConfig, firebaseReady, functionsRegion, useEmulators } from "../firebase-config";
import { storage } from "../platform";

export type EventName = "session_start" | "screen_view" | "lesson_start" | "lesson_complete" | "lab_open" | "unit_download" | "onboarding_done" | "sign_up" | "sign_in";
type Params = Record<string, string | number>;
interface Ev { n: EventName; t: number; p?: Params; o?: 1 }
/** Who is using the app, as the server stores it: role ("guest" without an account), audience, language, org, installed. */
export interface Context { r: string; a?: string; l: string; o?: string; i: 0 | 1 }

const QUEUE = "darsi:events", DEVICE = "darsi:device";
const MAX_QUEUE = 300, BATCH = 100;

let on = false, saver = false, ctx: Context = { r: "guest", l: "en", i: 0 };
let queue: Ev[] = [];
let loaded: Promise<void> | null = null;
let device: string | null = null;
let sending = false, lastSent = 0, saveSoon: ReturnType<typeof setTimeout> | undefined;

const endpoint = () => (useEmulators
  ? `http://${location.hostname}:5001/${firebaseConfig.projectId}/${functionsRegion}/collect`
  : "/api/collect");

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");

function load(): Promise<void> {
  return (loaded ??= (async () => {
    const [q, d] = await Promise.all([storage.get<Ev[]>(QUEUE).catch(() => undefined), storage.get<string>(DEVICE).catch(() => undefined)]);
    // Events tracked before the stored queue was read go after it.
    queue = [...(Array.isArray(q) ? q : []), ...queue].slice(-MAX_QUEUE);
    device = typeof d === "string" && /^[a-z0-9]{16,40}$/.test(d) ? d : randomId();
    if (device !== d) storage.set(DEVICE, device).catch(() => {});
  })());
}

function persist() {
  clearTimeout(saveSoon);
  saveSoon = setTimeout(() => { storage.set(QUEUE, queue).catch(() => {}); }, 1500);
}

const saveData = () => saver || Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream !== "function") return null;
  try { return await new Response(new Response(text).body!.pipeThrough(new CompressionStream("gzip"))).blob(); } catch { return null; }
}

/**
 * Sends what is queued (up to 100 events) if the phone is online. `leaving`: the app went to the background.
 * `as`: someone signed in or out, so what is queued now goes at once, as the person who did it.
 */
export async function flush(leaving = false, as?: Context): Promise<void> {
  if (!on || sending || !navigator.onLine) return;
  const before = as ? queue.slice(0, BATCH) : null;
  await load();
  if (!queue.length) return;
  const full = queue.length >= (saveData() ? BATCH : 30);
  // Going to the background sends what is queued, but at most every 15 minutes (people switch apps a lot), and with
  // Data saver only once the oldest event is a day old.
  const due = leaving && (saveData() ? Date.now() / 1000 - queue[0].t > 86400 : Date.now() - lastSent > 15 * 60e3);
  if (!before && !full && !due) return;
  const sent = before ?? queue.slice(0, BATCH);
  if (!sent.length) return;
  sending = true;
  try {
    const text = JSON.stringify({ d: device, c: as ?? ctx, e: sent });
    const z = await gzip(text);
    // keepalive lets the request finish if the page is closed right after going to the background.
    const res = await fetch(z ? `${endpoint()}?z=1` : endpoint(), { method: "POST", body: z ?? text, headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "omit" });
    // 2xx: counted. 400/413: malformed or too big, so retrying would never help. Anything else: try again next time.
    if (res.ok || res.status === 400 || res.status === 413) { queue = queue.filter((e) => !sent.includes(e)); persist(); lastSent = Date.now(); }
  } catch { /* offline after all, or blocked: the batch waits */ } finally { sending = false; }
}

/** Adds an event to the queue. Never throws and never waits for the network. */
export function track(n: EventName, p?: Params) {
  if (!on) return;
  const e: Ev = { n, t: Math.floor(Date.now() / 1000), ...(p && Object.keys(p).length ? { p } : {}), ...(navigator.onLine ? {} : { o: 1 as const }) };
  queue.push(e);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  persist();
  if (queue.length >= 30) void flush();
}

let wired = false;
/**
 * Called by App whenever who is using the app changes. Switched off (Me, or no Firebase config in this build), the
 * queue is emptied and nothing is sent.
 */
export function configureAnalytics(o: { enabled: boolean; context: Context; dataSaver: boolean }) {
  on = o.enabled && firebaseReady && typeof fetch === "function";
  const prev = ctx;
  ctx = o.context; saver = o.dataSaver;
  // A batch carries who sent it; events made before someone signed in or out belong to the account that made them.
  if (on && loaded && queue.length && (prev.r !== ctx.r || prev.o !== ctx.o)) void flush(false, prev);
  if (!on) { if (queue.length) { queue = []; storage.remove(QUEUE).catch(() => {}); } return; }
  void load();
  if (wired) return;
  wired = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(true); });
  window.addEventListener("online", () => { void flush(true); });
}

/** For tests: forget everything held in memory. */
export function resetAnalytics() { on = false; queue = []; loaded = null; device = null; sending = false; lastSent = 0; }
