/**
 * The capstone screens' words (ProjectView, SubmissionCard, CourseResults), English and Arabic, read with L() so other
 * languages fall back to English. Kept here, not in i18n/en.json and ar.json, while another change to those files is in
 * progress; move them there (keys "capstone.*") when it lands. Numbers always go through the app's formatter (pass
 * useI18n().num to fill and counted), so Arabic shows Arabic-Indic digits, and counted words through each language's own
 * plural forms (counted), never a number pasted into one form.
 */
import type { LocalText, SetupTab } from "../content/types";
import { pluralOf } from "../i18n";

const T = <K extends string>(o: Record<K, LocalText>) => o;
export const CT = T({
  kicker: { en: "Capstone milestone", ar: "مرحلة من المشروع الختامي" },
  starter: { en: "Starter repository", ar: "مستودع البداية" },
  starterHint: { en: "Use it as a template on GitHub (or download it), then work on your own copy.", ar: "استعمله قالبًا على GitHub (أو نزّله)، ثم اعمل على نسختك أنت." },
  setup: { en: "Set up", ar: "التجهيز" },
  windows: { en: "Windows", ar: "Windows" },
  mac: { en: "Mac", ar: "Mac" },
  colab: { en: "Colab or Codespaces", ar: "Colab أو Codespaces" },
  // The third tab's label on a learner's screen, from what its text uses (setupTabLabel): Colab for the ai and ds
  // notebooks, Codespaces for the other tracks' starters.
  colabOnly: { en: "Colab", ar: "Colab" },
  codespaces: { en: "Codespaces", ar: "Codespaces" },
  send: { en: "What to send", ar: "ماذا ترسل" },
  repo: { en: "Your GitHub repository", ar: "مستودعك على GitHub" },
  repoHint: { en: "https://github.com/you/your-project (public, so the checks can read it)", ar: "https://github.com/you/your-project (عام، ليستطيع الفحص قراءته)" },
  release: { en: "Tag a release on GitHub (for example v1.0) before you send.", ar: "ضع وسمًا لإصدار على GitHub (مثل v1.0) قبل الإرسال." },
  links: { en: "Links to your work, one per line (Colab, a Space, a dashboard)", ar: "روابط عملك، رابط في كل سطر (Colab، أو Space، أو لوحة بيانات)" },
  check: { en: "darsi-check.json from the check script", ar: "ملف darsi-check.json من سكربت الفحص" },
  checkHint: { en: "Run python check.py in your project, then choose the file it wrote.", ar: "شغّل python check.py في مشروعك، ثم اختر الملف الذي كتبه." },
  checkPick: { en: "Choose darsi-check.json", ar: "اختر darsi-check.json" },
  checkBad: { en: "That file isn't JSON. Choose the darsi-check.json the check script wrote.", ar: "هذا الملف ليس JSON. اختر ملف darsi-check.json الذي كتبه سكربت الفحص." },
  scan: { en: "Scan only your own app on this computer (localhost). Scans of anything else are refused.", ar: "افحص تطبيقك أنت فقط على هذا الكمبيوتر (localhost). يُرفض أي فحص لغيره." },
  repoBad: { en: "Paste a link like https://github.com/you/your-project.", ar: "الصق رابطًا مثل https://github.com/you/your-project." },
  linksBad: { en: "Each link must start with https:// (at most 5).", ar: "يجب أن يبدأ كل رابط بـ https:// (خمسة روابط على الأكثر)." },
  sendBtn: { en: "Check and send", ar: "افحص وأرسل" },
  checking: { en: "Checking your evidence…", ar: "نفحص ما أرسلته…" },
  checks: { en: "Automatic checks", ar: "الفحوص الآلية" },
  ai: { en: "AI review (a suggestion; a person decides)", ar: "مراجعة آلية (اقتراح؛ والقرار لشخص)" },
  aiNext: { en: "Next step", ar: "الخطوة التالية" },
  score: { en: "{n} of {m}", ar: "{n} من {m}" },
  criterion: { en: "Criterion {n}", ar: "المعيار {n}" },
  capped: { en: "An automatic check didn't pass, so no score is above {n} until it does.", ar: "لم ينجح أحد الفحوص الآلية، فلا تتجاوز أي درجة {n} حتى ينجح." },
  // What each check's mark means, for screen readers (the mark alone would say nothing).
  checkOk: { en: "Passed", ar: "نجح" },
  checkFail: { en: "Not passed", ar: "لم ينجح" },
  checkSkip: { en: "Not checked", ar: "لم يُفحص" },
  // checkCapstone refused the send (resource-exhausted): nothing was sent, and the draft stays on the phone.
  wait: { en: "You sent a milestone a moment ago. Wait a few seconds, then send it again.", ar: "أرسلت مرحلة قبل لحظات. انتظر بضع ثوانٍ ثم أرسلها مرة أخرى." },
  limit: { en: "You've sent as many milestones as you can today. Send it again tomorrow: what you wrote stays on this phone.", ar: "أرسلت أقصى عدد من المراحل المتاح اليوم. أرسلها غدًا، فما كتبته يبقى محفوظًا على هذا الهاتف." },
  // Refused for what was sent, not the connection: not a capstone milestone (any more), or input parseInput rejected.
  closed: { en: "This milestone can't be sent right now. Tell your teacher, or use Report a problem.", ar: "لا يمكن إرسال هذه المرحلة الآن. أخبر معلّمك، أو استخدم «الإبلاغ عن مشكلة»." },
  invalid: { en: "Something you sent wasn't accepted. Check the repository link, the links and the files, then send again.", ar: "لم يُقبل شيء مما أرسلته. راجع رابط المستودع والروابط والملفات، ثم أرسل مرة أخرى." },
  // Where the reply shows: on this milestone (lesson/MyReview.tsx) and in Me, under My projects (me.projects).
  sentTeacher: { en: "Sent. Your teacher reviews it, and the reply shows on this milestone and in My projects.", ar: "أُرسل عملك. يراجعه معلّمك، ويظهر الرد في هذه المرحلة وفي «مشاريعي»." },
  sentStaff: { en: "Sent. The Darsi team reviews it, usually within a week, and the reply shows on this milestone and in My projects.", ar: "أُرسل عملك. يراجعه فريق درسي، عادةً خلال أسبوع، ويظهر الرد في هذه المرحلة وفي «مشاريعي»." },
  sendAgain: { en: "Improve it and send again", ar: "حسّنه وأرسله مرة أخرى" },
  queueStaff: { en: "Darsi staff review", ar: "مراجعة فريق درسي" },
  queueTeacher: { en: "Teacher review", ar: "مراجعة المعلّم" },
  staffOnly: { en: "Waiting for Darsi staff only", ar: "بانتظار فريق درسي فقط" },
  repoLink: { en: "Repository", ar: "المستودع" },
  // A label, not a counted noun: "Passed: 1 of 1" and «الفحوص الناجحة: ٢ من ٣» read right for every number.
  passed: { en: "Passed: {n} of {m}", ar: "الفحوص الناجحة: {n} من {m}" },
});

