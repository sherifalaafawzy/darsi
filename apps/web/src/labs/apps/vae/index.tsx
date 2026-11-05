import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { decode, encode, mse, paint } from "./model";

const S = {
  en: {
    intro: "The picture is an 8×8 blob. Its code is two numbers: how far right the brightness sits, and how far down. Decoding paints a blob at that code. Nudging the code invents a new picture. It does not invent a photograph.",
    x: "Code: across", y: "Code: down", original: "The picture", rebuilt: "Decoded from the code",
    error: "Difference from the original",
    same: "This code is where the brightness actually sits, so the decode is close.",
    moved: "You moved the code. The decode is a new blob, not a repair of the old one.",
    try1: "Leave both sliders where they start: the decode matches the blob.",
    try2: "Move Across: the blob slides sideways. The two numbers are the whole picture.",
    try3: "Move both to a corner and compare the difference. The code forgot the exact pixels.",
    takeaway: "An autoencoder stores a short code and rebuilds from it. A variational one keeps a cloud of codes so a new sample can be decoded. Two numbers are a summary, not a meaning.",
  },
  ar: {
    intro: "الصورة بقعة ٨×٨. ورمزها رقمان: كم تبعد الإضاءة إلى اليمين، وكم تبعد إلى الأسفل. وفك الرمز يرسم بقعة عند ذلك الرمز. وتحريك الرمز يخترع صورة جديدة. وهو لا يخترع صورة فوتوغرافية.",
    x: "الرمز: أفقيًا", y: "الرمز: إلى الأسفل", original: "الصورة", rebuilt: "فُكّت من الرمز",
    error: "الفرق عن الأصل",
    same: "هذا الرمز هو موضع الإضاءة فعلًا، فالصورة المفكوكة قريبة.",
    moved: "حرّكت الرمز. الصورة المفكوكة بقعة جديدة، وليست إصلاحًا للقديمة.",
    try1: "اترك المؤشرين حيث يبدآن: الصورة المفكوكة تطابق البقعة.",
    try2: "حرّك «أفقيًا»: تنزلق البقعة جانبًا. الرقمان هما الصورة كلها.",
    try3: "حرّك الاثنين إلى زاوية وقارن الفرق. الرمز نسي البكسلات بالضبط.",
    takeaway: "يخزّن المرمّز التلقائي رمزًا قصيرًا ويعيد البناء منه. والمرمّز المتغير يحتفظ بسحابة من الرموز حتى يمكن فك عيّنة جديدة. والرقمان ملخّص، وليسا معنى.",
  },
};

export default function Vae({ meta }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const picture = useMemo(() => paint(0.3, 0.45), []);
  const code = useMemo(() => encode(picture), [picture]);
  const [x, setX] = useState(code.x);
  const [y, setY] = useState(code.y);
  const out = decode(x, y);
  const err = mse(picture, out);
  const n = (v: number) => num(Math.round(v * 100) / 100);
  const moved = Math.abs(x - code.x) + Math.abs(y - code.y) > 0.08;
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.x} value={x} min={0.1} max={0.9} step={0.05} onChange={setX} format={n} />
      <Slider label={s.y} value={y} min={0.1} max={0.9} step={0.05} onChange={setY} format={n} />
      <div className="lb-two">
        <div className="stack"><p>{s.original}</p><PixelGrid n={8} value={picture} readOnly label={s.original} /></div>
        <div className="stack"><p>{s.rebuilt}</p><PixelGrid n={8} value={out} readOnly label={s.rebuilt} /></div>
      </div>
      <p>{s.error} <bdi dir="ltr">{n(err)}</bdi>. {moved ? s.moved : s.same}</p>
    </LabShell>
  );
}
