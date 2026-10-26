import { useEffect, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { analyse, OFFLINE, ONLINE, passphrase, pools, seconds, type Weakness } from "./model";

const WORDS = {
  en: "river mango camel desert olive window pencil cloud garden market lantern teacher rocket valley bridge orange tiger yellow silver palm basket candle island honey kettle ladder mirror needle ocean pepper quiet ribbon saddle thunder umbrella violin wagon zebra anchor banana carpet dolphin engine falcon guitar hammer jungle kitchen lemon meadow notebook onion parrot rabbit sandal tomato uncle velvet walnut yogurt apricot bicycle compass donkey eagle feather goat harbour ink jasmine kite lizard melon nest oasis pigeon quilt radio spoon tent violet wheat cactus dune fig gazelle hill iron jar kiwi lake mint nut oven pearl rose salt tea vase wool date map drum fox cotton barley canal clay coral".split(" "),
  ar: "نهر مانجو جمل صحراء زيتون نافذة قلم سحابة حديقة سوق فانوس معلم صاروخ وادي جسر برتقال نمر أصفر فضة نخلة سلة شمعة جزيرة عسل إبريق سلم مرآة إبرة محيط فلفل هدوء شريط سرج رعد مظلة كمان عربة حمار وحشي مرساة موز سجادة دلفين محرك صقر غيتار مطرقة غابة مطبخ ليمون مرج دفتر بصل ببغاء أرنب صندل طماطم عم مخمل جوز لبن مشمش دراجة بوصلة حمار نسر ريشة ماعز ميناء حبر ياسمين طائرة سحلية بطيخ عش واحة حمامة لحاف مذياع ملعقة خيمة بنفسج قمح صبار كثيب تين غزال تل حديد جرة بحيرة نعناع فرن لؤلؤ وردة ملح شاي مزهرية صوف تمر خريطة طبل ثعلب قطن شعير قناة طين مرجان".split(" "),
};
const S = {
  en: {
    intro: "Attackers don't guess passwords at random: they try the most common ones, words, names, years and keyboard runs first. Type a password to see how an attacker would see it. Nothing you type leaves this phone.",
    label: "Try a password (don't use your real one)", show: "Show", hide: "Hide",
    levels: ["Very weak", "Weak", "Fair", "Strong", "Very strong"], bits: (n: string) => `about ${n} bits of guessing`,
    online: "Guessing on a website that slows attackers down", offline: "Guessing a stolen password file with a fast computer", instantly: "instantly",
    time: { s: { one: "1 second", other: "{n} seconds" }, min: { one: "1 minute", other: "{n} minutes" }, h: { one: "1 hour", other: "{n} hours" }, d: { one: "1 day", other: "{n} days" }, y: { one: "1 year", other: "{n} years" } } as Record<string, Forms>, ages: "longer than people have existed",
    kinds: "Kinds of characters", kind: { lower: "small letters", upper: "capitals", digit: "digits", arabic: "Arabic letters", symbol: "symbols", space: "spaces" } as Record<string, string>,
    weak: { common: "It's on the lists of the most common passwords, tried first.", word: "It's built on a common word; attackers try dictionaries.", year: "It contains a year; years are among the first things tried.", keyboard: "It contains a keyboard run like “qwer” or “1234”.", repeat: "It repeats the same character.", short: "It's shorter than 8 characters.", digitsOnly: "It's only digits: just 10 choices per character." } as Record<Weakness, string>,
    phrase: "Make a passphrase", phraseNote: (n: string, size: string, b: string, real: string) => `${n} random words from our list of ${size} words: about ${b} bits, even for an attacker who knows the list. Real generators use 7,776 words, which gives about ${real} bits: long, easy to remember, hard to guess.`,
    tips: "Length beats tricks: four or five random words beat “P@ssw0rd!”. Use a different password for every site (a password manager remembers them), and turn on two-step sign-in.",
    takeaway: "A strong password is long, unpredictable and used in one place only. What makes it weak is predictability: common passwords, words and patterns are guessed in seconds, however many symbols you add.",
  },
  ar: {
    intro: "لا يخمّن المهاجمون كلمات المرور عشوائيًا: بل يجرّبون أولًا أشيعها، والكلمات والأسماء والسنوات وتسلسلات لوحة المفاتيح. اكتب كلمة مرور لترى كيف يراها المهاجم. لا يغادر شيء مما تكتبه هذا الهاتف.",
    label: "جرّب كلمة مرور (لا تستعمل كلمتك الحقيقية)", show: "أظهر", hide: "أخفِ",
    levels: ["ضعيفة جدًا", "ضعيفة", "مقبولة", "قوية", "قوية جدًا"], bits: (n: string) => `نحو ${n} بت من التخمين`,
    online: "التخمين على موقع يبطّئ المهاجمين", offline: "تخمين ملف كلمات مرور مسروق بحاسوب سريع", instantly: "فورًا",
    time: { s: { one: "ثانية واحدة", two: "ثانيتان", few: "{n} ثوانٍ", many: "{n} ثانية", other: "{n} ثانية" }, min: { one: "دقيقة واحدة", two: "دقيقتان", few: "{n} دقائق", many: "{n} دقيقة", other: "{n} دقيقة" }, h: { one: "ساعة واحدة", two: "ساعتان", few: "{n} ساعات", many: "{n} ساعة", other: "{n} ساعة" }, d: { one: "يوم واحد", two: "يومان", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" }, y: { one: "سنة واحدة", two: "سنتان", few: "{n} سنوات", many: "{n} سنة", other: "{n} سنة" } } as Record<string, Forms>, ages: "أطول من عمر البشرية",
    kinds: "أنواع الرموز", kind: { lower: "حروف صغيرة", upper: "حروف كبيرة", digit: "أرقام", arabic: "حروف عربية", symbol: "رموز", space: "مسافات" } as Record<string, string>,
    weak: { common: "إنها في قوائم أشيع كلمات المرور، وتُجرَّب أولًا.", word: "مبنية على كلمة شائعة، والمهاجمون يجرّبون القواميس.", year: "فيها سنة، والسنوات من أول ما يُجرَّب.", keyboard: "فيها تسلسل من لوحة المفاتيح مثل «qwer» أو «1234».", repeat: "تكرّر الرمز نفسه.", short: "أقصر من ٨ رموز.", digitsOnly: "أرقام فقط: ١٠ خيارات فقط لكل رمز." } as Record<Weakness, string>,
    phrase: "أنشئ عبارة مرور", phraseNote: (n: string, size: string, b: string, real: string) => `${n} كلمات عشوائية من قائمتنا التي فيها ${size} كلمة: نحو ${b} بت، حتى لمهاجم يعرف القائمة. والمولّدات الحقيقية تستعمل ٧٧٧٦ كلمة، فتعطي نحو ${real} بت: طويلة وسهلة التذكّر وصعبة التخمين.`,
    tips: "الطول يغلب الحيل: أربع أو خمس كلمات عشوائية تغلب «P@ssw0rd!». استعمل كلمة مرور مختلفة لكل موقع (يتذكّرها لك مدير كلمات المرور)، وفعّل الدخول بخطوتين.",
    takeaway: "كلمة المرور القوية طويلة وغير متوقعة ولا تُستعمل إلا في مكان واحد. وما يضعفها هو قابليتها للتوقع: كلمات المرور الشائعة والكلمات والأنماط تُخمَّن في ثوانٍ، مهما أضفت من رموز.",
  },
};

export default function Password({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const count = usePlural();
  const [pw, setPw] = useState("sunshine2024");
  const [show, setShow] = useState(true);
  const [tried, setTried] = useState(() => new Set<string>());
  const [phrase, setPhrase] = useState<string[] | null>(null);
  const words = WORDS[lang === "ar" ? "ar" : "en"];
  useEffect(() => { const t = setTimeout(() => pw && setTried((x) => new Set(x).add(pw)), 800); return () => clearTimeout(t); }, [pw]);
  useEffect(() => { if (tried.size >= 3) onDone?.(); }, [tried.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const sep = lang === "ar" ? " " : "-";
  // A generated passphrase is only as strong as the list it was drawn from, so judge it by that, not by its length.
  const fromList = phrase !== null && pw === phrase.join(sep);
  const found = analyse(pw), a = fromList ? { bits: phrase.length * Math.log2(words.length), found: [] } : found;
  const p = pools(pw), level = a.bits < 28 ? 0 : a.bits < 36 ? 1 : a.bits < 60 ? 2 : a.bits < 80 ? 3 : 4;
  const when = (sec: number) => {
    if (sec < 1) return s.instantly;
    const steps: [string, number][] = [["s", 1], ["min", 60], ["h", 3600], ["d", 86400], ["y", 31557600]];
    if (sec > 31557600 * 1e6) return s.ages;
    const [unit, size] = steps.filter(([, z]) => sec >= z).pop()!;
    const v = sec / size;
    return count(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10, s.time[unit], { maximumFractionDigits: 1 });
  };

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <label className="dr-field-label" htmlFor="lb-pw">{s.label}</label>
      <div className="lb-ask-row">
        <input id="lb-pw" className="dr-field-input" type={show ? "text" : "password"} dir="auto" autoComplete="off" autoCapitalize="off" spellCheck={false} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? s.hide : s.show}</Button>
      </div>
      <div className={`lb-meter is-${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((a.bits / 80) * 100))} aria-label={s.levels[level]}>
        <span style={{ inlineSize: `${Math.min(100, Math.max(4, (a.bits / 80) * 100))}%` }} />
      </div>
      <p className="lb-verdict" aria-live="polite">{s.levels[level]}<span className="lb-note">{lang === "ar" ? "، " : ", "}{s.bits(num(Math.round(a.bits)))}</span></p>
      <div className="lb-two">
        <div className="stack">
          <dl className="lb-stats">
            <div><dt>{s.online}</dt><dd>{when(seconds(a.bits, ONLINE))}</dd></div>
            <div><dt>{s.offline}</dt><dd>{when(seconds(a.bits, OFFLINE))}</dd></div>
          </dl>
          {a.found.length > 0 && <ul className="lb-flags">{a.found.map((w) => <li key={w}>{s.weak[w]}</li>)}</ul>}
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.kinds}</span>
          <div className="lb-chips is-compact">{(["lower", "upper", "digit", "arabic", "symbol", "space"] as const).map((k) => <span key={k} className={p[k] ? "lb-chip is-on" : "lb-chip"}>{s.kind[k]}</span>)}</div>
          <div className="lb-row"><Button size="sm" variant="secondary" icon="lock" onClick={() => { const ws = passphrase(words, 5); setPhrase(ws); setPw(ws.join(sep)); }}>{s.phrase}</Button></div>
          {phrase && <p className="lb-note">{s.phraseNote(num(5), num(words.length), num(Math.round(5 * Math.log2(words.length))), num(Math.round(5 * Math.log2(7776))))}</p>}
        </div>
      </div>
      <p className="lb-note">{s.tips}</p>
    </LabShell>
  );
}
