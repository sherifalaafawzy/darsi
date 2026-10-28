import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { ALPHABET, counts, crack, FREQ, shift, type Lang } from "./model";

const TEXT = {
  en: { short: "meet me at the school gate at noon", long: "the students learn to read and write at school, and every teacher can help them keep their accounts and passwords safe from people who send messages to trick them on the internet every week" },
  ar: { short: "نلتقي عند باب المدرسة ظهرا", long: "العلم نور والجهل ظلام. يتعلم الطلاب في المدرسة القراءة والكتابة والحساب، ويتعلمون أيضا كيف يحمون حساباتهم وكلمات المرور الخاصة بهم من المحتالين على الانترنت." },
};
const S = {
  en: {
    intro: "Julius Caesar hid messages by moving every letter a few places along the alphabet. Try it, then crack a secret message the way codebreakers do: by counting letters.",
    mode: "Do", hide: "Hide a message", crack: "Crack a message", message: "Message", key: "Key: move each letter by", secret: "Secret message",
    map: "Each letter becomes the bold one below it", unknown: "This message was hidden with a key you don't know.",
    guess: "Your guess: move each letter back by", freq: "Letter counts in the text above (bars) and in normal English (dots)",
    lineUp: "Move your guess until the bars line up with the dots.", you: (k: string) => `You cracked it: the key is ${k}.`,
    auto: "Let the computer try every key", tries: "Every possible key, most language-like first",
    found: (k: string) => `Cracked: the key was ${k}.`, shortNote: "Counting works on long messages; a short one may fool it.",
    try1: "In Hide a message, move the Key: every letter moves by the same amount, so the same letter always becomes the same secret letter.",
    try2: "In Crack a message, find the tallest bar: it is probably “e”. Move your guess until the bars line up with the dots, and the message reads.",
    try3: (n: string) => `Press Let the computer try every key: it checks all ${n} keys in a blink and ranks them by how much the letters look like English.`,
    takeaway: "A cipher with only 25 keys is no secret: a computer tries them all in a blink, and letter counts give it away even by hand. Modern encryption has more keys than there are atoms on Earth, and hides letter patterns completely.",
  },
  ar: {
    intro: "أخفى يوليوس قيصر رسائله بتحريك كل حرف بضعة مواضع في الأبجدية. جرّب ذلك، ثم اكسر رسالة سرية كما يفعل محلّلو الشيفرات: بعدّ الحروف.",
    mode: "المهمة", hide: "أخفِ رسالة", crack: "اكسر رسالة", message: "الرسالة", key: "المفتاح: حرّك كل حرف بمقدار", secret: "الرسالة السرية",
    map: "يصبح كل حرف الحرفَ الغامق الذي تحته", unknown: "أُخفيت هذه الرسالة بمفتاح لا تعرفه.",
    guess: "تخمينك: أرجِع كل حرف بمقدار", freq: "عدد الحروف في النص أعلاه (أعمدة) وفي العربية المعتادة (نقاط)",
    lineUp: "حرّك تخمينك حتى تصطف الأعمدة مع النقاط.", you: (k: string) => `كسرتها: المفتاح هو ${k}.`,
    auto: "دع الحاسوب يجرّب كل المفاتيح", tries: "كل المفاتيح الممكنة، الأقرب إلى اللغة أولًا",
    found: (k: string) => `كُسرت: المفتاح كان ${k}.`, shortNote: "ينجح العدّ مع الرسائل الطويلة، أما القصيرة فقد تخدعه.",
    try1: "في «أخفِ رسالة» حرّك المفتاح: يتحرّك كل حرف بالمقدار نفسه، فيصبح الحرف نفسه دائمًا الحرفَ السري نفسه.",
    try2: "في «اكسر رسالة» ابحث عن أطول عمود، فهو غالبًا حرف «ا». حرّك تخمينك حتى تصطف الأعمدة مع النقاط، فتصبح الرسالة مقروءة.",
    try3: (n: string) => `اضغط «دع الحاسوب يجرّب كل المفاتيح»: يفحص المفاتيح الـ${n} كلها في لمحة، ويرتّبها بحسب قرب حروفها من العربية.`,
    takeaway: "الشيفرة التي لها ٢٧ مفتاحًا فقط ليست سرًا: يجرّبها الحاسوب كلها في لمحة، وعدد الحروف يفضحها حتى باليد. أما التشفير الحديث فمفاتيحه أكثر من ذرات الأرض، ويخفي أنماط الحروف تمامًا.",
  },
};

