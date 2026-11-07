/**
 * Analytics without Firebase (TECHNICAL.md "Analytics"), so the tests can run it: what a phone may send to `collect`,
 * how a batch becomes daily counts, the Google Analytics Measurement Protocol payloads, and the accounts and
 * organizations overview (`stats/overview`) built from users' summaries.
 */

export const EVENTS = ["session_start", "screen_view", "lesson_start", "lesson_complete", "lab_open", "unit_download", "onboarding_done", "sign_up", "sign_in", "view_paywall", "begin_checkout", "tutor_open", "tutor_question"] as const;
export type EventName = (typeof EVENTS)[number];
const ROLES = ["guest", "learner", "student", "teacher", "orgAdmin", "superadmin"];

/** An event as the phone sends it: name, time (seconds), its few parameters, and whether it happened offline. */
export interface InEvent { n: EventName; t: number; p: Record<string, string | number>; off: boolean }
/** Who sent the batch. Nothing here names a person: `d` is a random id made on the phone. */
export interface Ctx { d: string; role: string; aud?: string; lang: string; org?: string; inst: boolean; ver?: string }
export interface Batch { ctx: Ctx; events: InEvent[] }

export const MAX_EVENTS = 100;
/** How far ahead of the server's clock an event may be (seconds). */
export const FUTURE_SEC = 600;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DEVICE = /^[a-z0-9]{16,40}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const SCREEN = /^[a-z][a-z_]{0,23}$/;

/** Each event's parameters, and how to check them: an id, a short word, or a whole number in a range. */
const PARAMS: Record<EventName, Record<string, "id" | "screen" | "lang" | [number, number]>> = {
  session_start: {},
  screen_view: { s: "screen" },
  lesson_start: { u: "id", l: "id", tr: "id" },
  lesson_complete: { u: "id", l: "id", tr: "id", acc: [0, 100], sec: [0, 86400], xp: [0, 100] },
  lab_open: { lab: "id" },
  unit_download: { u: "id", mb: [0, 2000] },
  onboarding_done: { a: "id", n: [0, 20] },
  sign_up: { m: "id" },
  sign_in: { m: "id" },
  // Darsi Super funnel (docs/SUPER.md §3): purchases themselves come from the payment webhooks, never from phones.
  view_paywall: { from: "screen" },
  begin_checkout: { plan: "id", cur: "id", prov: "id" },
  tutor_open: { u: "id" },
  tutor_question: { m: "id" },
};

const str = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : undefined);

/**
 * A batch from a phone, checked: unknown events and parameters are dropped, times outside the last 30 days (or more
 * than 10 minutes ahead: phones with a wrong clock, or someone filling a day that hasn't started; H3) are dropped,
 * and anything malformed at the top refuses the whole batch.
 */
export function parseBatch(raw: unknown, nowSec: number): Batch {
  const b = raw as { d?: unknown; c?: Record<string, unknown>; e?: unknown };
  const d = str(b?.d, DEVICE);
  if (!d || !b.c || !Array.isArray(b.e) || b.e.length > MAX_EVENTS) throw new Error("bad batch");
  const c = b.c;
  const role = typeof c.r === "string" && ROLES.includes(c.r) ? c.r : "guest";
  const ctx: Ctx = {
    d, role, lang: str(c.l, LANG) ?? "und", inst: c.i === 1,
    ...(str(c.a, ID) ? { aud: c.a as string } : {}), ...(str(c.o, ID) ? { org: c.o as string } : {}), ...(str(c.v, ID) ? { ver: c.v as string } : {}),
  };
  const events: InEvent[] = [];
  for (const x of b.e as unknown[]) {
    const e = x as { n?: unknown; t?: unknown; p?: Record<string, unknown>; o?: unknown };
    const n = e?.n as EventName;
    if (!EVENTS.includes(n) || typeof e.t !== "number" || e.t < nowSec - 30 * 86400 || e.t > nowSec + FUTURE_SEC) continue;
    const p: Record<string, string | number> = {};
    for (const [k, kind] of Object.entries(PARAMS[n])) {
      const v = e.p?.[k];
      if (Array.isArray(kind)) { if (typeof v === "number" && Number.isFinite(v)) p[k] = Math.round(Math.min(kind[1], Math.max(kind[0], v))); }
      else { const s = str(v, kind === "id" ? ID : kind === "screen" ? SCREEN : LANG); if (s) p[k] = s; }
    }
    events.push({ n, t: Math.floor(e.t), p, off: e.o === 1 });
  }
  return { ctx, events };
}

/**
 * What counts may be kept under, by name (H3 in the security review): analytics/{day} turns ids into map keys, so a
 * phone's own strings are used only when Darsi knows them. Courses from the catalogs, labs from the app, organizations,
 * tracks and languages from the platform's settings, a fixed list of screens; anything else counts as "other".
 */
