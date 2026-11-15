/**
 * Push notification wording, in English and Arabic, plus French, Spanish, German, Portuguese and Urdu (MORE).
 * Pure: no Firebase imports, so it is unit-tested directly.
 * Tone: "Encourage, never punish". No guilt, no threats, no emoji; Arabic and Urdu never use "·".
 * A phone set to another language platform admins added gets the English wording.
 */
import { LANG_CODE } from "./shared/languages.js";

/** A device's language: English, Arabic, or one platform admins added ("fr", "pt-br"). */
export type Lang = string;
/** The wording a device gets: its own language when there is wording for it, else English. */
export const wordingFor = (lang: Lang): Lang => (lang === "ar" || lang in MORE ? lang : "en");
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
export const formatNumber = (n: number, lang: Lang) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : lang in MORE ? lang : "en").format(n);
export const dirOf = (lang: Lang) => (["ar", "ur", "fa", "he", "ps", "sd", "ckb", "ug", "yi"].includes(lang.split("-")[0]) ? "rtl" : "ltr");
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
  const e = MORE[lang]?.[kind] ?? CATALOGUE[kind][lang === "ar" ? "ar" : "en"];
  return { title: e.title(vars, lang), body: e.body(vars, lang) };
}

/* ---------- The languages platform admins added (content/i18n/<code>.json) ---------- */

type Wording = { title: Fill; body: Fill };
const w = (title: Fill | string, body: Fill | string): Wording => ({ title: typeof title === "string" ? fixed(title) : title, body: typeof body === "string" ? fixed(body) : body });
const one = (v: MessageVars) => Math.round(v.n ?? 0) === 1;
const NB = "\u00A0"; // French: a no-break space before ? : ! ;

