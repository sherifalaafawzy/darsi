import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented } from "../../kit/controls";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { at, convolve, CUSTOM, display, KERNELS, N, picture, pool } from "./model";

type Choice = keyof typeof KERNELS | "custom";
const S = {
  en: {
    intro: "A filter is a small 3×3 grid of numbers. It slides over the picture; at each spot it multiplies the 9 pixels under it by its numbers and adds them up. The result is a new picture that shows what the filter looks for.",
    filter: "Filter", vertical: "Upright edges", horizontal: "Flat edges", outline: "Outline", blur: "Blur", sharpen: "Sharpen", custom: "My own",
    input: "The picture (the box is the filter)", output: "What the filter finds", slide: "Slide the filter", all: "All at once", pooling: "Shrink (keep the strongest of each 2×2)", off: "Off", on: "On",
    here: "At this spot:", weights: "The filter's numbers",
    about: {
      vertical: "Finds upright edges: walls, door sides, window sides.", horizontal: "Finds flat edges: the roof line, the ground, window tops.",
      outline: "Lights up wherever a pixel differs from its neighbours.", blur: "Averages each pixel with its neighbours.", sharpen: "Makes each pixel stand out from its neighbours.",
      custom: "This one lights up edges that slope like \\, such as the right side of the roof, and leaves the left side (/) dark. Change the numbers: can you make it light up the left side instead?",
    } as Record<Choice, string>,
    try1: "Press “Slide the filter” and watch the box move across the picture: each new output pixel is the sum written under “At this spot”.",
    try2: "Switch between Upright edges and Flat edges: the walls and door sides light up in one, the roof line and the ground in the other.",
    try3: "Pick My own: the right side of the roof lights up, the left side stays dark. Mirror the numbers left to right (swap the first and last columns): now the left side lights up instead.",
    takeaway: "Vision networks stack many layers of filters like these. The first layers find edges; later layers combine them into shapes, faces and objects. The network learns the numbers in its filters by itself.",
  },
  ar: {
    intro: "المرشّح شبكة صغيرة ٣×٣ من الأرقام. ينزلق فوق الصورة، وعند كل موضع يضرب البكسلات التسعة التي تحته في أرقامه ثم يجمعها. والنتيجة صورة جديدة تُظهر ما يبحث عنه المرشّح.",
    filter: "المرشّح", vertical: "حواف قائمة", horizontal: "حواف أفقية", outline: "إطار", blur: "طمس", sharpen: "إبراز", custom: "مرشّحي",
    input: "الصورة (المربع هو المرشّح)", output: "ما يجده المرشّح", slide: "حرّك المرشّح", all: "دفعة واحدة", pooling: "تصغير (أبقِ الأقوى في كل ٢×٢)", off: "متوقف", on: "يعمل",
    here: "في هذا الموضع:", weights: "أرقام المرشّح",
    about: {
      vertical: "يجد الحواف القائمة: الجدران وجانبي الباب والنوافذ.", horizontal: "يجد الحواف الأفقية: خط السقف والأرض وأعالي النوافذ.",
      outline: "يضيء حيثما اختلف البكسل عن جيرانه.", blur: "يأخذ متوسط كل بكسل مع جيرانه.", sharpen: "يجعل كل بكسل يبرز عن جيرانه.",
      custom: "هذا المرشّح يُضيء الحواف المائلة هكذا \\، مثل الجانب الأيمن من السقف، ويترك الجانب الأيسر (/) معتمًا. غيّر الأرقام: هل تستطيع أن تجعله يُضيء الجانب الأيسر بدلًا منه؟",
    } as Record<Choice, string>,
    try1: "اضغط «حرّك المرشّح» وراقب المربع يتحرك فوق الصورة: كل بكسل جديد في الناتج هو المجموع المكتوب تحت «في هذا الموضع».",
    try2: "بدّل بين «حواف قائمة» و«حواف أفقية»: تضيء الجدران وجانبا الباب في الأول، وخط السقف والأرض في الثاني.",
    try3: "اختر «مرشّحي»: يضيء الجانب الأيمن من السقف ويبقى الأيسر معتمًا. اعكس الأرقام من اليسار إلى اليمين (بدّل العمودين الأول والأخير): يضيء الجانب الأيسر الآن بدلًا منه.",
    takeaway: "تكدّس شبكات الرؤية طبقات كثيرة من مرشّحات كهذه. الطبقات الأولى تجد الحواف، والطبقات اللاحقة تجمعها في أشكال ووجوه وأشياء. والشبكة تتعلّم أرقام مرشّحاتها بنفسها.",
  },
};

