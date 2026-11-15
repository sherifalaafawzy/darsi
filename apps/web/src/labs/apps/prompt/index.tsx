import { useRef, type MouseEvent } from "react";
import { PromptBuilder } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import type { LabProps } from "../../types";
import { promptAnswer } from "./model";

/** Prompt ingredients: the (pre-written) answer depends on which ingredients are on, so each one has its own effect. */
export default function Prompt({ onDone }: LabProps) {
  const { lang, num } = useI18n();
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  // Done once the AI was asked with an ingredient added to the two it starts with (try 2). The design system's
  // PromptBuilder has no callback: its ingredient buttons carry aria-pressed and "Ask the AI" doesn't, and their clicks
  // bubble up to the wrapper below (a disabled button sends none).
  const box = useRef<HTMLDivElement>(null), done = useRef(false);
  const asked = (e: MouseEvent) => {
    const b = (e.target as Element).closest("button");
    if (done.current || !b || b.hasAttribute("aria-pressed")) return;
    if ((box.current?.querySelectorAll('button[aria-pressed="true"]').length ?? 0) > 2) { done.current = true; onDone?.(); }
  };
  return <>
    <TryThis items={[
      L("Press “Ask the AI” with just Role and Task: the questions need a lab, with burners and thermometers, that the class doesn't have.", "اضغط «اسأل الذكاء الاصطناعي» والدور والمهمة وحدهما مختاران: تحتاج الأسئلة إلى مختبر فيه موقد وميزان حرارة، وليس لدى الفصل مختبر."),
      L("Add Context and ask again: now the questions use things pupils see every day. Then add Format and Language, and watch the answer get shorter and simpler.", "أضف «السياق» واسأل من جديد: تستعمل الأسئلة الآن أشياء يراها الطلاب كل يوم. ثم أضف «الشكل» و«اللغة»، ولاحظ الإجابة تصير أقصر وأبسط."),
      L("Now take one ingredient away at a time. Without Role the questions only test definitions; without Task the AI doesn't know what to write.", "والآن احذف مكوّنًا واحدًا في كل مرة. من دون «الدور» تختبر الأسئلة التعريفات فقط، ومن دون «المهمة» لا يعرف الذكاء الاصطناعي ماذا يكتب."),
    ]} />
    <div ref={box} onClick={asked}>
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
    answer={(on) => promptAnswer(on, lang === "ar" ? "ar" : "en")}
    takeaway={L("Each ingredient changes the answer in its own way: the role sets the kind of questions, the context fits them to your class, and the format and language shape how they read.", "كل مكوّن يغيّر الإجابة بطريقته: الدور يحدّد نوع الأسئلة، والسياق يجعلها على مقاس فصلك، والشكل واللغة يحدّدان طريقة كتابتها.")} />
    </div>
  </>;
}
