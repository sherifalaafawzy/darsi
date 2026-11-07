import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { decode, encode, mse, PICTURE } from "./model";

const S = {
  en: {
    intro: "The picture is an 8×8 blob with two bright specks. Its code is two numbers: how far right the brightness sits, and how far down. Decoding paints a blob at that code. Nudging the code invents a new picture. It does not invent a photograph.",
    x: "Code: across", y: "Code: down", original: "The picture", rebuilt: "Decoded from the code",
    error: "Difference from the original",
    same: "This code is where the brightness sits, so the decoded blob is in the right place. The two bright specks are gone: two numbers can't hold them.",
    moved: "You moved the code, and the difference grew. The decode is a new blob, not a repair of the old one.",
    try1: "Leave both sliders where they start: the decoded blob is in the right place, but the two bright specks are gone.",
    try2: "Move Across: the blob slides sideways and the difference grows. The two numbers say where the blob is, not every pixel.",
    try3: "Move both to a corner and compare the difference: the decode is a new blob, not the old picture.",
    takeaway: "An autoencoder stores a short code and rebuilds from it. A variational one keeps a cloud of codes so a new sample can be decoded. Two numbers are a summary, not a meaning.",
  },
  ar: {
    intro: "الصورة بقعة ٨×٨ ومعها نقطتان ساطعتان. ورمزها رقمان: كم يبعد السطوع إلى اليمين، وكم يبعد إلى الأسفل. وفك الرمز يرسم بقعة عند ذلك الرمز. وتحريك الرمز يخترع صورة جديدة. وهو لا يخترع صورة فوتوغرافية.",
    x: "الرمز: أفقيًا", y: "الرمز: إلى الأسفل", original: "الصورة", rebuilt: "فُكّت من الرمز",
    error: "الفرق عن الأصل",
    same: "هذا الرمز هو موضع السطوع، فالبقعة المفكوكة في مكانها الصحيح. أما النقطتان الساطعتان فقد اختفتا: لا يتسع لهما رقمان.",
    moved: "حرّكت الرمز فكبر الفرق. الصورة المفكوكة بقعة جديدة، وليست إصلاحًا للقديمة.",
    try1: "اترك المؤشرين حيث يبدآن: البقعة المفكوكة في مكانها، لكن النقطتين الساطعتين اختفتا.",
    try2: "حرّك «أفقيًا»: تنزلق البقعة جانبًا ويكبر الفرق. الرقمان يقولان أين البقعة، لا كل بكسل.",
    try3: "حرّك الاثنين إلى زاوية وقارن الفرق: الصورة المفكوكة بقعة جديدة، لا الصورة القديمة.",
    takeaway: "يخزّن المرمّز التلقائي رمزًا قصيرًا ويعيد البناء منه. والمرمّز المتغير يحتفظ بسحابة من الرموز حتى يمكن فك عيّنة جديدة. والرقمان ملخّص، وليسا معنى.",
  },
};

/** The sliders' step: the start sits on it, so the thumb and the number shown agree. */
const STEP = 0.05;
const onStep = (v: number) => Math.round(v / STEP) / Math.round(1 / STEP); // 7 / 20 = 0.35, not 7 × 0.05 = 0.35000000000000003

export default function Vae({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const start = useMemo(() => { const c = encode(PICTURE); return { x: onStep(c.x), y: onStep(c.y) }; }, []);
  const [x, setX] = useState(start.x);
  const [y, setY] = useState(start.y);
  const out = decode(x, y);
  const err = mse(PICTURE, out);
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  // Three decimals: one slider step changes the difference by about 0.01, which two decimals could hide.
  const n3 = (v: number) => num(Math.round(v * 1000) / 1000);
  const moved = Math.abs(x - start.x) + Math.abs(y - start.y) > STEP * 0.8; // one step counts as a move
  useEffect(() => { if (moved) onDone?.(); }, [moved]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      {/* Left to right in both languages: they move the blob across and down the left-to-right picture. */}
      <Slider dir="ltr" label={s.x} value={x} min={0.1} max={0.9} step={STEP} onChange={setX} format={n2} />
      <Slider dir="ltr" label={s.y} value={y} min={0.1} max={0.9} step={STEP} onChange={setY} format={n2} />
      <div className="lb-two">
        <div className="stack"><p>{s.original}</p><PixelGrid n={8} value={PICTURE} readOnly label={s.original} /></div>
        <div className="stack"><p>{s.rebuilt}</p><PixelGrid n={8} value={out} readOnly label={s.rebuilt} /></div>
      </div>
      <p>{s.error} <bdi dir="ltr">{n3(err)}</bdi>. {moved ? s.moved : s.same}</p>
    </LabShell>
  );
}
