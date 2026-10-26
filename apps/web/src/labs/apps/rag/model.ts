/**
 * Retrieval-augmented generation (RAG), small enough to read: rank the school's documents against the question with
 * TF-IDF, hand the best one to the "model", and answer by quoting its best-matching sentence, or decline when nothing
 * matches well enough. The no-sources answer is a deliberate made-up guess, to compare.
 */
import { matchKey, sentences, words } from "../../kit/text";

export interface Doc { id: string; title: string; text: string }

export const DOCS: Record<"en" | "ar", Doc[]> = {
  en: [
    { id: "exams", title: "Exam timetable", text: "Mid-year exams start on Sunday 12 January. Maths is on Sunday, science on Monday and English on Tuesday. Each exam starts at 9:00 and lasts two hours." },
    { id: "library", title: "Library rules", text: "The library is open from 8:00 to 15:00, Sunday to Thursday. Pupils may borrow three books for two weeks. You cannot borrow again until your late books are back." },
    { id: "bus", title: "School bus", text: "The bus leaves the market square at 7:15 and reaches school at 7:45. In the afternoon the bus leaves school at 14:30. Tell the driver if you will not ride." },
    { id: "lunch", title: "Lunch", text: "Lunch is served at 12:00 in the hall. On Monday there is rice and beans. On Wednesday there is bread and lentil soup. Bring your own cup for water." },
    { id: "sports", title: "Sports day", text: "Sports day is on Thursday 6 March on the main field. Races start at 10:00. Wear your house colour and bring a hat and water." },
    { id: "uniform", title: "Uniform", text: "Pupils wear a white shirt and navy trousers or a navy skirt. On sports day a house T-shirt is allowed. Shoes must be closed." },
    { id: "computers", title: "Computer lab", text: "The computer lab is open at break and after school until 15:30. Do not install programs or share your password. Save your work in your own account." },
    { id: "phones", title: "Phones", text: "Phones must be switched off during lessons and exams. You may use your phone at break in the yard. Lost phones are kept at the office." },
  ],
  ar: [
    { id: "exams", title: "جدول الامتحانات", text: "تبدأ امتحانات منتصف العام يوم الأحد ١٢ يناير. الرياضيات يوم الأحد، والعلوم يوم الاثنين، واللغة الإنجليزية يوم الثلاثاء. يبدأ كل امتحان الساعة ٩:٠٠ ويستمر ساعتين." },
    { id: "library", title: "قواعد المكتبة", text: "تفتح المكتبة من الساعة ٨:٠٠ إلى ١٥:٠٠، من الأحد إلى الخميس. يستطيع التلميذ أن يستعير ثلاثة كتب لمدة أسبوعين. لا تستطيع الاستعارة من جديد حتى تعيد الكتب المتأخرة." },
    { id: "bus", title: "حافلة المدرسة", text: "تغادر الحافلة ساحة السوق الساعة ٧:١٥ وتصل إلى المدرسة الساعة ٧:٤٥. وبعد الظهر تغادر الحافلة المدرسة الساعة ١٤:٣٠. أخبر السائق إن كنت لن تركب." },
    { id: "lunch", title: "الغداء", text: "يُقدَّم الغداء الساعة ١٢:٠٠ في القاعة. يوم الاثنين أرز وفاصولياء. يوم الأربعاء خبز وشوربة عدس. أحضر كوبك الخاص للماء." },
    { id: "sports", title: "اليوم الرياضي", text: "اليوم الرياضي يوم الخميس ٦ مارس في الملعب الرئيسي. تبدأ السباقات الساعة ١٠:٠٠. البس لون فريقك وأحضر قبعة وماء." },
    { id: "uniform", title: "الزي المدرسي", text: "يلبس التلاميذ قميصًا أبيض وبنطالًا كحليًا أو تنورة كحلية. في اليوم الرياضي يُسمح بقميص الفريق. يجب أن يكون الحذاء مغلقًا." },
    { id: "computers", title: "مختبر الحاسوب", text: "يفتح مختبر الحاسوب في الاستراحة وبعد الدوام حتى الساعة ١٥:٣٠. لا تثبّت برامج ولا تشارك كلمة مرورك. احفظ عملك في حسابك الخاص." },
    { id: "phones", title: "الهواتف", text: "يجب إغلاق الهواتف أثناء الدروس والامتحانات. يمكنك استعمال هاتفك في الاستراحة في الساحة. تُحفظ الهواتف المفقودة في الإدارة." },
  ],
};

export const QUESTIONS = {
  en: ["When do the exams start?", "How many books can I borrow?", "What time does the bus leave school?", "What is for lunch on Wednesday?", "Can I use my phone at break?", "Who won the football match last year?"],
  ar: ["متى تبدأ الامتحانات؟", "كم كتابًا يستطيع التلميذ أن يستعير؟", "متى تغادر الحافلة المدرسة؟", "ما الغداء يوم الأربعاء؟", "هل أستطيع استعمال هاتفي في الاستراحة؟", "من فاز بمباراة كرة القدم العام الماضي؟"],
};

