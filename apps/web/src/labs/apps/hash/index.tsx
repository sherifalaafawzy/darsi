import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { bitsDiffer, salt, salted, sha256 } from "./model";

const S = {
  en: {
    intro: "A hash turns any data into a fixed-size fingerprint. These are real SHA-256 fingerprints, made on your phone. Change one letter and see what happens.",
    a: "Text A", b: "Text B", fpA: "Fingerprint of A", fpB: "Fingerprint of B", differ: (n: string, p: string) => `${n} of the 256 bits differ (${p}). Highlighted: characters that changed.`, same: "Identical fingerprints: the texts are exactly the same.",
    store: "How a website stores passwords", storeIntro: "A good site never keeps your password: only its fingerprint. Two pupils happen to choose the same password:", pw: "Their password", salt: "Salt", noSalt: "No salt", withSalt: "Random salt per user", newSalts: "New salts",
    sameWarn: "Same fingerprint! Anyone who cracks one has cracked both, and attackers keep huge tables of common passwords' fingerprints.", diffOk: "Different fingerprints, even though the passwords match: a salt makes every stored fingerprint unique.",
    names: ["Amal", "Omar"], login: "Signing in", loginIntro: "Amal types her password. The site makes the fingerprint again and compares:", typed: "Typed password", match: "Fingerprints match: signed in.", nomatch: "No match: wrong password.",
    try1: "Make Text B exactly “Darsi”, like Text A: the fingerprints match. Then add a full stop to B: about half of the 256 bits change, though the text barely did.",
    try2: "Switch the salt to Random salt per user: Amal's and Omar's fingerprints stop matching, though their passwords are still the same.",
    try3: "Under Signing in, type “sun123”: the site makes the fingerprint again and it matches, so Amal is in. The site never had to keep her password.",
    takeaway: "Hashes check that files and messages haven't changed, and let websites check passwords without storing them. A hash can't be reversed, but a weak password can still be guessed: the attacker just hashes guesses until one matches.",
  },
  ar: {
    intro: "يحوّل التجزيء (الهاش) أي بيانات إلى بصمة ثابتة الطول. هذه بصمات SHA-256 حقيقية تُصنع على هاتفك. غيّر حرفًا واحدًا وانظر ماذا يحدث.",
    a: "النص أ", b: "النص ب", fpA: "بصمة أ", fpB: "بصمة ب", differ: (n: string, p: string) => `${n} من البتات الـ٢٥٦ مختلفة (${p}). المظلّل: الرموز التي تغيّرت.`, same: "بصمتان متطابقتان: النصّان متطابقان تمامًا.",
    store: "كيف يخزّن الموقع كلمات المرور", storeIntro: "الموقع الجيد لا يحتفظ بكلمة مرورك أبدًا، بل ببصمتها فقط. واتفق أن تلميذين اختارا كلمة المرور نفسها:", pw: "كلمة مرورهما", salt: "الملح", noSalt: "بلا ملح", withSalt: "ملح عشوائي لكل مستخدم", newSalts: "ملح جديد",
    sameWarn: "البصمة نفسها! من يكسر إحداهما يكسر الأخرى، والمهاجمون يحتفظون بجداول ضخمة لبصمات كلمات المرور الشائعة.", diffOk: "بصمتان مختلفتان مع أن كلمتي المرور متطابقتان: الملح يجعل كل بصمة مخزّنة فريدة.",
    names: ["أمل", "عمر"], login: "تسجيل الدخول", loginIntro: "تكتب أمل كلمة مرورها، فيصنع الموقع البصمة من جديد ويقارن:", typed: "كلمة المرور المكتوبة", match: "البصمتان متطابقتان: تم الدخول.", nomatch: "لا تطابق: كلمة المرور خاطئة.",
    try1: "اجعل النص ب «Darsi» تمامًا مثل النص أ: تتطابق البصمتان. ثم أضف نقطة في آخر النص ب: يتغيّر نحو نصف البتات الـ٢٥٦، مع أن النص لم يكد يتغيّر.",
    try2: "اختر «ملح عشوائي لكل مستخدم»: لا تعود بصمتا أمل وعمر متطابقتين، مع أن كلمتي مرورهما ما زالتا متطابقتين.",
    try3: "في «تسجيل الدخول» اكتب «sun123»: يصنع الموقع البصمة من جديد فتتطابق، وتدخل أمل. ولم يحتج الموقع قط إلى الاحتفاظ بكلمة مرورها.",
    takeaway: "تتحقّق البصمات من أن الملفات والرسائل لم تتغيّر، وتتيح للمواقع فحص كلمات المرور دون تخزينها. لا يمكن عكس البصمة، لكن كلمة المرور الضعيفة تبقى قابلة للتخمين: يكفي المهاجمَ أن يحسب بصمات تخميناته حتى تتطابق إحداها.",
  },
};