/** Same kinds as CATALOGUE, in the same tone. Feedback from a reviewer is shown as written. */
export const MORE: Record<string, Record<Kind, Wording>> = {
  fr: {
    daily0: w("Votre leçon de 5 minutes est prête", "Une courte leçon aujourd’hui, une idée nouvelle pour votre classe demain."),
    daily1: w(`Cinq minutes pour vous${NB}?`, "Reprenez là où vous en étiez. Cela ne prend que cinq minutes."),
    daily2: w("Du nouveau pour votre classe", "La leçon du jour se termine par une idée à essayer demain."),
    weekGoal: w((v, l) => (one(v) ? "Plus qu’une leçon pour l’objectif de la semaine" : `Plus que ${num(v, l)} leçons pour l’objectif de la semaine`), "Vous y êtes presque. Une courte leçon maintenant vous garde sur la bonne voie."),
    streak: w((v, l) => `Votre série${NB}: ${num(v, l)} ${one(v) ? "semaine" : "semaines"}`, "Vous avez appris chaque semaine ces derniers temps. Une leçon suffit pour continuer."),
    comeback7: w("Nous avons gardé votre place", "Votre prochaine leçon vous attend, et elle ne prend que cinq minutes."),
    comeback21: w("De nouvelles idées pour votre classe", "Revenez pour une leçon de 5 minutes quand vous le souhaitez."),
    reviewApproved: w("Votre projet a été approuvé", feedbackOr("Bravo, votre projet a été approuvé.")),
    reviewRevise: w("Des retours sur votre projet", feedbackOr("La personne qui a relu votre projet propose quelques changements.")),
    staffSubmission: w("Nouveau projet à relire", (v) => `${name(v)} a envoyé un projet à relire.`),
    staffOrgRequest: w("Nouvelle demande d’organisation", (v) => `${org(v)} souhaite rejoindre Darsi.`),
  },
  es: {
    daily0: w("Tu lección de 5 minutos está lista", "Una lección corta hoy, una idea nueva para tu clase mañana."),
    daily1: w("¿Cinco minutos para ti?", "Sigue donde lo dejaste. Solo toma cinco minutos."),
    daily2: w("Algo nuevo para tu clase", "La lección de hoy termina con una idea que puedes probar mañana."),
    weekGoal: w((v, l) => (one(v) ? "Te falta 1 lección para la meta de esta semana" : `Te faltan ${num(v, l)} lecciones para la meta de esta semana`), "Estás cerca. Una lección corta ahora te mantiene en camino."),
    streak: w((v, l) => `Tu racha: ${num(v, l)} ${one(v) ? "semana" : "semanas"}`, "Últimamente has aprendido cada semana. Una lección la mantiene viva."),
    comeback7: w("Guardamos tu lugar", "Tu próxima lección te espera, y solo toma cinco minutos."),
    comeback21: w("Ideas nuevas para tu clase", "Vuelve para una lección de 5 minutos cuando quieras."),
    reviewApproved: w("Tu proyecto fue aprobado", feedbackOr("¡Bien hecho! Tu proyecto fue aprobado.")),
    reviewRevise: w("Comentarios sobre tu proyecto", feedbackOr("Quien revisó tu proyecto sugirió algunos cambios.")),
    staffSubmission: w("Nuevo proyecto para revisar", (v) => `${name(v)} envió un proyecto para revisar.`),
    staffOrgRequest: w("Nueva solicitud de organización", (v) => `${org(v)} pidió unirse a Darsi.`),
  },
  de: {
    daily0: w("Deine 5-Minuten-Lektion ist bereit", "Heute eine kurze Lektion, morgen eine neue Idee für deine Klasse."),
    daily1: w("Fünf Minuten für dich?", "Mach da weiter, wo du aufgehört hast. Es dauert nur fünf Minuten."),
    daily2: w("Etwas Neues für deine Klasse", "Die heutige Lektion endet mit einer Idee, die du morgen ausprobieren kannst."),
    weekGoal: w((v, l) => (one(v) ? "Noch 1 Lektion bis zu deinem Wochenziel" : `Noch ${num(v, l)} Lektionen bis zu deinem Wochenziel`), "Du bist nah dran. Eine kurze Lektion jetzt hält dich auf Kurs."),
    streak: w((v, l) => `Deine Serie: ${num(v, l)} ${one(v) ? "Woche" : "Wochen"}`, "Du hast zuletzt jede Woche gelernt. Eine Lektion hält die Serie am Laufen."),
    comeback7: w("Wir haben deinen Platz gemerkt", "Deine nächste Lektion wartet auf dich und dauert nur fünf Minuten."),
    comeback21: w("Neue Ideen für deine Klasse", "Komm für eine 5-Minuten-Lektion zurück, wann immer du magst."),
    reviewApproved: w("Dein Projekt wurde angenommen", feedbackOr("Gut gemacht, dein Projekt wurde angenommen.")),
    reviewRevise: w("Rückmeldung zu deinem Projekt", feedbackOr("Die Person, die dein Projekt geprüft hat, schlägt ein paar Änderungen vor.")),
    staffSubmission: w("Neues Projekt zur Durchsicht", (v) => `${name(v)} hat ein Projekt zur Durchsicht geschickt.`),
    staffOrgRequest: w("Neue Anfrage einer Organisation", (v) => `${org(v)} möchte Darsi beitreten.`),
  },
  pt: {
    daily0: w("Sua lição de 5 minutos está pronta", "Uma lição curta hoje, uma ideia nova para sua turma amanhã."),
    daily1: w("Cinco minutos para você?", "Continue de onde parou. Leva só cinco minutos."),
    daily2: w("Algo novo para sua turma", "A lição de hoje termina com uma ideia que você pode testar amanhã."),
    weekGoal: w((v, l) => (one(v) ? "Falta 1 lição para a meta desta semana" : `Faltam ${num(v, l)} lições para a meta desta semana`), "Você está perto. Uma lição curta agora mantém você no caminho."),
    streak: w((v, l) => `Sua sequência: ${num(v, l)} ${one(v) ? "semana" : "semanas"}`, "Você aprendeu toda semana ultimamente. Uma lição mantém a sequência."),
    comeback7: w("Guardamos o seu lugar", "Sua próxima lição está esperando, e leva só cinco minutos."),
    comeback21: w("Novas ideias para sua turma", "Volte para uma lição de 5 minutos quando quiser."),
    reviewApproved: w("Seu projeto foi aprovado", feedbackOr("Muito bem, seu projeto foi aprovado.")),
    reviewRevise: w("Comentários sobre seu projeto", feedbackOr("Quem revisou seu projeto sugeriu algumas mudanças.")),
    staffSubmission: w("Novo projeto para revisar", (v) => `${name(v)} enviou um projeto para revisão.`),
    staffOrgRequest: w("Nova solicitação de organização", (v) => `${org(v)} pediu para entrar no Darsi.`),
  },
  ur: {
    daily0: w("آپ کا 5 منٹ کا سبق تیار ہے", "آج ایک مختصر سبق، کل آپ کی کلاس کے لیے ایک نیا خیال۔"),
    daily1: w("آپ کے لیے پانچ منٹ؟", "جہاں چھوڑا تھا وہیں سے جاری رکھیں۔ اس میں صرف پانچ منٹ لگتے ہیں۔"),
    daily2: w("آپ کی کلاس کے لیے کچھ نیا", "آج کا سبق ایک ایسے خیال پر ختم ہوتا ہے جسے آپ کل آزما سکتے ہیں۔"),
    weekGoal: w((v, l) => `اس ہفتے کے ہدف کے لیے ${num(v, l)} سبق باقی ہیں`, "آپ قریب ہیں۔ ابھی ایک مختصر سبق آپ کو راستے پر رکھے گا۔"),
    streak: w((v, l) => `آپ کا سلسلہ: ${num(v, l)} ہفتے`, "حال میں آپ نے ہر ہفتے سیکھا ہے۔ ایک سبق اسے جاری رکھتا ہے۔"),
    comeback7: w("ہم نے آپ کی جگہ محفوظ رکھی ہے", "آپ کا اگلا سبق آپ کا منتظر ہے، اور اس میں صرف پانچ منٹ لگتے ہیں۔"),
    comeback21: w("آپ کی کلاس کے لیے نئے خیالات", "جب بھی آپ تیار ہوں، 5 منٹ کے سبق کے لیے واپس آئیں۔"),
    reviewApproved: w("آپ کا پروجیکٹ منظور ہو گیا", feedbackOr("شاباش، آپ کا پروجیکٹ منظور ہو گیا۔")),
    reviewRevise: w("آپ کے پروجیکٹ پر رائے", feedbackOr("جائزہ لینے والے نے کچھ تبدیلیاں تجویز کی ہیں۔")),
    staffSubmission: w("جائزے کے لیے نیا پروجیکٹ", (v) => `${name(v)} نے جائزے کے لیے ایک پروجیکٹ بھیجا ہے۔`),
    staffOrgRequest: w("تنظیم کی نئی درخواست", (v) => `${org(v)} نے «درسی» میں شامل ہونے کی درخواست کی ہے۔`),
  },
};

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
