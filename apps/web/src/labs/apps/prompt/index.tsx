import { PromptBuilder } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import type { LabProps } from "../../types";

/**
 * Prompt ingredients: each one added makes the (pre-written) answer more useful. PromptBuilder picks the answer by how
 * many ingredients are on, so the answers follow the order shown: each one adds what that ingredient asks for.
 */
export default function Prompt(_: LabProps) {
  const { lang, num } = useI18n();
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return <>
    <TryThis items={[
      L("Press “Ask the AI” with just Role and Task: the questions need a lab, with burners and thermometers, that the class doesn't have.", "اضغط «اسأل الذكاء الاصطناعي» والدور والمهمة وحدهما مختاران: تحتاج الأسئلة إلى مختبر فيه موقد وميزان حرارة، وليس لدى الصف مختبر."),
      L("Add Context and ask again: now the questions use things pupils see every day. Then add Format and Language, and watch the answer get shorter and simpler.", "أضف «السياق» واسأل من جديد: تستعمل الأسئلة الآن أشياء يراها الطلاب كل يوم. ثم أضف «الشكل» و«اللغة»، ولاحظ الإجابة تصير أقصر وأبسط."),
    ]} />
    <PromptBuilder key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Build a better prompt", "اصنع طلبًا أفضل")}
    strengthLabel={L("Prompt strength", "قوة الطلب")} strengthText={(a, b) => L(`${a} of ${b}`, `${num(a)} من ${num(b)}`)} runLabel={L("Ask the AI", "اسأل الذكاء الاصطناعي")}
    outputLabel={L("Example answer", "إجابة مثال")} emptyText={L("Tap ingredients to build a prompt", "اضغط على المكوّنات لبناء طلب")}
    ingredients={[
      { key: "role", label: L("Role", "الدور"), text: L("You are a Grade 6 science teacher.", "أنت معلم علوم للصف السادس."), on: true },
      { key: "task", label: L("Task", "المهمة"), text: L("Write 3 discussion questions about the water cycle.", "اكتب ثلاثة أسئلة للنقاش عن دورة الماء."), on: true },
      { key: "ctx", label: L("Context", "السياق"), text: L("My pupils are 11, and we have no lab equipment.", "عمر طلابي ١١ سنة، وليست لدينا أدوات مختبر.") },
      { key: "fmt", label: L("Format", "الشكل"), text: L("Number them; under 20 words each.", "رقّمها، وأقل من ٢٠ كلمة لكل سؤال.") },
      { key: "lang", label: L("Language", "اللغة"), text: L("Use simple English.", "استخدم عربية بسيطة.") },
    ]}
    outputs={["",
      // 1: one ingredient alone gives plain recall questions.
      L("What is the water cycle? What is evaporation? What is condensation?", "ما دورة الماء؟ ما التبخّر؟ ما التكثّف؟"),
      // 2 (Role, Task): a science teacher's questions, but they assume a lab.
      L("1. Heat water in a beaker over a burner: what do you see, and why? 2. Hold a cold glass slide over the steam: what forms on it? 3. Use a thermometer to compare the water before and after heating.", "١. سخّن الماء في كأس زجاجية على موقد: ماذا ترى، ولماذا؟ ٢. أمسك شريحة زجاجية باردة فوق البخار: ماذا يتكوّن عليها؟ ٣. استعمل ميزان حرارة لتقارن الماء قبل التسخين وبعده."),
      // 3 (+ Context): everyday things, no lab; still long and not numbered.
      L("Here are three questions. Where does the rain go after it falls on the school playground? Why do puddles disappear on hot days, even though nobody drinks them? When you take a cold drink out of the fridge, why does the outside of the bottle get wet?", "إليك ثلاثة أسئلة. أين يذهب ماء المطر بعد أن يسقط على ساحة المدرسة؟ لماذا تختفي البرك في الأيام الحارة مع أن أحدًا لم يشربها؟ حين تُخرج مشروبًا باردًا من الثلاجة، لماذا يبتلّ سطح الزجاجة من الخارج؟"),
      // 4 (+ Format): numbered, under 20 words each.
      L("1. Where does rain go after it falls on the playground? 2. Why do puddles disappear on hot days? 3. Why does a cold bottle get wet on the outside?", "١. أين يذهب المطر بعد سقوطه على الساحة؟ ٢. لماذا تختفي البرك في الأيام الحارة؟ ٣. لماذا تبتلّ الزجاجة الباردة من الخارج؟"),
      // 5 (+ Language): simpler words.
      L("1. Where does rain go? 2. Why do puddles dry up when it is hot? 3. Why is a cold bottle wet on the outside?", "١. أين يذهب المطر؟ ٢. لماذا تجفّ البرك في الحر؟ ٣. لماذا تبتلّ الزجاجة الباردة؟")]}
    takeaway={L("Each ingredient you add makes the answer more useful for your class.", "كل مكوّن تضيفه يجعل الإجابة أنفع لصفّك.")} />
  </>;
}
