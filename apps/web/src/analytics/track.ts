/**
 * Usage statistics for phones on expensive, patchy data (TECHNICAL.md "Analytics"). Startup code, so no Firebase:
 * - track() only adds an event to a queue kept in IndexedDB, so nothing is lost offline and nothing waits on the network.
 * - The queue goes out in one batch, gzipped where the browser can, to darsiai.org/api/collect (same site: no second
 *   connection). It is sent when the app goes to the background, when the connection returns, and once 30 events
 *   have built up. No timers, no polling. With Data saver (or the browser's Save-Data) it waits for 100.
 * - A failed send keeps the batch for next time; a batch the server refuses as malformed is dropped.
 * - Every batch has its own random id (`b`). A batch whose answer never came (the server was down, the page closed,
 *   the connection dropped after the request left) goes again exactly as it was, under the same id, so the server
 *   counts it once (functions/src/analytics.ts). The id is kept with the stored queue until the batch is accepted.
 * - Every batch says which build sent it (`c.v`, build.ts), so the app's own errors (`app_error`) are counted per build.
 * - The server counts the events for /super/analytics and forwards them to Google Analytics (Firebase's web stream).
 * - Nothing names a person: a random id for this phone, the role, language and organization id. Me can switch it off.
 */
import { BUILD } from "../build";
import { firebaseConfig, firebaseReady, functionsRegion, useEmulators } from "../firebase-config";
import { storage } from "../platform";

export type EventName = "session_start" | "screen_view" | "lesson_start" | "lesson_complete" | "lab_open" | "unit_download" | "onboarding_done" | "sign_up" | "sign_in" | "view_paywall" | "begin_checkout" | "tutor_open" | "tutor_question" | "app_error";
type Params = Record<string, string | number>;
interface Ev { n: EventName; t: number; p?: Params; o?: 1 }
/**
 * Who is using the app, as the server stores it: role ("guest" without an account), audience, language, org, installed.
 * `v` is the build (build.ts): every batch gets it when it is sent, so callers leave it out.
 */
export interface Context { r: string; a?: string; l: string; o?: string; i: 0 | 1; v?: string }
/** A batch that was sent and not yet accepted: its id, and how many events from the front of the queue it holds. */
interface Pending { id: string; count: number }
/** The queue as stored: the events alone (as every build before batch ids wrote it), or with the batch still pending. */
type Stored = Ev[] | { e: Ev[]; b: Pending };

const QUEUE = "darsi:events", DEVICE = "darsi:device";
const MAX_QUEUE = 300, BATCH = 100;

let on = false, saver = false, ctx: Context = { r: "guest", l: "en", i: 0 };
let queue: Ev[] = [];
let pending: Pending | null = null;
let loaded: Promise<void> | null = null;
let device: string | null = null;
let sending = false, lastSent = 0, saveSoon: ReturnType<typeof setTimeout> | undefined;

const endpoint = () => (useEmulators
  ? `http://${location.hostname}:5001/${firebaseConfig.projectId}/${functionsRegion}/collect`
  : "/api/collect");

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
const randomId = () => randomHex(10);
/** A batch's id: 16 lower-case hex characters. */
const batchId = () => randomHex(8);

function load(): Promise<void> {
  return (loaded ??= (async () => {
    const [q, d] = await Promise.all([storage.get<unknown>(QUEUE).catch(() => undefined), storage.get<string>(DEVICE).catch(() => undefined)]);
    const rec = q as Ev[] | { e?: unknown; b?: { id?: unknown; count?: unknown } } | null | undefined;
    const stored: Ev[] = Array.isArray(rec) ? rec : Array.isArray(rec?.e) ? (rec.e as Ev[]) : [];
    const b = Array.isArray(rec) ? undefined : rec?.b;
    const count = typeof b?.count === "number" && Number.isInteger(b.count) ? b.count : 0;
    // The batch that was on its way when the app last closed is still the front of the queue, unless the cap cuts it.
    pending = b && typeof b.id === "string" && /^[0-9a-f]{16}$/.test(b.id) && count >= 1 && count <= Math.min(BATCH, stored.length)
      && stored.length + queue.length <= MAX_QUEUE ? { id: b.id, count } : null;
    // Events tracked before the stored queue was read go after it.
    queue = [...stored, ...queue].slice(-MAX_QUEUE);
    device = typeof d === "string" && /^[a-z0-9]{16,40}$/.test(d) ? d : randomId();
    if (device !== d) storage.set(DEVICE, device).catch(() => {});
  })());
}