function Fp({ hex, other }: { hex: string; other?: string }) {
  return <code className="lb-hash" dir="ltr">{[...hex].map((c, i) => <span key={i} className={other && other[i] !== c ? "is-diff" : undefined}>{c}</span>)}</code>;
}

export default function Hash({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [a, setA] = useState("Darsi");
  const [b, setB] = useState("darsi");
  const [ha, setHa] = useState(""), [hb, setHb] = useState("");
  const [pw, setPw] = useState("sun123");
  const [useSalt, setUseSalt] = useState(false);
  const [salts, setSalts] = useState(() => [salt(), salt()]);
  const [stored, setStored] = useState<string[]>(["", ""]);
  const [typed, setTyped] = useState("sun12");
  const [check, setCheck] = useState<boolean | null>(null);
  const [moves, setMoves] = useState(new Set<string>());
  const mark = (k: string) => setMoves((m) => new Set(m).add(k));
  useEffect(() => { let live = true; Promise.all([sha256(a), sha256(b)]).then(([x, y]) => { if (live) { setHa(x); setHb(y); } }); return () => { live = false; }; }, [a, b]);
  useEffect(() => { let live = true; Promise.all(salts.map((sl) => (useSalt ? salted(pw, sl) : sha256(pw)))).then((h) => live && setStored(h)); return () => { live = false; }; }, [pw, useSalt, salts]);
  useEffect(() => { let live = true; (useSalt ? salted(typed, salts[0]) : sha256(typed)).then((h) => live && setCheck(h === stored[0])); return () => { live = false; }; }, [typed, stored, useSalt, salts]);
  useEffect(() => { if (moves.size >= 3) onDone?.(); }, [moves.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = ha && hb ? bitsDiffer(ha, hb) : 0;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor="lb-hash-a">{s.a}</label>
          <input id="lb-hash-a" className="dr-field-input" dir="auto" value={a} onChange={(e) => { setA(e.target.value); mark("a"); }} />
          <span className="lb-note">{s.fpA}</span><Fp hex={ha} />
        </div>
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor="lb-hash-b">{s.b}</label>
          <input id="lb-hash-b" className="dr-field-input" dir="auto" value={b} onChange={(e) => { setB(e.target.value); mark("a"); }} />
          <span className="lb-note">{s.fpB}</span><Fp hex={hb} other={ha} />
        </div>
      </div>
      <p className="lb-verdict" aria-live="polite">{d ? s.differ(num(d), num(d / 256, { style: "percent" })) : s.same}</p>

      <h3 className="lb-h">{s.store}</h3>
      <p className="lb-note">{s.storeIntro}</p>
      <div className="lb-two">
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor="lb-hash-pw">{s.pw}</label>
          <input id="lb-hash-pw" className="dr-field-input" dir="auto" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Segmented label={s.salt} value={useSalt ? 1 : 0} options={[[0, s.noSalt], [1, s.withSalt]]} onChange={(v) => { setUseSalt(v === 1); mark("salt"); }} />
          {useSalt && <div className="lb-row"><Button size="sm" variant="ghost" icon="sync" onClick={() => setSalts([salt(), salt()])}>{s.newSalts}</Button></div>}
        </div>
        <table className="lb-table">
          <tbody>
            {s.names.map((name, i) => <tr key={name}><th>{name}</th><td>{useSalt && <span className="lb-note" dir="ltr">{s.salt}: {salts[i]}</span>}<Fp hex={stored[i]} other={i ? stored[0] : undefined} /></td></tr>)}
          </tbody>
        </table>
      </div>
      <p className={stored[0] === stored[1] ? "lb-verdict is-warn" : "lb-answer is-ok"}>{stored[0] === stored[1] ? s.sameWarn : s.diffOk}</p>

      <h3 className="lb-h">{s.login}</h3>
      <p className="lb-note">{s.loginIntro}</p>
      <label className="dr-field-label" htmlFor="lb-hash-typed">{s.typed}</label>
      <input id="lb-hash-typed" className="dr-field-input" dir="auto" value={typed} onChange={(e) => { setTyped(e.target.value); mark("login"); }} />
      <p className="lb-verdict" aria-live="polite"><Icon name={check ? "check" : "close"} size={18} /> {check ? s.match : s.nomatch}</p>
    </LabShell>
  );
}