export interface Known { units: ReadonlySet<string>; labs: ReadonlySet<string>; orgs: ReadonlySet<string>; tracks: ReadonlySet<string>; langs: ReadonlySet<string> }
export const SCREENS: ReadonlySet<string> = new Set(["home", "welcome", "learn", "lesson", "lab", "labs", "kit", "downloads", "me", "tracks", "tutor", "upgrade", "signin", "signup", "forgot", "org", "admin", "teach", "super", "results"]);
export const AUDIENCES: ReadonlySet<string> = new Set(["teachers", "students"]);
export const OTHER = "other";
const known = (v: string, set: ReadonlySet<string>) => (set.has(v) ? v : OTHER);

export function sanitize({ ctx, events }: Batch, k: Known): Batch {
  const { org, aud, ver, ...rest } = ctx;
  const out: Ctx = { ...rest, lang: known(ctx.lang, k.langs) };
  if (org && k.orgs.has(org)) out.org = org;
  if (aud) out.aud = known(aud, AUDIENCES);
  if (ver && /^[0-9A-Za-z._-]{1,24}$/.test(ver)) out.ver = ver;
  return {
    ctx: out,
    events: events.map((e) => {
      const p = { ...e.p };
      if (typeof p.u === "string") p.u = known(p.u, k.units);
      if (typeof p.tr === "string") p.tr = known(p.tr, k.tracks);
      if (typeof p.lab === "string") p.lab = known(p.lab, k.labs);
      if (typeof p.s === "string") p.s = known(p.s, SCREENS);
      return { ...e, p };
    }),
  };
}

export const dayOf = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** A nested object of counts, merged into analytics/{day} with FieldValue.increment. */
export type Counts = { [k: string]: number | Counts };
function add(c: Counts, path: string[], n = 1) {
  let o = c;
  for (const k of path.slice(0, -1)) o = (o[k] ??= {}) as Counts;
  const last = path[path.length - 1];
  o[last] = ((o[last] as number | undefined) ?? 0) + n;
}

/**
 * The batch as counts per day (UTC): every event by name, made offline, and by role; sessions by language, role,
 * audience and installed app; finished lessons by track and course, with their accuracy and time summed (divide by
 * the count for averages); labs opened; downloads; and per organization (as the phone says: for trends only, the
 * overview's org figures come from accounts).
 */
export function dailyCounts({ ctx, events }: Batch): Record<string, Counts> {
  const days: Record<string, Counts> = {};
  for (const e of events) {
    const c = (days[dayOf(e.t)] ??= {});
    add(c, ["n"]); add(c, ["ev", e.n]); add(c, ["role", ctx.role, e.n === "lesson_complete" ? "lessons" : "events"]);
    if (e.off) add(c, ["off"]);
    if (ctx.org) add(c, ["org", ctx.org, e.n === "lesson_complete" ? "lessons" : "events"]);
    if (e.n === "session_start") {
      add(c, ["sessions", "n"]); add(c, ["sessions", "lang", ctx.lang]); add(c, ["sessions", "role", ctx.role]);
      if (ctx.aud) add(c, ["sessions", "aud", ctx.aud]);
      if (ctx.inst) add(c, ["sessions", "installed"]);
      if (e.off) add(c, ["sessions", "offline"]);
    } else if (e.n === "lesson_complete") {
      add(c, ["lessons", "n"]);
      if (typeof e.p.tr === "string") add(c, ["lessons", "track", e.p.tr]);
      if (typeof e.p.u === "string") add(c, ["lessons", "unit", e.p.u]);
      if (typeof e.p.acc === "number") { add(c, ["lessons", "acc"], e.p.acc); add(c, ["lessons", "accN"]); }
      if (typeof e.p.sec === "number") add(c, ["lessons", "sec"], e.p.sec);
      add(c, ["lessons", "lang", ctx.lang]);
    } else if (e.n === "lab_open" && typeof e.p.lab === "string") add(c, ["labs", e.p.lab]);
    else if (e.n === "unit_download") {
      add(c, ["downloads", "n"]);
      if (typeof e.p.mb === "number") add(c, ["downloads", "mb"], e.p.mb);
    } else if (e.n === "screen_view" && typeof e.p.s === "string") add(c, ["screens", e.p.s]);
  }
  return days;
}

/**
 * Measurement Protocol requests for Google Analytics (Firebase Analytics' web stream): 25 events per request, only
 * events from the last 72 hours (older ones are refused there; they still count in Darsi's own numbers), the phone's
 * random id as client_id, and role, audience and language as user properties. No names or emails, ever.
 */
export function measurementPayloads({ ctx, events }: Batch, nowSec: number): Record<string, unknown>[] {
  const recent = events.filter((e) => e.t >= nowSec - 71 * 3600);
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < recent.length; i += 25) {
    out.push({
      client_id: ctx.d,
      user_properties: { role: { value: ctx.role }, audience: { value: ctx.aud ?? "" }, app_language: { value: ctx.lang }, installed: { value: ctx.inst ? "yes" : "no" } },
      events: recent.slice(i, i + 25).map((e) => ({
        name: e.n,
        timestamp_micros: e.t * 1e6,
        // engagement_time_msec makes Google Analytics count the visit as engaged (it shows in active users).
        params: { ...e.p, offline: e.off ? 1 : 0, ...(ctx.org ? { org: ctx.org } : {}), engagement_time_msec: 100, session_id: String(Math.floor(e.t / 1800)) },
      })),
    });
  }
  return out;
}

