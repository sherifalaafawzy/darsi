import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../dist/styles.css";
import "./playground.css";
import * as D from "../src";
import { colors, typography } from "../src/tokens";

type Lang = "en" | "ar";
const ar = (lang: Lang) => lang === "ar";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="pg-section"><h2>{title}</h2><div className="pg-grid">{children}</div></section>;
}
function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <div className={`pg-card${wide ? " wide" : ""}`}><h3>{title}</h3>{children}</div>;
}
const art = (fill: string, shape: "sensor" | "lamp" | "phone" | "plant") => (
  <svg viewBox="0 0 120 90" width="100%" height="100%" aria-hidden>
    {shape === "sensor" && <><rect x={52} y={10} width={16} height={50} rx={8} fill="var(--ink)" /><circle cx={60} cy={66} r={14} fill={fill} /></>}
    {shape === "lamp" && <><circle cx={60} cy={38} r={20} fill={fill} /><rect x={52} y={58} width={16} height={14} rx={3} fill="var(--ink)" /></>}
    {shape === "phone" && <><rect x={42} y={8} width={36} height={74} rx={8} fill="var(--ink)" /><rect x={46} y={16} width={28} height={52} rx={3} fill={fill} /></>}
    {shape === "plant" && <><rect x={44} y={56} width={32} height={26} rx={6} fill="var(--kola)" /><circle cx={48} cy={30} r={12} fill={fill} /><circle cx={72} cy={24} r={12} fill={fill} /></>}
  </svg>
);
const poster = (
  <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <rect width={320} height={180} fill="var(--lagoon-ink)" /><rect x={40} y={30} width={240} height={110} rx={10} fill="var(--ink)" />
    <rect x={60} y={52} width={120} height={10} rx={5} fill="var(--sunbird)" /><rect x={60} y={74} width={170} height={8} rx={4} fill="var(--ink-inverse)" /><circle cx={240} cy={110} r={18} fill="var(--kola)" />
  </svg>
);