/**
 * A setup tab's label. The third tab ("colab") holds Colab steps in some capstones, Codespaces steps in others, or
 * both: its label names what its text uses, and keeps "Colab or Codespaces" when the text names both or neither.
 */
export function setupTabLabel(os: SetupTab["os"], body?: LocalText): LocalText {
  if (os !== "colab" || !body) return CT[os];
  const text = Object.values(body).join("\n");
  const colab = /\bColab\b/.test(text), spaces = /\bCodespaces?\b/.test(text);
  return colab === spaces ? CT.colab : colab ? CT.colabOnly : CT.codespaces;
}

/** One language's forms of a counted phrase, by CLDR plural category (i18n pluralOf); `{n}` is the formatted number. */
export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/** A milestone's hours of work. Arabic: ساعة، ساعتين، ٣–١٠ ساعات، ١١ ساعة فأكثر. */
export const HOURS: { en: Forms } & Partial<Record<string, Forms>> = {
  en: { one: "About an hour of work", other: "About {n} hours of work" },
  ar: { one: "قرابة ساعة من العمل", two: "قرابة ساعتين من العمل", few: "قرابة {n} ساعات من العمل", other: "قرابة {n} ساعة من العمل" },
};
/**
 * A counted phrase in the reader's language (English when it has no forms), with the form that language's plural rules
 * pick for n and n in the reader's digits (pass useI18n().num).
 */
export function counted(forms: { en: Forms } & Partial<Record<string, Forms>>, lang: string, n: number, num: (n: number) => string): string {
  const code = forms[lang] ? lang : "en", f = forms[code] ?? forms.en;
  // The app's own plural rule (i18n pluralOf, as t() uses): cached, and "other" where a browser has no Intl.PluralRules.
  return (f[pluralOf(code, n) as Intl.LDMLPluralRule] ?? f.other).replace("{n}", num(n));
}
/**
 * checkCapstone refusing a send before checking anything (resource-exhausted: "capstone-wait", too soon after the last
 * one; "capstone-limit", the day's sends used up; not-found or failed-precondition: not a capstone milestone, "closed";
 * invalid-argument: what was sent didn't pass parseInput, "invalid") as the CT key that says so, or null for any other
 * error, which is the connection's ("project.error").
 */
export function refusal(e: unknown): "wait" | "limit" | "closed" | "invalid" | null {
  const x = e as { code?: unknown; message?: unknown } | null;
  const code = String(x?.code ?? "");
  if (code.endsWith("not-found") || code.endsWith("failed-precondition")) return "closed";
  if (code.endsWith("invalid-argument")) return "invalid";
  if (!x || !code.endsWith("resource-exhausted")) return null;
  return x.message === "capstone-wait" ? "wait" : x.message === "capstone-limit" ? "limit" : null;
}
/** A capstone string with {n}-style values filled in; numbers in the reader's digits when given useI18n().num. */
export const fill = (s: string, v: Record<string, string | number>, num: (n: number) => string = String) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => { const x = v[k]; return typeof x === "number" ? num(x) : String(x ?? ""); });