/** The fields of users/{uid} the overview reads (a select(), so the rest never leaves Firestore). */
/** `graded`: the person's lessons with questions marked right or wrong (summaries before 2026-11-06 lack it: all of them). */
export interface UserRow { role?: string; orgId?: string | null; createdAt?: number | null; lastActive?: string | null; lessonsDone?: number; graded?: number; xp?: number; avgAccuracy?: number; weeks?: Record<string, number> }
export interface OrgRow { id: string; name?: unknown; status?: string; country?: unknown; memberCount?: number }
export interface OrgStats { name: string; country?: string; members: number; teachers: number; students: number; active7: number; active30: number; lessons: number; xp: number; avgAccuracy: number | null }
export interface Overview {
  at: string;
  users: { total: number; byRole: Record<string, number>; new7: number; new30: number; active7: number; active30: number; withLessons: number };
  lessons: number; xp: number; avgAccuracy: number | null;
  /** Lessons finished per ISO week, all accounts together (the 12 weeks each summary keeps). */
  weeks: Record<string, number>;
  orgs: Record<string, OrgStats>;
  orgsByStatus: Record<string, number>;
}

/**
 * Accounts and organizations, from every user's summary: one pass, run daily and on demand from /super/analytics.
 * Accuracy averages people who have graded lessons (FC-06). An organization's name and country are cut to the sizes
 * the functions allow, so an odd org document can't push stats/overview past Firestore's 1 MiB (it used to copy
 * whatever an org admin wrote).
 */
export function overview(users: UserRow[], orgs: OrgRow[], now = new Date()): Overview {
  const ms = now.getTime();
  const within = (iso: string | null | undefined, days: number) => Boolean(iso) && ms - Date.parse(iso!) < days * 864e5;
  const byRole: Record<string, number> = {};
  const weeks: Record<string, number> = {};
  let new7 = 0, new30 = 0, active7 = 0, active30 = 0, lessons = 0, xp = 0, accSum = 0, accN = 0, withLessons = 0;
  const per: Record<string, OrgStats & { accSum: number; accN: number }> = {};
  const active = new Set(orgs.filter((o) => o.status === "active").map((o) => o.id));
  for (const o of orgs) {
    if (!active.has(o.id)) continue;
    const name = typeof o.name === "string" && o.name ? o.name.slice(0, 120) : o.id;
    const country = typeof o.country === "string" ? o.country.slice(0, 80) : "";
    per[o.id] = { name, ...(country ? { country } : {}), members: 0, teachers: 0, students: 0, active7: 0, active30: 0, lessons: 0, xp: 0, avgAccuracy: null, accSum: 0, accN: 0 };
  }
  for (const u of users) {
    const role = u.role ?? "learner";
    byRole[role] = (byRole[role] ?? 0) + 1;
    if (u.createdAt && ms - u.createdAt < 7 * 864e5) new7++;
    if (u.createdAt && ms - u.createdAt < 30 * 864e5) new30++;
    const a7 = within(u.lastActive, 7), a30 = within(u.lastActive, 30);
    if (a7) active7++;
    if (a30) active30++;
    const done = u.lessonsDone ?? 0, scored = typeof u.graded === "number" ? u.graded : done;
    lessons += done; xp += u.xp ?? 0;
    if (done) withLessons++;
    if (scored) { accSum += u.avgAccuracy ?? 0; accN++; }
    for (const [w, n] of Object.entries(u.weeks ?? {})) weeks[w] = (weeks[w] ?? 0) + n;
    const o = u.orgId ? per[u.orgId] : undefined;
    if (o) {
      o.members++; if (role === "teacher") o.teachers++; if (role === "student") o.students++;
      if (a7) o.active7++; if (a30) o.active30++;
      o.lessons += done; o.xp += u.xp ?? 0;
      if (scored) { o.accSum += u.avgAccuracy ?? 0; o.accN++; }
    }
  }
  const orgsOut: Record<string, OrgStats> = {};
  for (const [id, { accSum: s, accN: n, ...o }] of Object.entries(per)) orgsOut[id] = { ...o, avgAccuracy: n ? s / n : null };
  const orgsByStatus: Record<string, number> = {};
  for (const o of orgs) orgsByStatus[o.status ?? "pending"] = (orgsByStatus[o.status ?? "pending"] ?? 0) + 1;
  return {
    at: now.toISOString(),
    users: { total: users.length, byRole, new7, new30, active7, active30, withLessons },
    lessons, xp, avgAccuracy: accN ? accSum / accN : null, weeks, orgs: orgsOut, orgsByStatus,
  };
}
