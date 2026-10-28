import { useEffect, useMemo, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { Segmented } from "../../kit/controls";
import { Formula } from "../../kit/Formula";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { check, codes, crackSteps, keys, lock, PRIMES, sign, unlock } from "./model";

const S = {
  en: {
    intro: "Public-key encryption gives you two keys. The public one is like an open padlock: give it to everyone, and anyone can lock a message for you. The private one is the only key that opens it. These are real RSA keys, just tiny.",
    p: "First secret prime (p)", q: "Second secret prime (q)", same: (q: string) => `Pick two different primes. Until you do, the lab uses ${q} as q.`,
    pub: "Public key: share it", priv: "Private key: keep it secret",
    msg: "Message to lock", letter: "Letter", number: "As a number", locked: "Locked", unlocked: "Unlocked", tooBig: "Some letters' numbers are bigger than n. Pick bigger primes.",
    sign: "Signing: prove a message is from you", signIntro: "Lock the message with your private key. Anyone can unlock it with your public key, and only your key could have made it.", tamper: "Change one letter after signing", off: "Off", on: "On",
    sigL: "Your signature: one number per letter, made with d", arrives: "The message that arrives:", checkL: "The receiver checks it with your public key: unlocking each signature with e must give its letter's number. The first letter:",
    try1: "Type your own name in Message to lock: each letter becomes a number, the public key (n, e) locks it into another number, and only d brings it back.",
    try2: "Set Change one letter after signing to On: the check still gives the old letter's number, not the new one, so the change is caught.",
    try3: "Pick bigger primes, 71 and 67: n grows, and splitting it takes more divisions. Real keys use primes hundreds of digits long.",
    valid: "Signature checks out: this message is from the key's owner, unchanged.", invalid: "Signature doesn't match: the message was changed, or someone else signed it.",
    safe: (n: string, k: string) => `To find the private key, an attacker must split n = ${n} back into p × q. Your phone does it in ${k} divisions. Real keys have numbers 600 digits long: every computer on Earth together couldn't split one.`,
    takeaway: "Public keys let strangers talk safely: HTTPS, messaging apps and software updates all use them. Encryption (lock with the public key) keeps messages secret; signatures (lock with the private key) prove who sent them and that nothing changed.",
  },
  ar: {
    intro: "يعطيك التشفير بالمفتاح العام مفتاحين. العام يشبه قفلًا مفتوحًا: أعطه للجميع، فيستطيع أي أحد أن يقفل لك رسالة. والخاص هو المفتاح الوحيد الذي يفتحه. هذه مفاتيح RSA حقيقية، لكنها صغيرة جدًا.",
    p: "العدد الأولي السري الأول (p)", q: "العدد الأولي السري الثاني (q)", same: (q: string) => `اختر عددين أوليين مختلفين. وإلى أن تفعل، يستعمل المختبر ${q} مكان q.`,
    pub: "المفتاح العام: شاركه", priv: "المفتاح الخاص: احفظه سرًا",
    msg: "الرسالة المراد قفلها", letter: "الحرف", number: "في صورة رقم", locked: "مقفل", unlocked: "مفتوح", tooBig: "أرقام بعض الحروف أكبر من n. اختر أعدادًا أولية أكبر.",
    sign: "التوقيع: أثبت أن الرسالة منك", signIntro: "اقفل الرسالة بمفتاحك الخاص. يستطيع أي أحد فتحها بمفتاحك العام، ولا يستطيع صنعها إلا مفتاحك.", tamper: "غيّر حرفًا بعد التوقيع", off: "لا", on: "نعم",
    sigL: "توقيعك: رقم لكل حرف، مصنوع بالمفتاح d", arrives: "الرسالة التي تصل:", checkL: "يتحقّق المستلم منها بمفتاحك العام: فتحُ كل توقيع بالمفتاح e يجب أن يعطي رقم حرفه. الحرف الأول:",
    try1: "اكتب اسمك في «الرسالة المراد قفلها»: يصبح كل حرف رقمًا، ويقفله المفتاح العام (n، e) في رقم آخر، ولا يعيده إلا d.",
    try2: "اجعل «غيّر حرفًا بعد التوقيع» على «نعم»: ما زال التحقّق يعطي رقم الحرف القديم لا الجديد، فيُكشف التغيير.",
    try3: "اختر عددين أوليين أكبر، ٧١ و٦٧: يكبر n، ويحتاج تفكيكه إلى عمليات قسمة أكثر. والمفاتيح الحقيقية تستعمل أعدادًا أولية بطول مئات الخانات.",
    valid: "التوقيع سليم: هذه الرسالة من صاحب المفتاح ولم تتغيّر.", invalid: "التوقيع غير مطابق: تغيّرت الرسالة، أو وقّعها شخص آخر.",
    safe: (n: string, k: string) => `ليجد المهاجم المفتاح الخاص عليه أن يفكّك n = ${n} إلى p × q. يفعل هاتفك ذلك في ${k} عملية قسمة. أما المفاتيح الحقيقية فأرقامها بطول ٦٠٠ خانة: كل حواسيب الأرض معًا لا تستطيع تفكيك واحد منها.`,
    takeaway: "تتيح المفاتيح العامة للغرباء التواصل بأمان: يستعملها HTTPS وتطبيقات المراسلة وتحديثات البرامج. التشفير (القفل بالمفتاح العام) يحفظ سرية الرسائل، والتوقيع (القفل بالمفتاح الخاص) يثبت من أرسلها وأن شيئًا لم يتغيّر.",
  },
};

export default function PublicKey({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const [p, setP] = useState(61);
  const [q, setQ] = useState(53);
  const [msg, setMsg] = useState(lang === "ar" ? "مرحبا" : "Hello");
  const [tamper, setTamper] = useState(false);
  const [moves, setMoves] = useState(new Set<string>());
  const mark = (x: string) => setMoves((m) => new Set(m).add(x));
  // Equal primes don't make a key: until the learner picks another, use the next one (and show it in the maths).
  const ok = p !== q, qq = ok ? q : (PRIMES.find((x) => x !== p) ?? 43), k = useMemo(() => keys(p, qq), [p, qq]);
  const ms = codes(msg), tooBig = ms.some((m) => m >= k.n);
  const sigs = ms.map((m) => sign(m, k));
  const received = tamper && ms.length ? [ms[0] + 1n, ...ms.slice(1)] : ms;
  const valid = received.every((m, i) => check(m, sigs[i], k));
  const text = (xs: bigint[]) => xs.map((x) => String.fromCodePoint(Number(x))).join("");
  useEffect(() => { if (moves.has("msg") && moves.has("tamper")) onDone?.(); }, [moves.has("msg") && moves.has("tamper")]); // eslint-disable-line react-hooks/exhaustive-deps
  const big = (x: bigint) => num(Number(x));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <Segmented label={s.p} value={p} options={PRIMES.slice(0, 8).map((x) => [x, num(x)] as const)} onChange={setP} />
        <Segmented label={s.q} value={q} options={PRIMES.slice(0, 8).map((x) => [x, num(x)] as const)} onChange={setQ} />
      </div>
      {!ok && <p className="lb-verdict is-warn">{s.same(num(qq))}</p>}
      <Formula parts={["n", "=", num(p), "×", num(qq), "=", big(k.n)]} />
      <Formula parts={["φ", "=", "(", num(p), "−", num(1), ")", "×", "(", num(qq), "−", num(1), ")", "=", big(k.phi)]} />
      <Formula parts={["d", "×", big(k.e), "mod", big(k.phi), "=", num(1), "⇒", "d", "=", big(k.d)]} />
      <div className="lb-two">
        <div className="lb-keycard is-public"><Icon name="lock" size={20} /><strong>{s.pub}</strong><Formula parts={["n", "=", big(k.n), ",", "e", "=", big(k.e)]} /></div>
        <div className="lb-keycard is-private"><Icon name="lock" size={20} /><strong>{s.priv}</strong><Formula parts={["d", "=", big(k.d)]} /></div>
      </div>
      <label className="dr-field-label" htmlFor="lb-rsa-msg">{s.msg}</label>
      <input id="lb-rsa-msg" className="dr-field-input" dir="auto" maxLength={12} value={msg} onChange={(e) => { setMsg(e.target.value); mark("msg"); }} />
      {tooBig && <p className="lb-verdict is-warn">{s.tooBig}</p>}
      <div className="lb-scroll">
        <table className="lb-table">
          <thead><tr><th>{s.letter}</th><th>{s.number}</th><th>{s.locked}</th><th>{s.unlocked}</th></tr></thead>
          <tbody>{ms.map((m, i) => { const c = lock(m, k), back = unlock(c, k); return <tr key={i}><td>{[...msg][i]}</td><td>{big(m)}</td><td className="lb-mono">{big(c)}</td><td>{back === m ? String.fromCodePoint(Number(back)) : "?"}</td></tr>; })}</tbody>
        </table>
      </div>
      <h3 className="lb-h">{s.sign}</h3>
      <p className="lb-note">{s.signIntro}</p>
      <Segmented label={s.tamper} value={tamper ? 1 : 0} options={[[0, s.off], [1, s.on]]} onChange={(v) => { setTamper(v === 1); mark("tamper"); }} />
      {ms.length > 0 && <>
        <span className="lb-note">{s.sigL}</span>
        <Formula parts={sigs.map((x) => num(Number(x), { useGrouping: false }))} />
        <p className="lb-note">{s.arrives} <strong><bdi>{text(received)}</bdi></strong></p>
        <span className="lb-note">{s.checkL}</span>
        <Formula parts={[big(sigs[0]), "^", big(k.e), "mod", big(k.n), "=", big(lock(sigs[0], k)), lock(sigs[0], k) === received[0] % k.n ? "=" : "≠", big(received[0])]} />
      </>}
      <p className={valid ? "lb-answer is-ok" : "lb-verdict is-warn"} aria-live="polite"><Icon name={valid ? "check" : "warning"} size={16} /> {valid ? s.valid : s.invalid}</p>
      <p className="lb-note">{s.safe(big(k.n), num(crackSteps(k.n)))}</p>
    </LabShell>
  );
}
