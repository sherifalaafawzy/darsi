import { PromptBuilder } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { LabProps } from "../../types";

/** Prompt ingredients: each one added makes the (pre-written) answer more useful. */
export default function Prompt(_: LabProps) {
  const { lang, num } = useI18n();
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return <PromptBuilder key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Build a better prompt", "اصنع طلبًا أفضل")}
    strengthLabel={L("Prompt strength", "قوة الطلب")} strengthText={(a, b) => L(`${a} of ${b}`, `${num(a)} من ${num(b)}`)} runLabel={L("Ask the AI", "اسأل الذكاء الاصطناعي")}
    outputLabel={L("Example answer", "إجابة مثال")} emptyText={L("Tap ingredients to build a prompt", "اضغط على المكوّنات لبناء طلب")}
    ingredients={[
      { key: "role", label: L("Role", "الدور"), text: L("You are a Grade 6 science teacher.", "أنت معلم علوم للصف السادس."), on: true },
      { key: "task", label: L("Task", "المهمة"), text: L("Write 3 discussion questions", "اكتب ثلاثة أسئلة للنقاش"), on: true },
      { key: "ctx", label: L("Context", "السياق"), text: L("about the water cycle for pupils with no lab equipment.", "عن دورة الماء لطلاب ليس لديهم أدوات مختبر.") },
      { key: "fmt", label: L("Format", "الشكل"), text: L("Number them; under 20 words each.", "رقّمها، وأقل من ٢٠ كلمة لكل سؤال.") },
      { key: "lang", label: L("Language", "اللغة"), text: L("Use simple English.", "استخدم عربية بسيطة.") },
    ]}
    outputs={["",
      L("The water cycle is the movement of water on Earth…", "دورة الماء هي حركة الماء على الأرض…"),
      L("Here are some questions: What is evaporation? What is condensation? Explain precipitation…", "إليك بعض الأسئلة: ما التبخّر؟ ما التكثّف؟ اشرح الهطول…"),
      L("1. Where does rain go after it falls? 2. Why do puddles disappear on hot days? 3. Where have you seen water turn into steam?", "١. أين يذهب المطر بعد سقوطه؟ ٢. لماذا تختفي البرك في الأيام الحارة؟ ٣. أين رأيت الماء يتحوّل إلى بخار؟"),
      L("1. Where does rain go after it falls? 2. Why do puddles vanish on hot days? 3. Where have you seen steam?", "١. أين يذهب المطر؟ ٢. لماذا تختفي البرك صيفًا؟ ٣. أين رأيت البخار؟"),
      L("1. Where does rain go? 2. Why do puddles vanish? 3. Where have you seen steam?", "١. أين يذهب المطر؟ ٢. لماذا تختفي البرك؟ ٣. أين رأيت البخار؟")]}
    takeaway={L("Each ingredient you add makes the answer more useful for your class.", "كل مكوّن تضيفه يجعل الإجابة أنفع لصفّك.")} />;
}
