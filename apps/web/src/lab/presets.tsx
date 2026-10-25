import { FactCheck, NextWordLab, PromptBuilder, TokenViewer, TrainClassifier } from "@darsi/design-system";
import type { LabTool } from "../content/types";

/** Localised configurations for the five AI-lab tools, shared by the AI lab screen and lesson "lab" steps. */
export function LabTool({ tool, lang, num }: { tool: LabTool; lang: string; num: (n: number) => string }) {
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  switch (tool) {
    case "prompt":
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
    case "tokens":
      return <TokenViewer key={lang} kicker={L("AI lab", "مختبر الذكاء الاصطناعي")} title={L("How AI reads text", "كيف يقرأ الذكاء الاصطناعي النص")}
        tokensLabel={L("tokens", "رمزًا")} charsLabel={L("characters", "حرفًا")} inputLabel={L("Text to split into tokens", "نص لتقسيمه إلى رموز")}
        text={L("Teachers explain photosynthesis beautifully.", "المعلمون يشرحون البناء الضوئي بإتقان.")}
        takeaway={L("AI reads pieces called tokens. Long or rare words — and many non-English words — become several pieces.", "يقرأ الذكاء الاصطناعي قطعًا تُسمّى رموزًا. الكلمات الطويلة أو النادرة، وكثير من الكلمات غير الإنجليزية، تصبح عدة قطع.")} />;
    case "nextword":
      return <NextWordLab key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Guess the next word", "خمّن الكلمة التالية")}
        tempLabel={L("Temperature", "درجة الحرارة")} lowLabel={L("Predictable", "متوقَّع")} highLabel={L("Creative", "مبدع")} generateLabel={L("Pick the next word", "اختر الكلمة التالية")}
        context={L("In the morning the pupils open their", "في الصباح يفتح الطلاب")}
        candidates={ar ? [{ word: "كتبهم", p: 0.5 }, { word: "دفاترهم", p: 0.3 }, { word: "النوافذ", p: 0.12 }, { word: "هواتفهم", p: 0.08 }] : [{ word: "books", p: 0.55 }, { word: "notebooks", p: 0.25 }, { word: "windows", p: 0.12 }, { word: "phones", p: 0.08 }]}
        takeaway={L("A chatbot writes by choosing likely next words. Temperature changes how adventurous it is.", "يكتب روبوت الدردشة باختيار الكلمات التالية المحتملة، ودرجة الحرارة تغيّر مدى جرأته.")} />;
    case "classifier":
      return <TrainClassifier key={lang} kicker={L("AI lab", "مختبر الذكاء الاصطناعي")} title={L("Teach the machine", "علّم الآلة")}
        addLabel={L("Add example", "أضف مثالًا")} draftLabel={L("New example", "مثال جديد")} testLabel={L("Test the model", "اختبر النموذج")} guessLabel={L("The model thinks:", "يظن النموذج أنها:")} confidenceLabel={L("Confidence", "الثقة")}
        classes={[
          { id: "s", label: L("Safe message", "رسالة آمنة"), tone: "lagoon", examples: ar ? ["الاجتماع يوم الثلاثاء", "جدول الامتحانات مرفق"] : ["Meeting moved to Tuesday", "Exam timetable attached"] },
          { id: "p", label: L("Phishing", "تصيّد"), tone: "hibiscus", examples: ar ? ["حسابك سيُغلق اضغط الآن", "ربحت جائزة أرسل رقمك السري"] : ["Your account will be closed click now", "You won a prize send your PIN"] },
        ]}
        test={L("Click now to keep your account", "اضغط الآن للحفاظ على حسابك")}
        takeaway={L("The model only knows the examples you gave it. Few or biased examples give wrong answers.", "النموذج لا يعرف إلا الأمثلة التي أعطيته إياها. الأمثلة القليلة أو المنحازة تعطي إجابات خاطئة.")} />;
    case "factcheck":
      return <FactCheck key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Check the AI’s answer", "تحقّق من إجابة الذكاء الاصطناعي")}
        answerLabel={L("AI answer", "إجابة الذكاء الاصطناعي")} labels={{ true: L("Correct", "صحيح"), false: L("Wrong", "خطأ"), unsure: L("Check a source", "أبحث عن مصدر") }}
        checkedText={(a, b) => L(`${a} of ${b} claims checked`, `تم فحص ${num(a)} من ${num(b)} ادّعاءات`)}
        answer={ar ? [
          { text: "النيل " }, { text: "أطول نهر في أفريقيا", claim: { id: "c1", verdict: "true", note: "صحيح، تتّفق معظم المصادر على ذلك." } },
          { text: "، ويجري " }, { text: "من الشمال إلى الجنوب", claim: { id: "c2", verdict: "false", note: "خطأ، يجري من الجنوب إلى الشمال نحو البحر المتوسط. قد يذكر الذكاء الاصطناعي الأخطاء بثقة." } },
          { text: "، و" }, { text: "رُسمت أول خريطة له بالأقمار الصناعية عام ١٩٥٠", claim: { id: "c3", verdict: "false", note: "مختلق، لم تكن هناك أقمار صناعية عام ١٩٥٠. هذه «هلوسة»." } }, { text: "." },
        ] : [
          { text: "The Nile is " }, { text: "the longest river in Africa", claim: { id: "c1", verdict: "true", note: "Correct — most sources agree." } },
          { text: ". It flows " }, { text: "from north to south", claim: { id: "c2", verdict: "false", note: "Wrong — it flows south to north into the Mediterranean. AI can state errors confidently." } },
          { text: " and " }, { text: "was first mapped by satellites in 1950", claim: { id: "c3", verdict: "false", note: "Invented — there were no satellites in 1950. This is a “hallucination”." } }, { text: "." },
        ]}
        takeaway={L("Treat AI like a confident new colleague: helpful, but check facts before they reach your pupils.", "تعامل مع الذكاء الاصطناعي كزميل جديد واثق: مفيد، لكن تحقّق من المعلومات قبل أن تصل إلى طلابك.")} />;
  }
}
export const LAB_TOOLS: LabTool[] = ["prompt", "nextword", "tokens", "classifier", "factcheck"];
