import { useEffect, useMemo, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { basePkg, bitsDiffer, keyFingerprint, makeSigner, pkgBytes, REAL_FILES, sha256, sign, verify, type Signer } from "./model";

type Scenario = "genuine" | "tampered" | "impostor";
const SCN: Scenario[] = ["genuine", "tampered", "impostor"];

const S = {
  en: {
    intro: "You downloaded a model. Did the real author make it, and did it arrive unchanged? Two real checks answer that: a SHA-256 fingerprint catches any changed byte, and a signature — made with keys generated on this phone — proves who published it.",
    publisher: "You trust the publisher's key", scenario: "The file you received",
    scn: { genuine: "Genuine", tampered: "A byte was changed", impostor: "From an impostor" } as Record<Scenario, string>,
    pkg: "The model package", fp: "Its fingerprint now", published: "The publisher's published fingerprint",
    signedBy: "Signature made with key", checkHash: "Fingerprint matches the published one", checkSig: "Signature is from the publisher's key",
    trusted: "Trusted: same bytes, and really from the publisher.", badHash: "The file was changed — its fingerprint no longer matches.", badSig: "Signed by a key you don't trust — not the real publisher.",
    bits: (n: string) => `${n} of 256 bits differ from the published fingerprint.`,
    real: "A real model's files (Darsi Tiny)", cName: "File", cSize: "Size", cFp: "Fingerprint", kb: (n: string) => `${n} KB`, mb: (n: string) => `${n} MB`,
    try1: "Leave it on “Genuine”: the fingerprint matches and the signature checks out, so both lights are green — trusted.",
    try2: "Switch to “A byte was changed”: about half of the fingerprint's 256 bits flip, so almost every character of it changes; the match fails, and so does the signature. One changed byte is enough to catch.",
    try3: "Switch to “From an impostor”: the bytes are fine, but the signature was made with a different key, so the publisher check fails. The fingerprint alone wouldn't have caught this.",
    takeaway: "Downloading a model is trusting whoever made it. A fingerprint proves the bytes didn't change on the way; a signature proves who made them. Check both before you run a model — the same habit protects every file you install.",
  },
  ar: {
    intro: "نزّلت نموذجًا. أصنعه مؤلّفه الحقيقي؟ وأوصل دون تغيير؟ فحصان حقيقيان يجيبان: بصمة SHA-256 تكشف أي بايت تغيّر، وتوقيعٌ — بمفاتيح صُنعت على هذا الهاتف — يثبت من نشره.",
    publisher: "أنت تثق بمفتاح الناشر", scenario: "الملف الذي تلقّيته",
    scn: { genuine: "أصليّ", tampered: "تغيّر بايت", impostor: "من منتحِل" } as Record<Scenario, string>,
    pkg: "حزمة النموذج", fp: "بصمتها الآن", published: "البصمة التي نشرها الناشر",
    signedBy: "وُقِّع بمفتاح", checkHash: "البصمة تطابق المنشورة", checkSig: "التوقيع من مفتاح الناشر",
    trusted: "موثوق: البايتات نفسها، ومن الناشر فعلًا.", badHash: "تغيّر الملف — لم تعد بصمته تطابق.", badSig: "وُقِّع بمفتاح لا تثق به — ليس الناشر الحقيقي.",
    bits: (n: string) => `${n} من ٢٥٦ بتًا تختلف عن البصمة المنشورة.`,
    real: "ملفات نموذج حقيقي («درسي الصغير»)", cName: "الملف", cSize: "الحجم", cFp: "البصمة", kb: (n: string) => `${n} كيلوبايت`, mb: (n: string) => `${n} ميغابايت`,
    try1: "اتركه على «أصليّ»: البصمة تطابق والتوقيع صحيح، فالضوءان أخضران — موثوق.",
    try2: "اختر «تغيّر بايت»: ينقلب نحو نصف بتات البصمة الـ٢٥٦، فيتغيّر كل حرف فيها تقريبًا، ويفشل التطابق ويفشل التوقيع. بايت واحد يكفي لكشفه.",
    try3: "اختر «من منتحِل»: البايتات سليمة، لكن التوقيع صُنع بمفتاح آخر، ففشل فحص الناشر. البصمة وحدها ما كانت لتمسك هذا.",
    takeaway: "تنزيل نموذج ثقةٌ بمن صنعه. البصمة تثبت أن البايتات لم تتغيّر في الطريق، والتوقيع يثبت من صنعها. تحقّق من الاثنين قبل تشغيل نموذج — العادة نفسها تحمي كل ملف تثبّته.",
  },
};

export default function SupplyChain({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [scn, setScn] = useState<Scenario>("genuine");
  const [pub, setPub] = useState<Signer>();
  const [imp, setImp] = useState<Signer>();
  const [pubFp, setPubFp] = useState(""), [impFp, setImpFp] = useState("");
  const [published, setPublished] = useState("");
  const base = useMemo(() => basePkg(), []);
  const delivered = useMemo(() => (scn === "tampered" ? { ...base, note: base.note + "." } : base), [base, scn]);
  const [now, setNow] = useState(""); // fingerprint of the delivered bytes
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [sigOk, setSigOk] = useState<boolean | null>(null);
  const [sigFp, setSigFp] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, i] = await Promise.all([makeSigner(), makeSigner()]);
      if (!live) return;
      setPub(p); setImp(i);
      setPubFp(await keyFingerprint(p.publicKey)); setImpFp(await keyFingerprint(i.publicKey));
      setPublished(await sha256(pkgBytes(base)));
    })();
    return () => { live = false; };
  }, [base]);

  useEffect(() => {
    if (!pub || !imp || !published) return;
    let live = true;
    (async () => {
      const bytes = pkgBytes(delivered);
      const fp = await sha256(bytes);
      // genuine & impostor keep the real bytes; tampered keeps the publisher's OLD signature over the genuine bytes.
      const signer = scn === "impostor" ? imp : pub;
      const signedBytes = scn === "tampered" ? pkgBytes(base) : bytes;
      const sig = await sign(signer.privateKey, signedBytes);
      const ok = await verify(pub.publicKey, sig, bytes);
      if (!live) return;
      setNow(fp); setHashOk(fp === published); setSigOk(ok);
      setSigFp(scn === "impostor" ? impFp : pubFp);
      onDone?.();
    })();
    return () => { live = false; };
  }, [pub, imp, published, scn, delivered]); // eslint-disable-line react-hooks/exhaustive-deps

  const trusted = hashOk && sigOk;
  const sz = (b: number) => (b < 1000 * 1024 ? s.kb(num(Math.round(b / 1024))) : s.mb(num(b / 1048576, { maximumFractionDigits: 2 })));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => setScn("genuine")}>
      <div className="stack">
        <p className="lb-note">{s.publisher}: <code className="lb-sc-key" dir="ltr">{pubFp || "…"}</code></p>
        <Segmented label={s.scenario} value={scn} options={SCN.map((x) => [x, s.scn[x]])} onChange={setScn} />

        <div className="stack-sm">
          <span className="dr-field-label">{s.pkg}</span>
          <pre className="lb-pre" dir="ltr">{JSON.stringify(delivered, null, 1)}</pre>
          <span className="lb-note">{s.fp}</span>
          <code className="lb-hash" dir="ltr">{[...now].map((c, i) => <span key={i} className={published && published[i] !== c ? "is-diff" : undefined}>{c}</span>)}</code>
          {hashOk === false && <p className="lb-note">{s.bits(num(bitsDiffer(now, published)))}</p>}
          <span className="lb-note">{s.signedBy}: <code className="lb-sc-key" dir="ltr">{sigFp || "…"}</code></span>
        </div>

        <ul className="lb-checks">
          <li className={hashOk ? "is-ok" : "is-no"}><Icon name={hashOk ? "check" : "close"} size={18} /><span>{s.checkHash}</span></li>
          <li className={sigOk ? "is-ok" : "is-no"}><Icon name={sigOk ? "check" : "close"} size={18} /><span>{s.checkSig}</span></li>
        </ul>
        <p className={`lb-verdict ${trusted ? "" : "is-warn"}`} aria-live="polite">
          <span className={`lb-out-tag is-${trusted ? "good" : "bad"}`}><Icon name={trusted ? "lock" : "warning"} size={16} /></span>
          {trusted ? s.trusted : hashOk === false ? s.badHash : s.badSig}
        </p>

        <h3 className="lb-h">{s.real}</h3>
        <div className="lb-scroll">
          <table className="lb-table lb-sc-files">
            <thead><tr><th>{s.cName}</th><th>{s.cSize}</th><th>{s.cFp}</th></tr></thead>
            <tbody>
              {REAL_FILES.map((f) => <tr key={f.name}><td dir="ltr">{f.name}</td><td dir="ltr">{sz(f.bytes)}</td><td><code className="lb-sc-key" dir="ltr">{f.sha256 ? f.sha256.slice(0, 12) + "…" : "—"}</code></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </LabShell>
  );
}
