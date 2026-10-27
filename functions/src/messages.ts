/**
 * Push notification wording, in English and Arabic. Pure: no Firebase imports, so it is unit-tested directly.
 * Tone: "Encourage, never punish". No guilt, no threats, no emoji, and Arabic never uses "·".
 * A phone set to a language platform admins added gets the English wording.
 */
import { LANG_CODE } from "./shared/languages.js";

/** A device's language: English, Arabic, or one platform admins added ("fr", "pt-br"). */
export type Lang = string;
/** The wording a device gets: Arabic for Arabic, English for every other language. */
export const wordingFor = (lang: Lang): "en" | "ar" => (lang === "ar" ? "ar" : "en");
/** A language code that may go into a topic name; anything else counts as English. */
export const topicLang = (lang: unknown): Lang => (typeof lang === "string" && LANG_CODE.test(lang) ? lang : "en");
export type Cat = "reminders" | "reviews" | "staff" | "news";
export type Kind =
  | "daily0" | "daily1" | "daily2" | "weekGoal" | "streak" | "comeback7" | "comeback21"
  | "reviewApproved" | "reviewRevise" | "staffSubmission" | "staffOrgRequest";

/** Values a message can fill in. `name` and `org` are isolated; `uid` only builds links. */
export interface MessageVars { n?: number; name?: string; org?: string; feedback?: string; uid?: string }
export interface Text { title: string; body: string }

/** Unicode first-strong isolate: keeps a Latin name from reordering an Arabic sentence, and the other way round. */
export const isolate = (s: string) => `⁨${s}⁩`;
export const formatNumber = (n: number, lang: Lang) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en").format(n);
export const dirOf = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");
export const FEEDBACK_MAX = 140;

/** Reviewer feedback as a notification body: whitespace collapsed, at most 140 characters including the ellipsis. */
export function trimFeedback(s: unknown, max = FEEDBACK_MAX): string {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  const chars = Array.from(t); // code points, so a surrogate pair is never cut in half
  return chars.length <= max ? t : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

type Fill = (v: MessageVars, lang: Lang) => string;
const fixed = (s: string): Fill => () => s;
const num = (v: MessageVars, lang: Lang) => formatNumber(Math.max(0, Math.round(v.n ?? 0)), lang);
const name = (v: MessageVars) => isolate((v.name ?? "").trim() || "—");
const org = (v: MessageVars) => isolate((v.org ?? "").trim() || "—");
const feedbackOr = (fallback: string): Fill => (v) => trimFeedback(v.feedback) || fallback;

interface Entry { cat: Cat; link: string; en: { title: Fill; body: Fill }; ar: { title: Fill; body: Fill } }

/** The full catalogue. `link` may hold {uid}, filled from vars. */
export const CATALOGUE: Record<Kind, Entry> = {
  daily0: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Your 5-minute lesson is ready"), body: fixed("One short lesson today, one new idea for your class tomorrow.") },
    ar: { title: fixed("درسك ذو الدقائق الخمس جاهز"), body: fixed("درس قصير اليوم، وفكرة جديدة لصفّك غدًا.") },
  },
  daily1: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Five minutes for you?"), body: fixed("Pick up where you left off. It only takes five minutes.") },
    ar: { title: fixed("خمس دقائق لك اليوم؟"), body: fixed("تابع من حيث توقفت، فالأمر لا يستغرق سوى خمس دقائق.") },
  },
  daily2: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Something new for your class"), body: fixed("Today's lesson ends with an idea you can try tomorrow.") },
    ar: { title: fixed("شيء جديد لصفّك"), body: fixed("ينتهي درس اليوم بفكرة يمكنك تجربتها غدًا.") },
  },
  weekGoal: {
    cat: "reminders", link: "/learn",
    en: {
      title: (v, l) => (Math.round(v.n ?? 0) === 1 ? "1 lesson left for this week's goal" : `${num(v, l)} lessons left for this week's goal`),
      body: fixed("You're close. A short lesson now keeps you on track."),
    },
    ar: { title: (v, l) => `دروس متبقية لهدف هذا الأسبوع: ${num(v, l)}`, body: fixed("أنت قريب. درس قصير الآن يُبقيك على المسار.") },
  },
  streak: {
    cat: "reminders", link: "/learn",
    en: { title: (v, l) => `Your streak: ${num(v, l)} weeks`, body: fixed("You've learned every week lately. One lesson keeps it going.") },
    ar: { title: (v, l) => `سلسلة الأسابيع: ${num(v, l)}`, body: fixed("تعلّمت في كل أسبوع مؤخرًا. درس واحد يُبقي السلسلة مستمرة.") },
  },
  comeback7: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("We saved your place"), body: fixed("Your next lesson is waiting, and it takes five minutes.") },
    ar: { title: fixed("حفظنا مكانك"), body: fixed("درسك التالي بانتظارك، ولا يستغرق سوى خمس دقائق.") },
  },
  comeback21: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("New ideas for your classroom"), body: fixed("Come back for a 5-minute lesson whenever you're ready.") },
    ar: { title: fixed("أفكار جديدة لصفّك"), body: fixed("عُد لدرس من خمس دقائق متى كنت مستعدًا.") },
  },
  reviewApproved: {
    cat: "reviews", link: "/learn",
    en: { title: fixed("Your project was approved"), body: feedbackOr("Well done, your project was approved.") },
    ar: { title: fixed("تمت الموافقة على مشروعك"), body: feedbackOr("أحسنت، تمت الموافقة على مشروعك.") },
  },
  reviewRevise: {
    cat: "reviews", link: "/learn",
    en: { title: fixed("Feedback on your project"), body: feedbackOr("Your reviewer suggested a few changes.") },
    ar: { title: fixed("ملاحظات على مشروعك"), body: feedbackOr("اقترح المراجِع بعض التعديلات.") },
  },
  staffSubmission: {
    cat: "staff", link: "/teach/{uid}",
    en: { title: fixed("New project to review"), body: (v) => `${name(v)} sent a project for review.` },
    ar: { title: fixed("مشروع جديد للمراجعة"), body: (v) => `وصل مشروع جديد من ${name(v)} للمراجعة.` },
  },
  staffOrgRequest: {
    cat: "staff", link: "/super",
    en: { title: fixed("New organization request"), body: (v) => `${org(v)} asked to join Darsi.` },
    ar: { title: fixed("طلب مؤسسة جديد"), body: (v) => `طلبت ${org(v)} الانضمام إلى «درسي».` },
  },
};

