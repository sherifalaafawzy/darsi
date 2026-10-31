import { useEffect, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { SIZES, binaryGuesses, judge, linearSteps, middle, narrow, parseNumber, racePace, worstBinary, worstLinear, type Answer } from "./model";

const S = {
  en: {
    intro: "Searching is finding one thing among many. Here the computer hides a number, as if it were a name in a sorted list. Each guess, it says whether the number is higher or lower.",
    size: "Numbers from 1 to", play: "Your turn: find the hidden number", guess: "Guess", yourGuess: "Your guess", middle: (n: string) => `Try the middle: ${n}`,
    between: (lo: string, hi: string) => `It is between ${lo} and ${hi}.`, notNumber: (hi: string) => `Type a whole number from 1 to ${hi}.`,
    answer: { higher: (g: string) => `Higher than ${g}.`, lower: (g: string) => `Lower than ${g}.`, found: (g: string) => `It is ${g}!` } as Record<Answer, (g: string) => string>,
    foundIn: (guesses: string, best: string) => `Found in ${guesses}. Halving every time never needs more than ${best} here.`,
    guesses: { one: "1 guess", other: "{n} guesses" } as Forms, steps: { one: "1 step", other: "{n} steps" } as Forms,
    again: "New number", left: "Still possible", race: "The computer races itself", raceIntro: "Same hidden number, same speed: one check per step.",
    runRace: "Start the race", linear: "One by one (linear search)", binary: "Halving (binary search)", hidden: (n: string) => `The hidden number: ${n}`,
    checking: (g: string) => `Is it ${g}?`, done: (steps: string) => `Found in ${steps}.`,
    table: "The most steps each can need", list: "Numbers", million: "a million", oneByOne: "One by one", halving: "Halving",
    try1: "With 1 to 100, press only “Try the middle”. You never need more than 7 guesses.",
    try2: "Start the race with 1 to 1,000: halving finishes in about 10 steps while one by one is still counting.",
    try3: "Look at the table: going from 1,000 to a million numbers adds only 10 steps to halving.",
    takeaway: "Binary search throws away half of what is left at every step, so a list a thousand times bigger needs only about 10 more steps. It only works on a sorted list, which is why dictionaries and contact lists are in order.",
  },
  ar: {
    intro: "البحث هو إيجاد شيء واحد بين أشياء كثيرة. هنا يخفي الحاسوب رقمًا، كأنه اسم في قائمة مرتّبة. وبعد كل تخمين يقول لك إن كان الرقم أكبر أو أصغر.",
    size: "أرقام من ١ إلى", play: "دورك: اعثر على الرقم المخفيّ", guess: "خمّن", yourGuess: "تخمينك", middle: (n: string) => `جرّب المنتصف: ${n}`,
    between: (lo: string, hi: string) => `الرقم بين ${lo} و${hi}.`, notNumber: (hi: string) => `اكتب عددًا صحيحًا من ١ إلى ${hi}.`,
    answer: { higher: (g: string) => `أكبر من ${g}.`, lower: (g: string) => `أصغر من ${g}.`, found: (g: string) => `إنه ${g}!` } as Record<Answer, (g: string) => string>,
    foundIn: (guesses: string, best: string) => `وجدته في ${guesses}. والقسمة على اثنين كل مرة لا تحتاج هنا إلى أكثر من ${best}.`,
    guesses: { one: "محاولة واحدة", two: "محاولتين", few: "{n} محاولات", many: "{n} محاولة", other: "{n} محاولة" } as Forms,
    steps: { one: "خطوة واحدة", two: "خطوتين", few: "{n} خطوات", many: "{n} خطوة", other: "{n} خطوة" } as Forms,
    again: "رقم جديد", left: "ما زال ممكنًا", race: "الحاسوب يسابق نفسه", raceIntro: "الرقم المخفيّ نفسه والسرعة نفسها: فحص واحد في كل خطوة.",
    runRace: "ابدأ السباق", linear: "واحدًا واحدًا (البحث الخطي)", binary: "القسمة على اثنين (البحث الثنائي)", hidden: (n: string) => `الرقم المخفيّ: ${n}`,
    checking: (g: string) => `هل هو ${g}؟`, done: (steps: string) => `وجده في ${steps}.`,
    table: "أكبر عدد من الخطوات قد يحتاج إليه كلٌّ منهما", list: "الأرقام", million: "مليون", oneByOne: "واحدًا واحدًا", halving: "القسمة على اثنين",
    try1: "مع الأرقام من ١ إلى ١٠٠، اضغط «جرّب المنتصف» فقط. لن تحتاج أبدًا إلى أكثر من ٧ محاولات.",
    try2: "ابدأ السباق مع الأرقام من ١ إلى ١٠٠٠: تنتهي القسمة على اثنين في نحو ١٠ خطوات بينما ما زال الفحص واحدًا واحدًا يعدّ.",
    try3: "انظر إلى الجدول: الانتقال من ١٠٠٠ رقم إلى مليون رقم يضيف ١٠ خطوات فقط إلى القسمة على اثنين.",
    takeaway: "يرمي البحث الثنائي نصف ما بقي في كل خطوة، فقائمة أكبر ألف مرة لا تحتاج إلا إلى نحو ١٠ خطوات إضافية. لكنه لا يعمل إلا على قائمة مرتّبة، ولهذا تُرتَّب القواميس وقوائم الأسماء في الهاتف.",
  },
};

const pickSecret = (n: number) => 1 + Math.floor(Math.random() * n);

/** The numbers 1…n as a line, with what is still possible shaded and the guesses marked. Always left to right. */
function Strip({ n, lo, hi, marks, label }: { n: number; lo: number; hi: number; marks: number[]; label: string }) {
  const at = (v: number) => `${((v - 0.5) / n) * 100}%`;
  return (
    <div className="lb-srch-strip" dir="ltr" role="img" aria-label={label}>
      {lo <= hi && <span className="lb-srch-left" style={{ insetInlineStart: `${((lo - 1) / n) * 100}%`, inlineSize: `${((hi - lo + 1) / n) * 100}%` }} />}
      {marks.map((m, i) => <span key={i} className="lb-srch-mark" style={{ insetInlineStart: at(m) }} />)}
    </div>
  );
}

export default function Search({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [n, setN] = useState<number>(100);
  const [secret, setSecret] = useState(() => pickSecret(100));
  const [range, setRange] = useState<[number, number]>([1, 100]);
  const [tries, setTries] = useState<{ g: number; a: Answer }[]>([]);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const [wins, setWins] = useState(0);
  // The race: a hidden number, and how many steps have been taken (paced by time).
  const [race, setRace] = useState<{ secret: number; n: number; t0: number } | null>(null);
  const [k, setK] = useState(0);
  const found = tries.some((t) => t.a === "found");
  const [lo, hi] = range;

  const restart = (size = n) => { setN(size); setSecret(pickSecret(size)); setRange([1, size]); setTries([]); setText(""); setBad(false); };
  const guess = (g: number) => {
    if (found) return;
    if (g < 1 || g > n) { setBad(true); return; }
    const a = judge(secret, g);
    setBad(false); setText("");
    setTries((t) => [...t, { g, a }]);
    setRange(narrow(lo, hi, g, a));
    if (a === "found") setWins((w) => w + 1);
  };
  const submit = () => { const v = parseNumber(text); if (v === null) setBad(true); else guess(v); };
  useEffect(() => { if (wins >= 1 && race) onDone?.(); }, [wins >= 1 && !!race]); // eslint-disable-line react-hooks/exhaustive-deps

  // Race playback: both searches take a step at the same rate, ten redraws a second; it stops by itself.
  const lin = race ? linearSteps(race.secret) : 0;
  const bin = race ? binaryGuesses(race.n, race.secret) : [];
  const total = Math.max(lin, bin.length);
  const racing = !!race && k < total;
  useEffect(() => {
    if (!race) return;
    const end = Math.max(linearSteps(race.secret), binaryGuesses(race.n, race.secret).length);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setK(end); return; }
    const id = setInterval(() => {
      const v = document.hidden ? end : Math.min(end, Math.floor(((performance.now() - race.t0) / 1000) * racePace(race.secret)) + 1);
      setK(v);
      if (v >= end) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [race]);
  const linNow = Math.min(k, lin), binNow = Math.min(k, bin.length);
  let bRange: [number, number] = [1, race?.n ?? n];
  for (const g of bin.slice(0, binNow)) bRange = narrow(bRange[0], bRange[1], g, judge(race!.secret, g));

  const last = tries[tries.length - 1];
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { restart(100); setRace(null); setK(0); }}>
      <section className="lb-panel" aria-label={s.play}>
        <h3 className="lb-srch-h">{s.play}</h3>
        <Segmented label={s.size} value={n} onChange={(v) => restart(v)} options={SIZES.map((v) => [v, num(v)] as const)} />
        <Strip n={n} lo={lo} hi={hi} marks={tries.map((t) => t.g)} label={`${s.left}: ${s.between(num(lo), num(hi))}`} />
        <p className="lb-verdict" aria-live="polite">
          {last ? s.answer[last.a](num(last.g)) : null} {!found && s.between(num(lo), num(hi))}
        </p>
        {found
          ? <p className="lb-note">{s.foundIn(count(tries.length, s.guesses), count(worstBinary(n), s.steps))}</p>
          : n === 10
            ? <div className="lb-srch-keys" dir="ltr">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                  <button key={v} type="button" className="lb-srch-key" disabled={v < lo || v > hi} onClick={() => guess(v)}>{num(v)}</button>
                ))}
              </div>
            : <form className="lb-srch-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <label className="dr-field-label" htmlFor="lb-srch-in">{s.yourGuess}</label>
                <div className="lb-row">
                  <input id="lb-srch-in" className="dr-field-input lb-srch-in" inputMode="numeric" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setBad(false); }} />
                  <Button size="sm" type="submit">{s.guess}</Button>
                </div>
                {bad && <p className="lb-note" role="alert">{s.notNumber(num(n))}</p>}
              </form>}
        <div className="lb-runbar">
          {!found && <Button size="sm" variant="secondary" onClick={() => guess(middle(lo, hi))}>{s.middle(num(middle(lo, hi)))}</Button>}
          <Button size="sm" variant="ghost" icon="sync" onClick={() => restart()}>{s.again}</Button>
        </div>
        {!!tries.length && (
          <ol className="lb-srch-tries" aria-label={s.guess}>
            {tries.map((t, i) => <li key={i} className={t.a === "found" ? "is-found" : undefined}>{num(t.g)} {t.a === "higher" ? "↑" : t.a === "lower" ? "↓" : "✓"}</li>)}
          </ol>
        )}
      </section>

      <section className="lb-panel" aria-label={s.race}>
        <h3 className="lb-srch-h">{s.race}</h3>
        <p className="lb-note">{s.raceIntro}</p>
        <div className="lb-runbar">
          <Button size="sm" icon="play" disabled={racing} onClick={() => { setK(0); setRace({ secret: pickSecret(n), n, t0: performance.now() }); }}>{s.runRace}</Button>
          {race && <span className="lb-note">{s.hidden(num(race.secret))}</span>}
        </div>
        {race && (
          <div className="lb-srch-race">
            <div className="lb-srch-lane">
              <strong>{s.linear}</strong>
              <Strip n={race.n} lo={linNow + 1} hi={race.n} marks={linNow ? [linNow] : []} label={s.linear} />
              <span className="lb-note" aria-live="off">{linNow >= lin ? s.done(count(lin, s.steps)) : `${count(linNow, s.steps)}: ${s.checking(num(linNow + 1))}`}</span>
            </div>
            <div className="lb-srch-lane">
              <strong>{s.binary}</strong>
              <Strip n={race.n} lo={bRange[0]} hi={bRange[1]} marks={bin.slice(0, binNow)} label={s.binary} />
              <span className="lb-note" aria-live="off">{binNow >= bin.length ? s.done(count(bin.length, s.steps)) : `${count(binNow, s.steps)}: ${s.checking(num(bin[binNow]))}`}</span>
            </div>
          </div>
        )}
      </section>

      <table className="lb-table">
        <caption className="lb-srch-cap">{s.table}</caption>
        <thead><tr><th scope="col">{s.list}</th><th scope="col">{s.oneByOne}</th><th scope="col">{s.halving}</th></tr></thead>
        <tbody>
          {[10, 100, 1000, 1e6].map((v) => (
            <tr key={v}><td>{v === 1e6 ? s.million : num(v)}</td><td>{num(worstLinear(v))}</td><td>{num(worstBinary(v))}</td></tr>
          ))}
        </tbody>
      </table>
    </LabShell>
  );
}
