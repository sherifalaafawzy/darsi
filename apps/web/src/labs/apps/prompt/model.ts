/**
 * The prompt lab's answers, composed from WHICH ingredients are on (not how many), so every ingredient has its own
 * visible effect:
 *  - Task: without it there is nothing to answer, so the AI asks what you want.
 *  - Role (a Grade 6 science teacher): plain recall questions become questions that make pupils think and explain.
 *  - Context (pupils of 11, no lab equipment): lab experiments become things pupils see every day.
 *  - Format (numbered, under 20 words): a paragraph of long questions becomes a short numbered list.
 *  - Language (simple English / simple Arabic): hard words become everyday words.
 * Four question sets (role × context), each written in three forms (long, short, simple). Offline and pre-reviewed.
 */
export type Lang = "en" | "ar";
export const INGREDIENTS = ["role", "task", "ctx", "fmt", "lang"] as const;
export type IngredientKey = (typeof INGREDIENTS)[number];

type Form = "long" | "short" | "simple";
type Set = Record<Form, [string, string, string]>;
type Sets = { plain: Set; role: Set; ctx: Set; both: Set };

const EN: Sets = {
  // Task only: a quiz of definitions.
  plain: {
    long: ["Can you explain what the water cycle is and describe each of its main stages in the right order?", "What is the difference between evaporation and condensation, and where does each one happen in the cycle?", "What is precipitation, and what different forms can it take around the world?"],
    short: ["What is the water cycle?", "How is evaporation different from condensation?", "What is precipitation?"],
    simple: ["How does water move between the ground and the sky?", "What happens when water dries up, and when steam turns back into drops?", "What do we call water that falls from the clouds?"],
  },
  // + Role: a science teacher's questions make pupils observe and explain, but assume a school lab.
  role: {
    long: ["Heat some water in a beaker over a burner: what do you see at the surface, and how would you explain it?", "Hold a cold glass slide over the steam for a minute: what forms on it, and which part of the water cycle does that show?", "Measure the water with a thermometer before and during heating: what do your readings tell you about evaporation?"],
    short: ["Heat water over a burner: what do you see, and why?", "What forms on a cold glass slide held over steam?", "What does a thermometer show as the water heats up?"],
    simple: ["Heat water on a burner. What do you see?", "Hold a cold glass over the steam. What forms on it?", "Does the water get hotter? Check it with a thermometer."],
  },
  // + Context: things pupils see every day, but still a quiz of definitions.
  ctx: {
    long: ["What is evaporation? Give an example you might see at home, such as wet clothes drying on a line.", "What is condensation? Think of the drops that form on a cold bottle taken out of the fridge.", "Where does rain come from? Describe what happens to the water in the clouds before it falls."],
    short: ["What is evaporation? Give an example from home.", "What is condensation? Think of a cold bottle.", "Where does rain come from?"],
    simple: ["What does “evaporation” mean? Think of wet clothes drying.", "What does “condensation” mean? Think of a cold bottle.", "Where does rain come from?"],
  },
  // Role + Context: questions that make pupils think, about things they see every day.
  both: {
    long: ["Where does the rain go after it falls on the school playground?", "Why do puddles disappear on hot days, even though nobody drinks them?", "When you take a cold drink out of the fridge, why does the outside of the bottle get wet?"],
    short: ["Where does rain go after it falls on the playground?", "Why do puddles disappear on hot days?", "Why does a cold bottle get wet on the outside?"],
    simple: ["Where does rain go?", "Why do puddles dry up when it is hot?", "Why is a cold bottle wet on the outside?"],
  },
};