/** What is stored: the plain list while nothing is pending, so a phone still on an older build reads it as before. */
const record = (): Stored => (pending ? { e: queue, b: pending } : queue);
function persist() {
  clearTimeout(saveSoon);
  saveSoon = setTimeout(() => { storage.set(QUEUE, record()).catch(() => {}); }, 1500);
}

const saveData = () => saver || Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream !== "function") return null;
  try { return await new Response(new Response(text).body!.pipeThrough(new CompressionStream("gzip"))).blob(); } catch { return null; }
}

/**
 * One request: the events `sent` under the batch id `id`, from `who`. True once the server has taken the batch (or
 * refused it for good); the events are then off the queue.
 */
async function send(sent: Ev[], id: string, who: Context): Promise<boolean> {
  // Remembered before it leaves, and stored at once (the app may be closing): if no answer ever comes, the next try,
  // even after a restart, sends the same events under the same id. Only a batch that is the front of the queue can be
  // found again by its length (events made before the stored queue was read may sit further back: sent, not remembered).
  pending = sent.every((e, i) => queue[i] === e) ? { id, count: sent.length } : null;
  if (pending) { clearTimeout(saveSoon); storage.set(QUEUE, record()).catch(() => {}); }
  try {
    const text = JSON.stringify({ d: device, b: id, c: { ...who, v: BUILD }, e: sent });
    const z = await gzip(text);
    // keepalive lets the request finish if the page is closed right after going to the background.
    const res = await fetch(z ? `${endpoint()}?z=1` : endpoint(), { method: "POST", body: z ?? text, headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "omit" });
    // 2xx: counted. 400/413: malformed or too big, so retrying would never help. Anything else: try again next time.
    if (res.ok || res.status === 400 || res.status === 413) { queue = queue.filter((e) => !sent.includes(e)); pending = null; persist(); lastSent = Date.now(); return true; }
  } catch { /* offline after all, or blocked: the batch waits */ }
  return false;
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
  if (before && !before.length) return;
  sending = true;
  try {
    // A batch that never got its answer goes first, as it was: the same events under the same id, so a server that
    // did count it the first time skips it now. What was queued since then follows in a batch of its own.
    if (pending && pending.count > queue.length) pending = null;
    if (pending && !(await send(queue.slice(0, pending.count), pending.id, as ?? ctx))) return;
    const sent = (before ? before.filter((e) => queue.includes(e)) : queue).slice(0, BATCH);
    if (sent.length) await send(sent, batchId(), as ?? ctx);
  } finally { sending = false; }
}

/** Adds an event to the queue. Never throws and never waits for the network. False: switched off, so nothing was kept. */
export function track(n: EventName, p?: Params): boolean {
  if (!on) return false;
  const e: Ev = { n, t: Math.floor(Date.now() / 1000), ...(p && Object.keys(p).length ? { p } : {}), ...(navigator.onLine ? {} : { o: 1 as const }) };
  queue.push(e);
  // Over the cap the oldest go, and with them the batch that was waiting for its answer: it can't go again as it was.
  if (queue.length > MAX_QUEUE) { queue.splice(0, queue.length - MAX_QUEUE); pending = null; }
  persist();
  if (queue.length >= 30) void flush();
  return true;
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
  if (!on) { pending = null; if (queue.length) { queue = []; storage.remove(QUEUE).catch(() => {}); } return; }
  void load();
  if (wired) return;
  wired = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(true); });
  window.addEventListener("online", () => { void flush(true); });
}

/** This phone's random analytics id, for a checkout to pass to Google Analytics; null when sharing is switched off. */
export async function deviceId(): Promise<string | null> {
  if (!on) return null;
  await load();
  return device;
}

/** For tests: forget everything held in memory. */
export function resetAnalytics() { on = false; queue = []; pending = null; loaded = null; device = null; sending = false; lastSent = 0; clearTimeout(saveSoon); }