const STOP = new Set(("the a an and or is are was be do does did can could may i you my your we our it its to of in on at for from by with what when where who how which this that there will not if until own " +
  "متى ما ماذا من كم هل أين كيف في على إلى عن مع أن إن هذا هذه ذلك التي الذي أو كل يوم الساعة").split(" ").map(matchKey));

/** A rough stem: Arabic loses "ال" and joined prefixes, plural endings and attached pronouns; English loses plural "s". */
export function stem(w: string) {
  let k = matchKey(w);
  if (/[؀-ۿ]/.test(k)) {
    k = k.replace(/^(وال|بال|فال|كال|لل|ال|و|ب|ل|ف)(?=...)/, "");
    const end = /(ات|ون|ين|ها|هم|ك|ي|ه|ا)$/.exec(k);
    if (end && k.length - end[0].length >= 3) k = k.slice(0, -end[0].length);
  } else if (k.length > 3 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}
/** The question's own words behind a list of matched stems, for showing. */
export const shown = (q: string, hits: string[]) => [...new Set(words(q).filter((w) => hits.includes(stem(w))))];
export const terms = (text: string) => words(text).filter((w) => !STOP.has(matchKey(w))).map(stem).filter((t) => t.length > 1);

export interface Index { docs: Doc[]; idf: Map<string, number>; vecs: Map<string, number>[] }

function tf(ts: string[]) { const m = new Map<string, number>(); for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1); return m; }
const weigh = (m: Map<string, number>, idf: Map<string, number>) => { const out = new Map<string, number>(); for (const [t, c] of m) out.set(t, (1 + Math.log(c)) * (idf.get(t) ?? 0)); return out; };
function cos(a: Map<string, number>, b: Map<string, number>) {
  let d = 0, na = 0, nb = 0;
  for (const [t, v] of a) { na += v * v; d += v * (b.get(t) ?? 0); }
  for (const v of b.values()) nb += v * v;
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export function index(docs: Doc[]): Index {
  const tfs = docs.map((d) => tf(terms(`${d.title} ${d.text}`)));
  const idf = new Map<string, number>();
  for (const m of tfs) for (const t of m.keys()) idf.set(t, (idf.get(t) ?? 0) + 1);
  for (const [t, n] of idf) idf.set(t, Math.log((1 + docs.length) / n));
  return { docs, idf, vecs: tfs.map((m) => weigh(m, idf)) };
}

/** The question's words, weighted; words no document contains count as rare as possible. */
function ask(ix: Index, q: string) {
  const rare = Math.log(1 + ix.docs.length), out = new Map<string, number>();
  for (const [t, c] of tf(terms(q))) out.set(t, (1 + Math.log(c)) * (ix.idf.get(t) ?? rare));
  return out;
}

/** Documents ranked by how well they match the question, the question words each contains, and how much of the question that covers. */
export function search(ix: Index, q: string) {
  const qv = ask(ix, q), total = [...qv.values()].reduce((a, b) => a + b, 0) || 1;
  return ix.docs.map((doc, i) => {
    const hits = [...qv.keys()].filter((t) => ix.vecs[i].has(t));
    return { doc, score: cos(qv, ix.vecs[i]), hits, coverage: hits.reduce((a, t) => a + qv.get(t)!, 0) / total };
  }).sort((a, b) => b.score - a.score);
}

/** To answer, the best document must match well enough and contain most of what the question asks about. */
export const ENOUGH = 0.12, COVER = 0.5;

/** Quotes the best document's one or two best-matching sentences, or returns null when nothing matches well enough. */
export function answer(ix: Index, q: string) {
  const [top] = search(ix, q);
  if (!top || top.score < ENOUGH || top.coverage < COVER) return null;
  const qv = ask(ix, q), all = sentences(top.doc.text);
  const ranked = all.map((s, i) => ({ s, i, v: cos(qv, weigh(tf(terms(s)), ix.idf)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 2);
  return { doc: top.doc, quote: ranked.length ? ranked.sort((a, b) => a.i - b.i).map((x) => x.s).join(". ") : top.doc.text };
}

/** What a model with no sources might say: fluent, sure of itself, and made up. */
export function guess(q: string, lang: "en" | "ar") {
  const k = matchKey(q.trim());
  if (lang === "ar") {
    if (/^متي/.test(k)) return "الساعة ٨:٠٠ يوم الاثنين.";
    if (/^كم/.test(k)) return "خمسة.";
    if (/^اين/.test(k)) return "في القاعة الرئيسية.";
    if (/^من /.test(k)) return "الصف السادس (ب).";
    if (/^هل/.test(k)) return "نعم، لا بأس بذلك.";
    return "معكرونة وسلطة.";
  }
  if (/^(when|what time)/.test(k)) return "At 8:00 on Monday.";
  if (/^how (many|much)/.test(k)) return "Five.";
  if (/^where/.test(k)) return "In the main hall.";
  if (/^who/.test(k)) return "Class 6B.";
  if (/^(can|may|is|are|do)/.test(k)) return "Yes, that's fine.";
  return "Pasta and salad.";
}