export default function Convolution({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const img = useMemo(picture, []);
  const [choice, setChoice] = useState<Choice>("vertical");
  // What the learner typed, cell by cell. Kept as text so a lone "-" (on the way to a negative number) isn't turned into 0.
  const [draft, setDraft] = useState<string[]>(() => CUSTOM.map(String));
  const custom = useMemo(() => draft.map((v) => Math.max(-9, Math.min(9, Number(v) || 0))), [draft]);
  const [p, setP] = useState(N * N); // how many spots the filter has visited; N×N means the whole picture
  const [pooled, setPooled] = useState(false);
  const [tried, setTried] = useState(() => new Set<Choice>(["vertical"]));
  const [slid, setSlid] = useState(false);
  const k = choice === "custom" ? custom : KERNELS[choice];
  const full = useMemo(() => display(convolve(img, k)), [img, k]);
  const shown = useMemo(() => (p >= N * N ? full : full.map((v, i) => (i < p ? v : 0))), [full, p]);
  useEffect(() => { if (slid && tried.size >= 3) onDone?.(); }, [slid, tried.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const pRef = useRef(p);
  pRef.current = p;
  const loop = useLoop(() => {
    pRef.current = Math.min(N * N, pRef.current + 1);
    setP(pRef.current);
    if (pRef.current >= N * N) { setSlid(true); return false; }
  }, { maxPerFrame: 2 });
  const pick = (v: Choice) => { loop.stop(); setChoice(v); setP(N * N); setTried((t) => new Set(t).add(v)); };
  const pos = Math.max(0, Math.min(N * N - 1, p - 1)), r = Math.floor(pos / N), c = pos % N;
  // The canvas has a 2px border; the window lines up with its cells inside it.
  const win = (cells: number, edge = 2) => `calc(${edge}px + (100% - 4px) * ${cells / N})`;
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const terms = [-1, 0, 1].map((dr) => [-1, 0, 1].map((dc) => { const rr = r + dr, cc = c + dc, px = rr >= 0 && rr < N && cc >= 0 && cc < N ? img[rr * N + cc] : 0; return [px, k[(dr + 1) * 3 + dc + 1]] as const; }));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.filter} value={choice} options={(["vertical", "horizontal", "outline", "blur", "sharpen", "custom"] as const).map((x) => [x, s[x]] as const)} onChange={pick} />
      <p className="lb-note">{s.about[choice]}</p>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.input}</span>
          <div className="lb-conv" dir="ltr">
            <PixelGrid n={N} value={img} label={s.input} readOnly />
            {p < N * N && <span className="lb-conv-win" style={{ insetInlineStart: win(c - 1), insetBlockStart: win(r - 1), inlineSize: win(3, 0), blockSize: win(3, 0) }} />}
          </div>
          <span className="dr-field-label">{s.weights}</span>
          <div className="lb-kernel" dir="ltr">
            {k.map((w, i) => choice === "custom"
              ? <input key={i} type="number" className="dr-field-input" step={1} min={-9} max={9} aria-label={`${s.weights} ${num(i + 1)}`} value={draft[i]}
                  onChange={(e) => { const next = [...draft]; next[i] = e.target.value; setDraft(next); setP(N * N); }}
                  onBlur={() => { if (draft[i] !== String(w)) setDraft(draft.map((d, j) => (j === i ? String(w) : d))); }} />
              : <span key={i}>{n2(w)}</span>)}
          </div>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.output}</span>
          <PixelGrid n={pooled && p >= N * N ? N / 2 : N} value={pooled && p >= N * N ? pool(shown) : shown} label={s.output} readOnly />
          <RunBar running={loop.running} runLabel={s.slide} onToggle={() => { if (p >= N * N) setP(0); loop.toggle(); }} onStep={() => { const next = p >= N * N ? 1 : p + 1; setP(next); if (next >= N * N) setSlid(true); }}>
            <Button size="sm" variant="ghost" onClick={() => { loop.stop(); setP(N * N); }}>{s.all}</Button>
          </RunBar>
          {p < N * N && (
            <div className="stack-sm">
              <span className="dr-field-label">{s.here}</span>
              {terms.map((row, i) => <p key={i} className="lb-mono" dir="ltr">{row.flatMap(([px, w], j) => [...(j ? [" + "] : []), n2(px), " × ", n2(w)]).map((t, q) => <bdi key={q}>{t}</bdi>)}</p>)}
              <p className="lb-mono" dir="ltr"><bdi>= </bdi><bdi>{n2(at(img, k, r, c))}</bdi></p>
            </div>
          )}
          <Segmented label={s.pooling} value={pooled ? 1 : 0} options={[[0, s.off], [1, s.on]]} onChange={(v) => setPooled(v === 1)} />
        </div>
      </div>
    </LabShell>
  );
}
