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
    p: "First secret prime (p)", q: "Second secret prime (q)", same: "Pick two different primes.",
    pub: "Public key: share it", priv: "Private key: keep it secret",
    msg: "Message to lock", letter: "Letter", number: "As a number", locked: "Locked", unlocked: "Unlocked", tooBig: "Some letters' numbers are bigger than n. Pick bigger primes.",
    sign: "Signing: prove a message is from you", signIntro: "Lock the message with your private key. Anyone can unlock it with your public key, and only your key could have made it.", tamper: "Change one letter after signing", off: "Off", on: "On",
    valid: "Signature checks out: this message is from the key's owner, unchanged.", invalid: "Signature doesn't match: the message was changed, or someone else signed it.",
    safe: (n: string, k: string) => `To find the private key, an attacker must split n = ${n} back into p × q. Your phone does it in ${k} divisions. Real keys have numbers 600 digits long: every computer on Earth together couldn't split one.`,
    takeaway: "Public keys let strangers talk safely: HTTPS, messaging apps and software updates all use them. Encryption (lock with the public key) keeps messages secret; signatures (lock with the private key) prove who sent them and that nothing changed.",
  },
  ar: {
    intro: "يعطيك التشفير بالمفتاح العام مفتاحين. العام يشبه قفلًا مفتوحًا: أعطه للجميع، فيستطيع أي أحد أن يقفل لك رسالة. والخاص هو المفتاح الوحيد الذي يفتحه. هذه مفاتيح RSA حقيقية، لكنها صغيرة جدًا.",
    p: "العدد الأولي السري الأول (p)", q: "العدد الأولي السري الثاني (q)", same: "اختر عددين أوليين مختلفين.",
    pub: "المفتاح العام: شاركه", priv: "المفتاح الخاص: احفظه سرًا",
    msg: "الرسالة المراد قفلها", letter: "الحرف", number: "في صورة رقم", locked: "مقفل", unlocked: "مفتوح", tooBig: "أرقام بعض الحروف أكبر من n. اختر أعدادًا أولية أكبر.",
    sign: "التوقيع: أثبت أن الرسالة منك", signIntro: "اقفل الرسالة بمفتاحك الخاص. يستطيع أي أحد فتحها بمفتاحك العام، ولا يستطيع صنعها إلا مفتاحك.", tamper: "غيّر حرفًا بعد التوقيع", off: "لا", on: "نعم",
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
  const ok = p !== q, k = useMemo(() => keys(p, q === p ? (PRIMES.find((x) => x !== p) ?? 43) : q), [p, q]);
  const ms = codes(msg), tooBig = ms.some((m) => m >= k.n);
  const sigs = ms.map((m) => sign(m, k));
  const received = tamper && ms.length ? [ms[0] + 1n, ...ms.slice(1)] : ms;
  const valid = received.every((m, i) => check(m, sigs[i], k));
  useEffect(() => { if (moves.has("msg") && moves.has("tamper")) onDone?.(); }, [moves.has("msg") && moves.has("tamper")]); // eslint-disable-line react-hooks/exhaustive-deps
  const big = (x: bigint) => num(Number(x));

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-two">
        <Segmented label={s.p} value={p} options={PRIMES.slice(0, 8).map((x) => [x, num(x)] as const)} onChange={setP} />
        <Segmented label={s.q} value={q} options={PRIMES.slice(0, 8).map((x) => [x, num(x)] as const)} onChange={setQ} />
      </div>
      {!ok && <p className="lb-verdict is-warn">{s.same}</p>}
      <Formula parts={["n", "=", num(p), "×", num(q), "=", big(k.n)]} />
      <Formula parts={["φ", "=", "(", num(p), "−", num(1), ")", "×", "(", num(q), "−", num(1), ")", "=", big(k.phi)]} />
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
      <p className={valid ? "lb-answer is-ok" : "lb-verdict is-warn"} aria-live="polite"><Icon name={valid ? "check" : "warning"} size={16} /> {valid ? s.valid : s.invalid}</p>
      <p className="lb-note">{s.safe(big(k.n), num(crackSteps(k.n)))}</p>
    </LabShell>
  );
}