export default function Caesar({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const L: Lang = lang === "ar" ? "ar" : "en";
  const abc = ALPHABET[L], n = abc.length;
  const [mode, setMode] = useState<"hide" | "crack">("hide");
  const [msg, setMsg] = useState(TEXT[L].short);
  const [k, setK] = useState(3);
  const [secretKey] = useState(() => 5 + Math.floor(Math.random() * (n - 10)));
  const [guess, setGuess] = useState(0);
  const [auto, setAuto] = useState(false);
  useEffect(() => { setMsg(TEXT[L].short); setGuess(0); setAuto(false); }, [L]);
  const solved = guess === secretKey;
  useEffect(() => { if (solved || auto) onDone?.(); }, [solved || auto]); // eslint-disable-line react-hooks/exhaustive-deps
  const cipher = useMemo(() => shift(TEXT[L].long, secretKey, L), [L, secretKey]);
  const tries = useMemo(() => crack(cipher, L), [cipher, L]);
  // The bars count the letters of the message as the learner's guess decodes it: they line up with the dots of normal
  // language when the guess is the key.
  const decoded = shift(cipher, -guess, L);
  const c = counts(decoded, L), total = c.reduce((a, b) => a + b, 0) || 1, fsum = FREQ[L].reduce((a, b) => a + b, 0);
  const top = Math.max(...c.map((x) => x / total), ...FREQ[L].map((f) => f / fsum));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3(num(n - 1))]} takeaway={s.takeaway}>
      <Segmented label={s.mode} value={mode} options={[["hide", s.hide], ["crack", s.crack]]} onChange={setMode} />
      {mode === "hide" ? (
        <div className="stack">
          <label className="dr-field-label" htmlFor="lb-caesar-msg">{s.message}</label>
          <input id="lb-caesar-msg" className="dr-field-input" dir="auto" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Slider label={s.key} value={k} min={1} max={n - 1} onChange={setK} format={(v) => num(v)} />
          <span className="lb-note">{s.map}</span>
          {/* One small tile per letter, wrapping onto as many lines as the screen needs (no sideways scrolling). */}
          <div className="lb-chips is-compact">
            {abc.map((ch, i) => <span key={ch} className="lb-tok"><small>{ch}</small><span>{abc[(i + k) % n]}</span></span>)}
          </div>
          <span className="dr-field-label">{s.secret}</span>
          <p className="lb-llm-text">{shift(msg, k, L)}</p>
        </div>
      ) : (
        <div className="stack">
          <span className="lb-note">{s.unknown}</span>
          <Slider label={s.guess} value={guess} min={0} max={n - 1} onChange={setGuess} format={(v) => num(v)} />
          <p className="lb-llm-text">{decoded}</p>
          <span className="dr-field-label">{s.freq}</span>
          <div className="lb-freq" role="img" aria-label={s.freq}>
            {abc.map((ch, i) => (
              <span key={ch} className="lb-freq-col">
                <span className="lb-freq-bar" style={{ blockSize: `${((c[i] / total) / top) * 100}%` }} />
                <span className="lb-freq-dot" style={{ insetBlockEnd: `calc(${((FREQ[L][i] / fsum) / top) * 100}% - 4px)` }} />
                <small>{ch}</small>
              </span>
            ))}
          </div>
          {solved ? <p className="lb-answer is-ok" aria-live="polite">{s.you(num(secretKey))}</p> : <p className="lb-note">{s.lineUp}</p>}
          {auto ? (
            <>
              <span className="dr-field-label">{s.tries}</span>
              <ol className="lb-tries">
                {tries.slice(0, 5).map((t, i) => (
                  <li key={t.k} className={i === 0 ? "is-on" : undefined}>
                    <span className="lb-tries-k">{num(t.k)}</span><span dir="auto">{t.plain.slice(0, 48)}…</span>
                  </li>
                ))}
              </ol>
              <p className="lb-verdict" aria-live="polite">{s.found(num(tries[0].k))}</p>
            </>
          ) : <button type="button" className="lb-reply" onClick={() => setAuto(true)}>{s.auto}</button>}
          <p className="lb-note">{s.shortNote}</p>
        </div>
      )}
    </LabShell>
  );
}