const AR: Sets = {
  plain: {
    long: ["هل يمكنك أن تشرح ما دورة الماء، وأن تصف كل مرحلة من مراحلها الرئيسية بترتيبها الصحيح؟", "ما الفرق بين التبخّر والتكثّف، وأين تحدث كل عملية منهما في الدورة؟", "ما الهطول، وما الأشكال المختلفة التي يتخذها في أنحاء العالم؟"],
    short: ["ما دورة الماء؟", "ما الفرق بين التبخّر والتكثّف؟", "ما الهطول؟"],
    simple: ["كيف ينتقل الماء بين الأرض والسماء؟", "ماذا يحدث حين يجفّ الماء، وحين يعود البخار قطرات؟", "ماذا نسمّي الماء الذي ينزل من السحاب؟"],
  },
  role: {
    long: ["سخّن قليلًا من الماء في كأس زجاجية على موقد: ماذا ترى على سطحه، وكيف تفسّر ذلك؟", "أمسك شريحة زجاجية باردة فوق البخار دقيقة: ماذا يتكوّن عليها، وأي جزء من دورة الماء يوضّحه ذلك؟", "قِس حرارة الماء بميزان حرارة قبل التسخين وأثناءه: ماذا تخبرك قراءاتك عن التبخّر؟"],
    short: ["سخّن الماء على موقد: ماذا ترى، ولماذا؟", "ماذا يتكوّن على شريحة زجاجية باردة فوق البخار؟", "ماذا يُظهر ميزان الحرارة حين يسخن الماء؟"],
    simple: ["سخّن الماء على موقد. ماذا ترى؟", "أمسك زجاجًا باردًا فوق البخار. ماذا يتكوّن عليه؟", "هل يصير الماء أسخن؟ تأكّد بميزان حرارة."],
  },
  ctx: {
    long: ["ما التبخّر؟ اذكر مثالًا قد تراه في البيت، مثل الملابس المبلولة وهي تجفّ على الحبل.", "ما التكثّف؟ فكّر في القطرات التي تتكوّن على زجاجة باردة أخرجتها من الثلاجة.", "من أين يأتي المطر؟ صِف ما يحدث للماء في السحاب قبل أن ينزل."],
    short: ["ما التبخّر؟ اذكر مثالًا من البيت.", "ما التكثّف؟ فكّر في زجاجة باردة.", "من أين يأتي المطر؟"],
    simple: ["ما معنى «التبخّر»؟ فكّر في الملابس وهي تجفّ.", "ما معنى «التكثّف»؟ فكّر في زجاجة باردة.", "من أين يأتي المطر؟"],
  },
  both: {
    long: ["أين يذهب ماء المطر بعد أن يسقط على ساحة المدرسة؟", "لماذا تختفي البرك في الأيام الحارة مع أن أحدًا لم يشربها؟", "حين تُخرج مشروبًا باردًا من الثلاجة، لماذا يبتلّ سطح الزجاجة من الخارج؟"],
    short: ["أين يذهب المطر بعد سقوطه على الساحة؟", "لماذا تختفي البرك في الأيام الحارة؟", "لماذا تبتلّ الزجاجة الباردة من الخارج؟"],
    simple: ["أين يذهب المطر؟", "لماذا تجفّ البرك في الحر؟", "لماذا تبتلّ الزجاجة الباردة؟"],
  },
};

const TEXT = {
  en: { intro: "Here are three questions about the water cycle.", noTask: "I'm happy to help, but what would you like me to do? Tell me the task: what to write, and about what.", noTaskRole: "Happy to help with your Grade 6 science class! What would you like me to write for it?" },
  ar: { intro: "إليك ثلاثة أسئلة عن دورة الماء.", noTask: "يسعدني أن أساعدك، لكن ماذا تريد أن أفعل؟ أخبرني بالمهمة: ماذا أكتب، وعن أي موضوع.", noTaskRole: "يسعدني أن أساعدك في حصة العلوم للصف السادس! ماذا تريد أن أكتب لها؟" },
};

const digits = (n: number, lang: Lang) => (lang === "ar" ? "٠١٢٣٤٥٦٧٨٩"[n] : String(n));

/** The example answer for the ingredients that are on, in the page's language. "" when nothing is on. */
export function promptAnswer(on: readonly string[], lang: Lang): string {
  if (!on.length) return "";
  const has = (k: IngredientKey) => on.includes(k);
  const t = TEXT[lang];
  if (!has("task")) return has("role") ? t.noTaskRole : t.noTask;
  const sets = lang === "ar" ? AR : EN;
  const set = has("role") ? (has("ctx") ? sets.both : sets.role) : has("ctx") ? sets.ctx : sets.plain;
  const qs = set[has("lang") ? "simple" : has("fmt") ? "short" : "long"];
  return has("fmt") ? qs.map((q, i) => `${digits(i + 1, lang)}. ${q}`).join("\n") : `${t.intro} ${qs.join(" ")}`;
}