function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<"light" | "sunlight">("light");
  const [sw, setSw] = useState(true);
  const [langPick, setLangPick] = useState("ar");
  const L = (en: string, a: string) => (ar(lang) ? a : en);
  const switchTo = (l: Lang, th = theme) => { setLang(l); D.applyLocale(l, th); };
  return (
    <>
      <header className="pg-top" dir="ltr">
        <D.Mark size={36} /><strong>Darsi design system</strong>
        <span className="pg-spacer" />
        <div className="pg-seg" role="group" aria-label="Language">
          <button aria-pressed={lang === "en"} onClick={() => switchTo("en")}>English · LTR</button>
          <button aria-pressed={lang === "ar"} onClick={() => switchTo("ar")}>العربية · RTL</button>
        </div>
        <div className="pg-seg" role="group" aria-label="Theme">
          <button aria-pressed={theme === "light"} onClick={() => { setTheme("light"); D.applyLocale(lang, "light"); }}>Day</button>
          <button aria-pressed={theme === "sunlight"} onClick={() => { setTheme("sunlight"); D.applyLocale(lang, "sunlight"); }}>Sunlight</button>
        </div>
      </header>
      <main className="pg-main">
        <Section id="foundations" title="Foundations">
          <Card title="Colour" wide>
            <div className="pg-swatches">{Object.keys(colors.light).map((n) => <div key={n}><i style={{ background: `var(--${n})` }} /><code>{n}</code></div>)}</div>
          </Card>
          <Card title="Type" wide>
            {Object.keys(typography).map((n) => <p key={n} className={n} style={{ margin: "4px 0" }}>{n} — {L("Teach more, in your own language", "علّم أكثر، بلغتك")}</p>)}
          </Card>
        </Section>

        <Section id="actions" title="Actions & identity">
          <Card title="Button"><div className="pg-row"><D.Button iconEnd="next">{L("Start lesson", "ابدأ الدرس")}</D.Button><D.Button variant="secondary" icon="offline">{L("Download", "تنزيل")}</D.Button><D.Button variant="ghost">{L("Skip", "تخطَّ")}</D.Button><D.Button loading>{L("Saving", "جارٍ الحفظ")}</D.Button></div></Card>
          <Card title="TrackChip"><div className="pg-row"><D.TrackChip track="ai" /><D.TrackChip track="iot" solid /><D.TrackChip track="cyber" /></div></Card>
          <Card title="StreakCounter"><D.StreakCounter count={L("3 weeks", "٣ أسابيع")} label={L("Teaching week streak", "أسابيع متتالية")} done={3} days={5} /></Card>
        </Section>

        <Section id="shell" title="App shell & PWA">
          <Card title="AppBar"><D.AppBar title={L("Learn", "تعلّم")} actions={<D.StreakCounter compact count="3" />} /><D.AppBar title={L("Unit 2: Sensors", "الوحدة ٢: المستشعرات")} onBack={() => {}} /></Card>
          <Card title="BottomNav"><D.BottomNav items={[{ icon: "learn", label: L("Learn", "تعلّم"), active: true }, { icon: "offline", label: L("Downloads", "التنزيلات"), badge: "2" }, { icon: "award", label: L("Kit", "الحقيبة") }, { icon: "profile", label: L("Me", "حسابي") }]} /></Card>
          <Card title="ConnectionStatus"><div className="pg-stack"><D.ConnectionStatus state="offline">{L("You're offline — downloaded lessons still work", "أنت غير متصل — الدروس المنزّلة تعمل")}</D.ConnectionStatus><D.ConnectionStatus state="syncing">{L("Syncing 3 lessons…", "جارٍ مزامنة ٣ دروس…")}</D.ConnectionStatus></div></Card>
          <Card title="InstallPrompt"><D.InstallPrompt title={L("Add Darsi to your home screen", "أضف درسي إلى الشاشة الرئيسية")} body={L("Works offline, uses under 2 MB.", "يعمل دون اتصال بأقل من ٢ ميغابايت.")} /></Card>
          <Card title="UpdateToast"><D.UpdateToast>{L("A new version is ready", "نسخة جديدة جاهزة")}</D.UpdateToast></Card>
          <Card title="DownloadRow"><div className="pg-stack"><D.DownloadRow track="iot" title={L("Unit 2: Sensors", "الوحدة ٢: المستشعرات")} meta={L("Downloading 2.1 of 6 MB", "٢٫١ من ٦ ميغابايت")} state="downloading" progress={35} /><D.DownloadRow track="cyber" title={L("Unit 1: Passwords", "الوحدة ١: كلمات المرور")} meta="3 MB" state="done" /></div></Card>
          <Card title="EmptyState"><D.EmptyState tone="offline" title={L("You're offline", "أنت غير متصل")} body={L("Your 3 saved units still work.", "وحداتك الثلاث المحفوظة تعمل.")} action={<D.Button size="sm" variant="secondary" icon="offline">{L("Open downloads", "افتح التنزيلات")}</D.Button>} /></Card>
        </Section>

        <Section id="learning" title="Lessons">
          <Card title="LessonCard"><D.LessonCard track="ai" offline title={L("Use AI to draft a lesson plan — then check it", "استخدم الذكاء الاصطناعي لتحضير درس، ثم راجعه")} meta={L("Lesson 4 · 6 min", "الدرس ٤، ٦ دقائق")} progress={50} action={<D.Button size="sm" iconEnd="next">{L("Continue", "تابِع")}</D.Button>} /></Card>
          <Card title="UnitPath"><D.UnitPath track="iot" nodes={[{ label: L("What is a sensor?", "ما المستشعر؟"), state: "done" }, { label: L("Build a rain gauge", "اصنع مقياس مطر"), state: "current", callout: L("Start", "ابدأ") }, { label: L("Data in class", "البيانات في الصف"), state: "locked" }, { label: L("Unit check", "اختبار الوحدة"), state: "locked", checkpoint: true }]} /></Card>
          <Card title="FeedbackSheet"><D.FeedbackSheet floating={false} result="correct" title={L("Correct!", "صحيح!")} explanation={L("A sensor turns something in the room into a number.", "المستشعر يحوّل شيئًا في الغرفة إلى رقم.")} /></Card>
          <Card title="LessonComplete"><D.LessonComplete title={L("Lesson done!", "أحسنت!")} stats={[{ label: "XP", value: "+30" }, { label: L("Accuracy", "الدقة"), value: D.formatPercent(0.9, ar(lang) ? "ar-EG" : "en"), tone: "iot" }, { label: L("Time", "الوقت"), value: L("6 min", "٦ د"), tone: "ai" }]} tryTomorrow={L("Read the gauge each morning and plot it on the board.", "اقرأ المقياس كل صباح وارسمه على السبّورة.")} tryLabel={L("Try it in class tomorrow", "جرّبها في الصف غدًا")} /></Card>
          <Card title="CertificateCard"><D.CertificateCard track="ai" name={L("Amina Bello", "منى عبد الرحمن")} title={L("AI in the classroom — Level 1", "الذكاء الاصطناعي في الصف — المستوى ١")} kicker={L("Certificate of completion", "شهادة إتمام")} trackLabel={L("AI", "الذكاء الاصطناعي")} date={new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(2026, 9, 25))} code="DRS-AI1-7KQ2" /></Card>
        </Section>

        <Section id="questions" title="Question types">
          <Card title="QuizOption (single & multi)"><div className="pg-stack"><D.QuestionHeader typeLabel={L("Choose one", "اختر إجابة")} prompt={L("Which of these is a sensor?", "أيّ هذه مستشعر؟")} /><D.QuizOption keyLabel={L("A", "أ")} state="correct" feedback={L("Correct — it turns heat into a number.", "صحيح — يحوّل الحرارة إلى رقم.")}>{L("A thermometer probe", "مقياس الحرارة")}</D.QuizOption><D.QuizOption keyLabel={L("B", "ب")}>{L("A projector", "جهاز العرض")}</D.QuizOption><D.QuizOption multi state="selected">{L("Select-all style", "اختيار متعدد")}</D.QuizOption></div></Card>
          <Card title="TrueFalse"><D.TrueFalse value={false} result="correct" trueLabel={L("True", "صح")} falseLabel={L("False", "خطأ")} /></Card>
          <Card title="ImageChoice"><D.ImageChoice value="b" result="correct" answer="b" options={[{ id: "a", label: L("Lamp", "مصباح"), media: art("var(--sunbird)", "lamp") }, { id: "b", label: L("Probe", "مجسّ"), media: art("var(--hibiscus)", "sensor") }, { id: "c", label: L("Phone", "هاتف"), media: art("var(--lagoon-soft)", "phone") }, { id: "d", label: L("Plant", "نبتة"), media: art("var(--lagoon)", "plant") }]} /></Card>
          <Card title="MatchPairs"><D.MatchPairs key={lang} pairs={{ t: "heat" }} left={[{ id: "t", label: L("Thermometer", "مقياس حرارة") }, { id: "s", label: L("Soil probe", "مجسّ التربة") }]} right={[{ id: "wet", label: L("Moisture", "الرطوبة") }, { id: "heat", label: L("Temperature", "الحرارة") }]} /></Card>
          <Card title="OrderSteps"><D.OrderSteps key={lang} items={[{ id: "1", label: L("Collect examples", "جمع الأمثلة") }, { id: "2", label: L("Train the model", "تدريب النموذج") }, { id: "3", label: L("Test it", "اختباره") }]} /></Card>
          <Card title="FillBlank"><D.FillBlank key={lang} parts={ar(lang) ? ["يحوّل ", { blank: 0 }, " شيئًا في الغرفة إلى ", { blank: 1 }, "."] : ["A ", { blank: 0 }, " turns something in the room into a ", { blank: 1 }, "."]} bank={ar(lang) ? ["المستشعر", "رقم", "محرّك"] : ["sensor", "number", "motor"]} /></Card>
          <Card title="HotspotImage"><D.HotspotImage spots={[{ id: "from", x: 4, y: 6, w: 92, h: 22, label: "Sender is not the ministry's domain" }, { id: "link", x: 4, y: 64, w: 60, h: 22, label: "Link hides another address" }]} found={["link"]} counter={(a, b) => L(`${a} of ${b} found`, `تم العثور على ${D.formatNumber(a, "ar-EG")} من ${D.formatNumber(b, "ar-EG")}`)}><div className="pg-mail" dir="ltr"><p><b>From:</b> ministry@edu-gov-pay.net</p><p>Your salary is on hold. Confirm within 24 hours.</p><p><u>Verify my account</u></p></div></D.HotspotImage></Card>
          <Card title="ScenarioCard"><D.ScenarioCard key={lang} who={L("Mr Okafor, Grade 8", "أ. سلمى، رياضيات")} initial={L("O", "س")} situation={L("A pupil hands in a perfect essay you suspect AI wrote.", "وصلت رسالة تطلب تحديث البيانات عبر رابط.")} ask={L("What do you do first?", "ماذا تفعلين؟")} chosen="b" choices={[{ id: "a", label: L("Give it zero", "أضغط الرابط"), tone: "consider", toneLabel: L("Think again", "فكّري مجددًا"), consequence: L("Hunches are often wrong.", "الروابط المستعجلة خطر.") }, { id: "b", label: L("Ask the pupil to explain it", "أتصل بالإدارة أولًا"), tone: "good", toneLabel: L("Strong choice", "اختيار قوي"), consequence: L("A short talk shows real understanding.", "التحقق عبر قناة أخرى أفضل حماية.") }]} /></Card>
          <Card title="Reflection"><D.Reflection key={lang} prompt={L("How will you use this in class?", "كيف ستستخدم هذا في صفّك؟")} placeholder={L("e.g. pupils read the gauge each morning…", "مثلًا: يقرأ الطلاب المقياس كل صباح…")} countText={(n) => L(`${n} words`, `${D.formatNumber(n, "ar-EG")} كلمة`)} /></Card>
          <Card title="VideoPlayer" wide><div className="pg-row2"><D.VideoPlayer poster={poster} title={L("What is a sensor?", "ما هو المستشعر؟")} meta="3:40 · 240p · 3.1 MB" duration={220} current={72} chapters={[{ at: 60, label: "Examples" }]} questionsAt={[95, 180]} caption={L("A sensor turns something into a number.", "المستشعر يحوّل الشيء إلى رقم.")} /><D.VideoPlayer poster={poster} title={L("Checkpoint", "نقطة توقف")} duration={220} current={95} questionsAt={[95]} checkpointLabel={L("Pause and answer", "توقّف وأجب")} checkpoint={<D.TrueFalse trueLabel={L("True", "صح")} falseLabel={L("False", "خطأ")} />} /></div></Card>
        </Section>

        <Section id="lab" title="AI lab">
          <Card title="PromptBuilder"><D.PromptBuilder key={lang} title={L("Build a better prompt", "اصنع طلبًا أفضل")} ingredients={[{ key: "role", label: L("Role", "الدور"), text: L("You are a Grade 6 science teacher.", "أنت معلم علوم للصف السادس."), on: true }, { key: "task", label: L("Task", "المهمة"), text: L("Write 3 discussion questions", "اكتب ثلاثة أسئلة للنقاش"), on: true }, { key: "ctx", label: L("Context", "السياق"), text: L("about the water cycle.", "عن دورة الماء.") }]} outputs={["", "…", "…", L("1. Where does rain go? 2. Why do puddles vanish? 3. Where have you seen steam?", "١. أين يذهب المطر؟ ٢. لماذا تختفي البرك؟ ٣. أين رأيت البخار؟")]} ran takeaway={L("Each ingredient makes the answer more useful.", "كل مكوّن يجعل الإجابة أنفع.")} /></Card>
          <Card title="TokenViewer"><D.TokenViewer key={lang} title={L("How AI reads text", "كيف يقرأ الذكاء الاصطناعي النص")} text={L("Teachers explain photosynthesis beautifully.", "المعلمون يشرحون البناء الضوئي بإتقان.")} /></Card>
          <Card title="NextWordLab"><D.NextWordLab key={lang} title={L("Guess the next word", "خمّن الكلمة التالية")} context={L("In the morning the pupils open their", "في الصباح يفتح الطلاب")} candidates={ar(lang) ? [{ word: "كتبهم", p: 0.5 }, { word: "دفاترهم", p: 0.3 }, { word: "هواتفهم", p: 0.2 }] : [{ word: "books", p: 0.55 }, { word: "notebooks", p: 0.25 }, { word: "phones", p: 0.2 }]} /></Card>
          <Card title="TrainClassifier"><D.TrainClassifier key={lang} title={L("Teach the machine", "علّم الآلة")} classes={[{ id: "s", label: L("Safe", "آمنة"), tone: "lagoon", examples: [L("Meeting moved to Tuesday", "الاجتماع يوم الثلاثاء")] }, { id: "p", label: L("Phishing", "تصيّد"), tone: "hibiscus", examples: [L("Your account will be closed click now", "حسابك سيُغلق اضغط الآن")] }]} test={L("Click now to keep your account", "اضغط الآن")} /></Card>
          <Card title="FactCheck"><D.FactCheck key={lang} title={L("Check the AI's answer", "تحقّق من إجابة الذكاء الاصطناعي")} open="c2" verdicts={{ c2: "true" }} answer={[{ text: L("The Nile ", "النيل ") }, { text: L("flows from north to south", "يجري من الشمال إلى الجنوب"), claim: { id: "c2", verdict: "false", note: L("Wrong — it flows south to north.", "خطأ — يجري من الجنوب إلى الشمال.") } }, { text: "." }]} /></Card>
        </Section>

        <Section id="kit" title="Teacher kit">
          <Card title="ClassroomKit" wide><D.ClassroomKit track="iot" title={L("Unit 2: Sensors", "الوحدة ٢: المستشعرات")} subtitle={L("Ready to print · works offline", "جاهزة للطباعة، تعمل دون اتصال")} items={[{ kind: "lesson-plan", kindLabel: L("Lesson plan", "خطة درس"), title: L("Build a rain gauge", "اصنع مقياس مطر"), meta: "2 pages · 180 KB" }, { kind: "worksheet", kindLabel: L("Worksheet", "ورقة عمل"), title: L("Plot the week", "ارسم بيانات الأسبوع"), meta: "1 page · 90 KB" }]} /></Card>
        </Section>

        <Section id="onboarding" title="Onboarding & settings">
          <Card title="OnboardingStep"><D.OnboardingStep step={2} total={4} title={L("What do you want to learn?", "ماذا تريد أن تتعلّم؟")} primary={<D.Button block iconEnd="next">{L("Continue", "متابعة")}</D.Button>}><D.ChoiceCard icon="ai" multi selected title={L("AI", "الذكاء الاصطناعي")} /><D.ChoiceCard icon="iot" multi title={L("IoT", "إنترنت الأشياء")} /></D.OnboardingStep></Card>
          <Card title="PlacementResult"><D.PlacementResult title={L("Here's where you start", "هذه نقطة بدايتك")} levels={[{ track: "ai", level: 2, label: L("Level 2", "المستوى ٢") }, { track: "cyber", level: 1, label: L("Level 1", "المستوى ١") }]} /></Card>
          <Card title="LanguagePicker"><D.LanguagePicker label="Language" value={langPick} onChange={setLangPick} languages={[{ code: "ar", native: "العربية", english: "Arabic", dir: "rtl" }, { code: "fr", native: "Français", english: "French" }, { code: "sw", native: "Kiswahili", english: "Swahili" }]} /></Card>
          <Card title="Switch & TextField"><D.Switch label={L("Sunlight mode", "وضع ضوء الشمس")} description={L("High contrast for outdoor classrooms", "تباين عالٍ للفصول الخارجية")} checked={sw} onChange={setSw} /><D.TextField label={L("Your name (for certificates)", "اسمك (للشهادة)")} defaultValue={L("Amina Bello", "منى")} hint={L("Shown exactly as typed", "يظهر كما كتبته")} /></Card>
        </Section>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