export const KINDS = Object.keys(CATALOGUE) as Kind[];
export const catOf = (kind: Kind): Cat => CATALOGUE[kind].cat;

/** Title and body for one kind in one language, with the vars filled in. */
export function message(kind: Kind, lang: Lang, vars: MessageVars = {}): Text {
  const e = CATALOGUE[kind][lang === "ar" ? "ar" : "en"];
  return { title: e.title(vars, lang), body: e.body(vars, lang) };
}

/** The default app path for a kind ("/teach/{uid}" becomes "/teach/abc"). */
export function linkFor(kind: Kind, vars: MessageVars = {}): string {
  return CATALOGUE[kind].link.replace("{uid}", encodeURIComponent(vars.uid ?? ""));
}

/** Notification tag: automatic nudges share one so a new one replaces the old. */
export function tagFor(kind: Kind, id?: string): string {
  const cat = catOf(kind);
  if (cat === "reminders") return "darsi-nudge";
  const prefix = cat === "reviews" ? "review" : cat;
  return id ? `darsi-${prefix}-${id}` : `darsi-${prefix}`;
}

export interface PushData { [key: string]: string; title: string; body: string; link: string; tag: string; lang: Lang; dir: "rtl" | "ltr" }

/** Data-only web push, read by public/push-sw.js. Kept small: a day's TTL, normal urgency. */
export function webpush(text: Text, lang: Lang, link: string, tag: string) {
  const data: PushData = { title: text.title, body: text.body, link, tag, lang, dir: dirOf(lang) };
  return { headers: { TTL: "86400", Urgency: "normal" }, data };
}

/* ---------- Announcement topics ---------- */

export type Audience = { type: "all" } | { type: "org"; orgId: string } | { type: "role"; role: "student" | "teacher" | "orgAdmin" };
/** FCM topic names allow [a-zA-Z0-9-_.~%]; ids and roles are checked before they become part of one. */
const TOPIC_PART = /^[A-Za-z0-9_-]{1,128}$/;
const ROLES = ["learner", "student", "teacher", "orgAdmin", "superadmin"];

/** The topics a device should be in. None while announcements (cats.news) are off. */
export function topicsFor(lang: Lang, role: unknown, orgId: unknown, news: boolean): string[] {
  if (!news) return [];
  const r = typeof role === "string" && ROLES.includes(role) ? role : "learner";
  const t = ["all", `lang-${topicLang(lang)}`, `role-${r}`];
  if (typeof orgId === "string" && TOPIC_PART.test(orgId)) t.push(`org-${orgId}`);
  return t;
}

/**
 * One condition per wording: the Arabic text to Arabic phones, the English text to every other phone (English and the
 * languages platform admins added). Every subscribed device is in "all".
 */
export function broadcastCondition(lang: "en" | "ar", audience: Audience): string {
  const base = lang === "ar" ? "'lang-ar' in topics" : "'all' in topics && !('lang-ar' in topics)";
  if (audience.type === "org") return `${base} && 'org-${audience.orgId}' in topics`;
  if (audience.type === "role") return `${base} && 'role-${audience.role}' in topics`;
  return base;
}
export const isTopicPart = (s: string) => TOPIC_PART.test(s);
