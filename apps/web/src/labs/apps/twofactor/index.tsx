import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { base32, counter, newSecret, STEP, totp, verify } from "./model";

const S = {
  en: {
    intro: "With two-step sign-in, your password isn't enough: the site also asks for a code from your phone. The phone and the site share a secret and both turn the current time into the same six digits, every 30 seconds. These codes are real.",
    phone: "Your phone: authenticator app", account: "School portal", left: (n: string) => `New code in ${n} s`,
    site: "School portal: sign in", pw: "Password", next: "Next", code: "Code from your phone", check: "Sign in",
    ok: "Signed in. The code matched, so this must be you, with your phone.", bad: "Wrong or old code. Look at the phone and try the current one.",
    thief: "A thief has your password", thiefGo: "Let the thief try", thiefTry: (c: string) => `The thief signs in with your password, then guesses the code ${c}…`, thiefNo: "Blocked. Without your phone the thief has a one-in-a-million guess, and the site locks after a few tries.", thiefLucky: "A one-in-a-million lucky guess! This is why sites lock after a few wrong codes.",
    how: "How the code is made", secret: "Shared secret (set up once, by scanning a QR code)", stepL: "Time step (seconds since 1970 ÷ 30)", made: "HMAC-SHA1(secret, time step), cut down to 6 digits",
    never: "Never tell anyone a code, not even “the school” or “the bank” on the phone. A real service never asks for it.",
    try1: "Press Next, type the six digits from the phone and press Sign in: the site makes the same code from the shared secret and the time, so they match.",
    try2: "Press Let the thief try a few times: the thief has your password, but not the code on your phone, so the door stays shut.",
    try3: "Open How the code is made and wait for the bar to run out: the time step goes up by one, and a completely new code appears.",
    takeaway: "Two-step sign-in stops most account takeovers: a stolen or guessed password alone isn't enough. Use an authenticator app where you can, and never share a code; scammers who ask for “the code we just sent” are trying to get past this lock.",
  },
  ar: {
    intro: "مع التحقق بخطوتين لا تكفي كلمة المرور: يطلب الموقع أيضًا رمزًا من هاتفك. يتشارك الهاتف والموقع سرًا، ويحوّل كل منهما الوقت الحالي إلى الأرقام الستة نفسها كل ٣٠ ثانية. وهذه الرموز حقيقية.",
    phone: "هاتفك: تطبيق المصادقة", account: "بوابة المدرسة", left: (n: string) => `رمز جديد بعد ${n} ث`,
    site: "بوابة المدرسة: تسجيل الدخول", pw: "كلمة المرور", next: "التالي", code: "الرمز من هاتفك", check: "ادخل",
    ok: "تم الدخول. الرمز مطابق، إذن هذا أنت ومعك هاتفك.", bad: "رمز خاطئ أو قديم. انظر إلى الهاتف وجرّب الرمز الحالي.",
    thief: "لص يعرف كلمة مرورك", thiefGo: "دع اللص يحاول", thiefTry: (c: string) => `يدخل اللص بكلمة مرورك، ثم يخمّن الرمز ${c}…`, thiefNo: "مُنع. دون هاتفك فرصة اللص واحد في المليون، ويُقفل الموقع بعد محاولات قليلة.", thiefLucky: "تخمين محظوظ فرصته واحد في المليون! لهذا تُقفل المواقع بعد رموز خاطئة قليلة.",
    how: "كيف يُصنع الرمز", secret: "السر المشترك (يُضبط مرة واحدة بمسح رمز QR)", stepL: "خطوة الوقت (الثواني منذ ١٩٧٠ ÷ ٣٠)", made: "HMAC-SHA1(السر، خطوة الوقت) مختصرًا إلى ٦ أرقام",
    never: "لا تخبر أحدًا بالرمز أبدًا، ولا حتى «المدرسة» أو «البنك» على الهاتف. فالخدمة الحقيقية لا تطلبه أبدًا.",
    try1: "اضغط «التالي»، واكتب الأرقام الستة الظاهرة على الهاتف، ثم اضغط «ادخل»: يصنع الموقع الرمز نفسه من السر المشترك والوقت، فيتطابقان.",
    try2: "اضغط «دع اللص يحاول» عدة مرات: اللص يعرف كلمة مرورك، لكنه لا يملك الرمز الذي على هاتفك، فيبقى الباب مغلقًا.",
    try3: "افتح «كيف يُصنع الرمز» وانتظر حتى ينتهي الشريط: تزيد خطوة الوقت واحدًا، ويظهر رمز جديد تمامًا.",
    takeaway: "يوقف التحقق بخطوتين معظم محاولات الاستيلاء على الحسابات: كلمة المرور المسروقة أو المخمَّنة وحدها لا تكفي. استعمل تطبيق مصادقة حيثما استطعت، ولا تشارك رمزًا أبدًا؛ فالمحتالون الذين يطلبون «الرمز الذي أرسلناه للتو» يحاولون تجاوز هذا القفل.",
  },
};
const westernDigits = (x: string) => x.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
const now = () => Date.now() / 1000;

