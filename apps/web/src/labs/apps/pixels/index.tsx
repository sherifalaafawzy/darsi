import { useEffect, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { PixelGrid } from "../../kit/PixelGrid";
import { blank } from "../../kit/raster";
import { useKit, useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { brighten, invert, level, N, preset, shift, type Preset } from "./model";

const S = {
  en: {
    intro: "A digital picture is a grid of tiny squares (pixels), and each pixel is just a number: 0 is white, 9 is darkest here. Draw, or pick a picture, and watch the numbers.",
    picture: "Start from", smile: "Smile", house: "House", sun: "Sun", grid: "Picture you can draw on", numbers: "The same picture as numbers",
    invert: "Swap dark and light", brighter: "Darker", lighter: "Lighter", move: "Move one step", what: "What the computer reads, in one long row:",
    count: (n: string) => `This picture is ${n} numbers. A phone photo is about 12 million pixels, each with 3 numbers (red, green, blue).`,
    takeaway: "To a computer, every picture is a grid of numbers. Changing a picture means doing maths on those numbers, and vision AI learns patterns in them.",
  },
  ar: {
    intro: "الصورة الرقمية شبكة من مربعات صغيرة (بكسلات)، وكل بكسل ما هو إلا رقم: ٠ أبيض، و٩ الأغمق هنا. ارسم أو اختر صورة، وراقب الأرقام.",
    picture: "ابدأ من", smile: "ابتسامة", house: "بيت", sun: "شمس", grid: "صورة يمكنك الرسم عليها", numbers: "الصورة نفسها أرقامًا",
    invert: "بدّل الداكن والفاتح", brighter: "أغمق", lighter: "أفتح", move: "حرّك خطوة", what: "ما يقرؤه الحاسوب، في صف طويل واحد:",
    count: (n: string) => `هذه الصورة ${n} رقم. صورة الهاتف نحو ١٢ مليون بكسل، ولكل بكسل ٣ أرقام (أحمر وأخضر وأزرق).`,
    takeaway: "كل صورة في نظر الحاسوب شبكة من الأرقام. تغيير الصورة يعني إجراء عمليات حسابية على هذه الأرقام، والذكاء الاصطناعي البصري يتعلّم الأنماط فيها.",
  },
};

export default function Pixels({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const [p, setP] = useState<Preset>("smile");
  const [img, setImg] = useState(() => preset("smile"));
  const [edits, setEdits] = useState(0);
  const change = (next: Float32Array) => { setImg(next); setEdits((e) => e + 1); };
  useEffect(() => { if (edits >= 3) onDone?.(); }, [edits >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = Array.from(img.slice(0, 30), level);
  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.picture} value={p} options={[["smile", s.smile], ["house", s.house], ["sun", s.sun]]} onChange={(v) => { setP(v); setImg(preset(v)); }} />
      <div className="lb-two">
        <div className="stack">
          <PixelGrid n={N} value={img} onChange={change} label={s.grid} />
          <div className="lb-row">
            <Button size="sm" variant="secondary" onClick={() => change(invert(img))}>{s.invert}</Button>
            <Button size="sm" variant="secondary" onClick={() => change(brighten(img, 0.25))}>{s.brighter}</Button>
            <Button size="sm" variant="secondary" onClick={() => change(brighten(img, -0.25))}>{s.lighter}</Button>
            <Button size="sm" variant="secondary" onClick={() => change(shift(img))}>{s.move}</Button>
            <Button size="sm" variant="ghost" icon="close" onClick={() => change(blank(N))}>{k.clear}</Button>
          </div>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.numbers}</span>
          <table className="lb-table lb-matrix" dir="ltr" aria-label={s.numbers}><tbody>
            {Array.from({ length: N }, (_, r) => <tr key={r}>{Array.from({ length: N }, (_, c) => { const v = level(img[r * N + c]); return <td key={c} className={v ? "is-ink" : ""}>{num(v)}</td>; })}</tr>)}
          </tbody></table>
          <p className="lb-note">{s.what}</p>
          {/* One isolate per number: space-separated Arabic-Indic digits would otherwise read right to left. */}
          <p className="lb-mono" dir="ltr">{flat.map((v, i) => <bdi key={i}>{num(v)} </bdi>)}<bdi>…</bdi></p>
          <p className="lb-note">{s.count(num(N * N))}</p>
        </div>
      </div>
    </LabShell>
  );
}
