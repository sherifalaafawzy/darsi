import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { attack, LEAKED, lost, PRESETS, SITES, type Outcome, type Setup, type Site } from "./model";

const S = {
  en: {
    intro: "You have five accounts. A small hobby forum stored passwords carelessly and gets hacked: your email and forum password are now on a list attackers share. They try them everywhere. Set up your accounts, then let the forum fall.",
    site: { email: "Email", school: "School portal", shop: "Online shop", bank: "Mobile money", forum: "Hobby forum" } as Record<Site, string>,
    pw: "Password", same: "Same as the forum", unique: "Its own", twoStep: "Two-step sign-in", lazy: "Same password everywhere", careful: "Different passwords, two-step on the important ones",
    hack: "The forum gets hacked", again: "Change my setup",
    out: { "safe-unique": "Safe: the leaked password doesn't work here.", "safe-2fa": "Safe: the password worked, but two-step sign-in stopped them.", taken: "Taken over with the leaked password.", "taken-reset": "Taken over: from your email they clicked “forgot password”." } as Record<Outcome, string>,
    leaked: "This is where the leak came from.",
    none: "No accounts lost. Well protected!", summary: { one: "1 account lost.", other: "{n} accounts lost." } as Forms,
    try1: "Press The forum gets hacked: with the same password everywhere you lose 4 of your 5 accounts. Only Mobile money, with two-step sign-in, holds.",
    try2: "Press Different passwords, two-step on the important ones, then give Email the forum's password and untick its two-step sign-in. Hack again: losing your email loses the Online shop too, through “forgot password”.",
    takeaway: "Sites get hacked; you can't stop that. What you control is the damage: a different password for every site (a password manager makes it easy), two-step sign-in on your email and money, and your email best protected of all, because it can reset everything else.",
  },
  ar: {
    intro: "لديك خمسة حسابات. منتدى هوايات صغير خزّن كلمات المرور بإهمال فاختُرق: أصبح بريدك وكلمة مرورك في المنتدى على قائمة يتبادلها المهاجمون، وهم يجرّبونها في كل مكان. اضبط حساباتك، ثم دع المنتدى يسقط.",
    site: { email: "البريد الإلكتروني", school: "بوابة المدرسة", shop: "متجر إلكتروني", bank: "محفظة الهاتف", forum: "منتدى الهوايات" } as Record<Site, string>,
    pw: "كلمة المرور", same: "نفس كلمة المنتدى", unique: "كلمة خاصة به", twoStep: "التحقق بخطوتين", lazy: "كلمة مرور واحدة لكل شيء", careful: "كلمات مختلفة، وخطوتان للحسابات المهمة",
    hack: "يُخترق المنتدى", again: "غيّر إعداداتي",
    out: { "safe-unique": "آمن: كلمة المرور المسرّبة لا تعمل هنا.", "safe-2fa": "آمن: نجحت كلمة المرور، لكن التحقق بخطوتين أوقفهم.", taken: "استُولي عليه بكلمة المرور المسرّبة.", "taken-reset": "استُولي عليه: من بريدك ضغطوا «نسيت كلمة المرور»." } as Record<Outcome, string>,
    leaked: "من هنا جاء التسريب.",
    none: "لم تفقد أي حساب. حماية ممتازة!", summary: { one: "فقدت حسابًا واحدًا.", two: "فقدت حسابين.", few: "فقدت {n} حسابات.", other: "فقدت {n} حسابًا." } as Forms,
    try1: "اضغط «يُخترق المنتدى»: مع كلمة مرور واحدة لكل شيء تفقد ٤ من حساباتك الخمسة. ولا تصمد إلا «محفظة الهاتف»، لأن فيها التحقق بخطوتين.",
    try2: "اضغط «كلمات مختلفة، وخطوتان للحسابات المهمة»، ثم أعطِ البريد الإلكتروني كلمة مرور المنتدى وألغِ التحقق بخطوتين فيه. اخترق المنتدى من جديد: بخسارة بريدك تخسر «المتجر الإلكتروني» أيضًا، عبر «نسيت كلمة المرور».",
    takeaway: "المواقع تُخترق، ولا تستطيع منع ذلك. ما تتحكّم فيه هو حجم الضرر: كلمة مرور مختلفة لكل موقع (يسهّل ذلك مدير كلمات المرور)، والتحقق بخطوتين لبريدك وأموالك، وأقوى حماية لبريدك قبل كل شيء، لأنه يستطيع إعادة تعيين كل ما سواه.",
  },
};

export default function Breach({ meta, onDone }: LabProps) {
  const s = useS(S);
  const count = usePlural();
  const [setup, setSetup] = useState<Setup>(PRESETS.lazy);
  const [hacked, setHacked] = useState(false);
  const [results, setResults] = useState(() => new Set<number>());
  const res = attack(setup), n = lost(res);
  useEffect(() => { if (hacked) setResults((r) => new Set(r).add(n)); }, [hacked, n]);
  useEffect(() => { if (results.size >= 2) onDone?.(); }, [results.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (site: Site, change: Partial<Setup[Site]>) => { setSetup((x) => ({ ...x, [site]: { ...x[site], ...change } })); setHacked(false); };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
      <div className="lb-row">
        <Button size="sm" variant="ghost" onClick={() => { setSetup(PRESETS.lazy); setHacked(false); }}>{s.lazy}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setSetup(PRESETS.careful); setHacked(false); }}>{s.careful}</Button>
      </div>
      <ul className="lb-accounts">
        {SITES.map((site) => {
          const o = res[site], bad = o === "taken" || o === "taken-reset";
          return (
            <li key={site} className={hacked ? (bad ? "lb-account is-lost" : "lb-account is-safe") : "lb-account"}>
              <strong>{s.site[site]}</strong>
              {site !== LEAKED && (
                <div className="lb-seg" role="radiogroup" aria-label={`${s.site[site]}: ${s.pw}`}>
                  <span className="lb-seg-label">{s.pw}</span>
                  {([true, false] as const).map((v) => <button key={String(v)} type="button" role="radio" aria-checked={setup[site].same === v} className={setup[site].same === v ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => set(site, { same: v })}>{v ? s.same : s.unique}</button>)}
                </div>
              )}
              <label className="lb-check"><input type="checkbox" checked={setup[site].twoStep} onChange={(e) => set(site, { twoStep: e.target.checked })} /> {s.twoStep}</label>
              {hacked && <p className="lb-account-out"><Icon name={bad ? "warning" : "check"} size={16} /> {s.out[o]}{site === LEAKED ? ` ${s.leaked}` : ""}</p>}
            </li>
          );
        })}
      </ul>
      <div className="lb-row"><Button size="sm" icon={hacked ? "sync" : "warning"} onClick={() => setHacked(!hacked)}>{hacked ? s.again : s.hack}</Button></div>
      {hacked && <p className={n ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{n ? count(n, s.summary) : s.none}</p>}
    </LabShell>
  );
}
