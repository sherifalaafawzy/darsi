/**
 * The capstone screens' words (ProjectView, SubmissionCard, CourseResults), English and Arabic, read with L() so other
 * languages fall back to English. Kept here, not in i18n/en.json and ar.json, while another change to those files is in
 * progress; move them there (keys "capstone.*") when it lands.
 */
import type { LocalText } from "../content/types";

const T = <K extends string>(o: Record<K, LocalText>) => o;
export const CT = T({
  kicker: { en: "Capstone milestone", ar: "مرحلة من المشروع الختامي" },
  hours: { en: "About {n} hours of work", ar: "قرابة {n} ساعات من العمل" },
  starter: { en: "Starter repository", ar: "مستودع البداية" },
  starterHint: { en: "Use it as a template on GitHub (or download it), then work on your own copy.", ar: "استعمله قالبًا على GitHub (أو نزّله)، ثم اعمل على نسختك أنت." },
  setup: { en: "Set up", ar: "التجهيز" },
  windows: { en: "Windows", ar: "Windows" },
  mac: { en: "Mac", ar: "Mac" },
  colab: { en: "Colab or Codespaces", ar: "Colab أو Codespaces" },
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
  score: { en: "{n} of 3", ar: "{n} من ٣" },
  sentTeacher: { en: "Sent. Your teacher reviews it and replies here.", ar: "أُرسل. يراجعه معلّمك ويرد هنا." },
  sentStaff: { en: "Sent. The Darsi team reviews it and replies here, usually within a week.", ar: "أُرسل. يراجعه فريق درسي ويرد هنا، عادةً خلال أسبوع." },
  sendAgain: { en: "Improve it and send again", ar: "حسّنه وأرسله مرة أخرى" },
  queueStaff: { en: "Darsi staff review", ar: "مراجعة فريق درسي" },
  queueTeacher: { en: "Teacher review", ar: "مراجعة المعلّم" },
  staffOnly: { en: "Waiting for Darsi staff only", ar: "بانتظار فريق درسي فقط" },
  repoLink: { en: "Repository", ar: "المستودع" },
  passed: { en: "{n} of {m} checks passed", ar: "نجح {n} من {m} فحوص" },
});
/** A capstone string with {n}-style values filled in. */
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