export default function TwoFactor({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const secret = useMemo(newSecret, []);
  const [t, setT] = useState(now);
  const [code, setCode] = useState("------");
  const [stage, setStage] = useState<"pw" | "code">("pw");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<"ok" | "bad" | null>(null);
  const [thief, setThief] = useState<string | null>(null);
  // Ticks once a second while the lab is open and visible; stops when hidden or closed.
  useEffect(() => {
    let id = 0;
    const start = () => { stop(); setT(now()); id = window.setInterval(() => setT(now()), 1000); };
    const stop = () => window.clearInterval(id);
    const vis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", vis);
    return () => { stop(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  const step = counter(t);
  useEffect(() => { let live = true; totp(secret, step * STEP).then((c) => live && setCode(c)); return () => { live = false; }; }, [secret, step]);
  useEffect(() => { if (result === "ok" && thief) onDone?.(); }, [result === "ok" && !!thief]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.ceil(STEP - (t % STEP));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="lb-phone" aria-live="off">
          <span className="lb-phone-head"><Icon name="lock" size={16} /> {s.phone}</span>
          <span className="lb-note">{s.account}</span>
          <strong className="lb-otp" dir="ltr">{code.slice(0, 3)} {code.slice(3)}</strong>
          <span className="lb-otp-bar"><span style={{ inlineSize: `${(left / STEP) * 100}%` }} /></span>
          <span className="lb-note">{s.left(num(left))}</span>
        </div>
        <form className="lb-portal" onSubmit={async (e) => { e.preventDefault(); if (stage === "pw") { setStage("code"); return; } setResult((await verify(secret, westernDigits(typed), now())) ? "ok" : "bad"); }}>
          <strong>{s.site}</strong>
          <label className="dr-field-label" htmlFor="lb-2fa-pw">{s.pw}</label>
          <input id="lb-2fa-pw" className="dr-field-input" type="password" value="sunshine2024" readOnly />
          {stage === "code" && <>
            <label className="dr-field-label" htmlFor="lb-2fa-code">{s.code}</label>
            <input id="lb-2fa-code" className="dr-field-input lb-otp-in" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} value={typed} onChange={(e) => { setTyped(e.target.value); setResult(null); }} />
          </>}
          <Button size="sm" type="submit">{stage === "pw" ? s.next : s.check}</Button>
          {result && <p className={result === "ok" ? "lb-answer is-ok" : "lb-verdict is-warn"} aria-live="polite">{result === "ok" ? s.ok : s.bad}</p>}
        </form>
      </div>
      <h3 className="lb-h">{s.thief}</h3>
      <div className="lb-row"><Button size="sm" variant="secondary" onClick={() => { const g = new Uint32Array(1); crypto.getRandomValues(g); setThief(String(g[0] % 1e6).padStart(6, "0")); }}>{s.thiefGo}</Button></div>
      {thief && <><p className="lb-note">{s.thiefTry(thief)}</p><p className="lb-verdict">{thief === code ? s.thiefLucky : s.thiefNo}</p></>}
      <details className="lb-doc">
        <summary>{s.how}</summary>
        <dl className="lb-stats lb-how">
          <div><dt>{s.secret}</dt><dd className="lb-mono">{base32(secret)}</dd></div>
          <div><dt>{s.stepL}</dt><dd className="lb-mono">{num(step, { useGrouping: false })}</dd></div>
          <div><dt>{s.made}</dt><dd className="lb-mono">{code}</dd></div>
        </dl>
      </details>
      <p className="lb-flags-one">{s.never}</p>
    </LabShell>
  );
}
