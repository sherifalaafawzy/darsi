import { useEffect, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TOOLS, type Lang, type Turn } from "../../../tinylm";
import { Segmented, Slider } from "../../kit/controls";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { runTurn } from "../agentloop/agent";
import { TinyGate, Turns, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { batteryPct, breakEven, CLOUD, cloud, measure, tiny as tinyCost, type Gen, type Net } from "./model";

const ASKS: Record<Lang, string[]> = {
  en: ["What's the weather in Kafi tomorrow?", "What is 17 times 23?", "I'm going from Kafi to Dala tomorrow. How far is it, and what's the weather there?"],
  ar: ["ما حالة الطقس في كافي غدًا؟", "كم يساوي ١٧ × ٢٣؟", "سأذهب من كافي إلى دالا غدًا. كم المسافة، وكيف الطقس هناك؟"],
};

const S = {
  en: {
    intro: "Every request to an AI agent costs something: tokens, time, data, money and battery. Run a request with Darsi Tiny on this phone and measure it, then compare it with sending the same request to a big model in the cloud over a mobile network.",
    pick: "A request", run: "Run and measure", stop: "Stop",
    net: "Network for the cloud model", nets: { "2g": "2G", "3g": "3G", "4g": "4G" } as Record<Net, string>,
    perDay: "Requests a day", price: "Price of 1 GB of mobile data",
    tiny: "Darsi Tiny, on this phone", big: "Big model, in the cloud",
    tokens: "Tokens read and written", time: "Time", data: "Data", money: "Money", battery: "Battery", offline: "Without a signal",
    tok: (r: string, w: string) => `${r} read, ${w} written`,
    tinyTime: (s: string, old: string) => `${s} s here; about ${old} s on an old phone`,
    bigTokens: (r: string, w: string, t: string) => `${r} read (incl. ${t} describing the tools, every step), ${w} written`,
    sec: (s: string) => `${s} s`, kb: (k: string) => `${k} KB`, mb: (m: string) => `${m} MB`,
    noData: (mb: string) => `none (after one ${mb} MB download)`, free: "free", batt: (p: string) => `${p}% of a full battery`,
    works: "works", fails: "doesn't work",
    tags: { measured: "measured", estimated: "estimated", typical: "typical" } as Record<string, string>,
    month: (n: string) => `In a month, at ${n} a day`, req: { one: "{n} request", other: "{n} requests" } as Forms,
    monthData: (t: string, c: string) => `Data: Darsi Tiny ${t}; the cloud model ${c}.`,
    monthMoney: (c: string, d: string) => `Money: Darsi Tiny nothing; the cloud model ${c} (${d} of it for data).`,
    monthBattery: (t: string, c: string) => `Battery: Darsi Tiny ${t}%; the cloud model ${c}%.`,
    even: (n: string) => `After about ${n}, the cloud model has used more data than downloading Darsi Tiny once.`,
    typicalNote: "Darsi Tiny's tokens and time are measured on this device, and its download size comes from its files. Everything about the cloud model is a typical figure (network speeds, prices, power), not a measurement: real ones vary by country, phone and provider.",
    honest: "But the big model knows far more: it can answer questions Darsi Tiny would get wrong.",
    try1: "Run “What's the weather in Kafi tomorrow?” and note the tokens and the time on this phone.",
    try2: "Switch the network to 2G: how long and how much data would a cloud model need for the same request? Then try the two-step trip.",
    try3: "Set 30 requests a day and your own data price: compare a month of the cloud with downloading Darsi Tiny once.",
    takeaway: "A tiny model on the phone costs one download and a little battery, then nothing per request, and works without a signal. A big cloud model knows far more, but every request costs data, money, time and a signal.",
  },
  ar: {
    intro: "لكل طلب إلى وكيل ذكي كلفة: توكنز ووقت وبيانات ومال وبطارية. شغّل طلبًا مع «درسي الصغير» على هذا الهاتف وقِسه، ثم قارنه بإرسال الطلب نفسه إلى نموذج كبير في السحابة عبر شبكة الهاتف.",
    pick: "طلب", run: "شغّل وقِس", stop: "أوقف",
    net: "شبكة النموذج السحابي", nets: { "2g": "الجيل الثاني", "3g": "الجيل الثالث", "4g": "الجيل الرابع" },
    perDay: "الطلبات في اليوم", price: "سعر ١ غيغابايت من بيانات الهاتف",
    tiny: "«درسي الصغير» على هذا الهاتف", big: "نموذج كبير في السحابة",
    tokens: "التوكنز المقروءة والمكتوبة", time: "الوقت", data: "البيانات", money: "المال", battery: "البطارية", offline: "دون إشارة",
    tok: (r: string, w: string) => `قرأ ${r}، وكتب ${w}`,
    tinyTime: (s: string, old: string) => `${s} ثانية هنا، ونحو ${old} ثانية على هاتف قديم`,
    bigTokens: (r: string, w: string, t: string) => `يقرأ ${r} (منها ${t} لوصف الأدوات في كل خطوة)، ويكتب ${w}`,
    sec: (s: string) => `${s} ثانية`, kb: (k: string) => `${k} كيلوبايت`, mb: (m: string) => `${m} ميغابايت`,
    noData: (mb: string) => `لا شيء (بعد تنزيل واحد حجمه ${mb} ميغابايت)`, free: "مجانًا", batt: (p: string) => `${p}٪ من بطارية كاملة`,
    works: "يعمل", fails: "لا يعمل",
    tags: { measured: "مقيس", estimated: "تقدير", typical: "رقم معتاد" },
    month: (n: string) => `في شهر، بمعدل ${n} في اليوم`, req: { one: "طلب واحد", two: "طلبين", few: "{n} طلبات", many: "{n} طلبًا", other: "{n} طلب" } as Forms,
    monthData: (t: string, c: string) => `البيانات: «درسي الصغير» ${t}؛ والنموذج السحابي ${c}.`,
    monthMoney: (c: string, d: string) => `المال: «درسي الصغير» لا شيء؛ والنموذج السحابي ${c} (منها ${d} للبيانات).`,
    monthBattery: (t: string, c: string) => `البطارية: «درسي الصغير» ${t}٪؛ والنموذج السحابي ${c}٪.`,
    even: (n: string) => `بعد نحو ${n}، يكون النموذج السحابي قد استهلك بيانات أكثر من تنزيل «درسي الصغير» مرة واحدة.`,
    typicalNote: "توكنز «درسي الصغير» ووقته مقيسة على هذا الجهاز، وحجم تنزيله من ملفاته. أما كل ما يخص النموذج السحابي فأرقام معتادة (سرعات الشبكات والأسعار والطاقة) لا قياسات: والأرقام الحقيقية تختلف باختلاف البلد والهاتف والمزوّد.",
    honest: "لكن النموذج الكبير يعرف أكثر بكثير: يستطيع أن يجيب عن أسئلة يخطئ فيها «درسي الصغير».",
    try1: "شغّل «ما حالة الطقس في كافي غدًا؟» ولاحظ التوكنز والوقت على هذا الهاتف.",
    try2: "اختر شبكة الجيل الثاني: كم يحتاج نموذج سحابي من الوقت والبيانات للطلب نفسه؟ ثم جرّب الرحلة ذات الخطوتين.",
    try3: "اختر ٣٠ طلبًا في اليوم وسعر بياناتك: قارن شهرًا من السحابة بتنزيل «درسي الصغير» مرة واحدة.",
    takeaway: "النموذج الصغير على الهاتف يكلّف تنزيلًا واحدًا وقليلًا من البطارية، ثم لا شيء لكل طلب، ويعمل دون إشارة. والنموذج السحابي الكبير يعرف أكثر بكثير، لكن كل طلب يكلّف بيانات ومالًا ووقتًا وإشارة.",
  },
};

export default function Costs({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui, num } = useI18n();
  const count = usePlural();
  const lang: Lang = ui === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [ask, setAsk] = useState(ASKS[lang][0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [gens, setGens] = useState<Gen[]>([]);
  const [busy, setBusy] = useState(false);
  const [net, setNet] = useState<Net>("3g");
  const [perDay, setPerDay] = useState(20);
  const [price, setPrice] = useState(2);
  const [compared, setCompared] = useState(false);
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => { if (compared && gens.length) onDone?.(); }, [compared && gens.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (busy) return;
    setBusy(true);
    stopped.current = false;
    const start: Turn[] = [{ role: "user", text: ask }];
    setTurns(start);
    setGens([]);
    try {
      await tiny.prepare();
      const got: Gen[] = [];
      await runTurn({ tools: TOOLS, turns: start }, tiny.gen, tiny.run, {
        stopped: () => stopped.current,
        onStep: (o, t) => {
          setTurns([...t]);
          if ("gen" in o && o.kind !== "stopped") { const g = o.gen; got.push({ kind: o.kind === "plan" ? "plan" : "act", prompt: g.promptTokens, reused: g.reused, wrote: g.ids.length, ms: g.prefillMs + g.decodeMs }); setGens([...got]); }
        },
      });
    } catch { /* TinyGate */ } finally { setBusy(false); }
  };

  const m = gens.length ? measure(gens) : null;
  const t = m ? tinyCost(m) : null, c = m ? cloud(m, net, price) : null;
  const one = (x: number, d = 1) => num(Math.round(x * 10 ** d) / 10 ** d);
  const money = (x: number) => num(x, { style: "currency", currency: "USD", maximumSignificantDigits: 2 });
  const pctB = (j: number) => num(batteryPct(j), { maximumSignificantDigits: 2 });
  const mb = Math.round(tiny.bytes / 1e5) / 10;
  const month = perDay * 30;
  const tag = (k: "measured" | "estimated" | "typical") => <span className={`lb-ag-tag is-${k}`}>{s.tags[k]}</span>;
  const setN = (v: Net) => { setNet(v); setCompared(true); };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.pick}</span>
          <div className="lb-ag-exs">{ASKS[lang].map((x) => <button key={x} type="button" className={x === ask ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={x === ask} onClick={() => !busy && setAsk(x)}><Txt text={x} /></button>)}</div>
          <div className="lb-row">{busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button> : <Button icon="play" onClick={run}>{s.run}</Button>}</div>
          <TinyGate tiny={tiny} onRetry={run} />
        </div>
        <div className="stack">
          <Segmented label={s.net} value={net} options={(["2g", "3g", "4g"] as const).map((n) => [n, s.nets[n]] as const)} onChange={setN} />
          <Slider label={s.perDay} value={perDay} min={1} max={100} onChange={(v) => { setPerDay(v); setCompared(true); }} format={(v) => num(v)} />
          <Slider label={s.price} value={price} min={0.5} max={10} step={0.5} onChange={(v) => { setPrice(v); setCompared(true); }} format={(v) => money(v)} />
        </div>
      </div>
      <Turns turns={turns} live={tiny.live} />
      {m && t && c && !busy && (
        <div className="stack" aria-live="polite">
          <div className="lb-ag-vs">
            <section className="lb-panel is-tiny" aria-label={s.tiny}>
              <h3 className="lb-h">{s.tiny}</h3>
              <dl className="lb-ag-facts">
                <div><dt>{s.tokens}</dt><dd>{s.tok(num(t.tokensIn), num(t.tokensOut))} {tag("measured")}</dd></div>
                <div><dt>{s.time}</dt><dd>{s.tinyTime(one(t.seconds, 2), one(t.oldSeconds))} {tag("measured")}</dd></div>
                <div><dt>{s.data}</dt><dd>{s.noData(num(mb))} {tag("measured")}</dd></div>
                <div><dt>{s.money}</dt><dd>{s.free}</dd></div>
                <div><dt>{s.battery}</dt><dd>{s.batt(pctB(t.joules))} {tag("estimated")}</dd></div>
                <div><dt>{s.offline}</dt><dd>{s.works}</dd></div>
              </dl>
            </section>
            <section className="lb-panel" aria-label={s.big}>
              <h3 className="lb-h">{s.big} ({s.nets[net]})</h3>
              <dl className="lb-ag-facts">
                <div><dt>{s.tokens}</dt><dd>{s.bigTokens(num(c.tokensIn), num(c.tokensOut), num(CLOUD.toolTokens))} {tag("estimated")}</dd></div>
                <div><dt>{s.time}</dt><dd>{s.sec(one(c.seconds))} {tag("typical")}</dd></div>
                <div><dt>{s.data}</dt><dd>{s.kb(one(c.bytes / 1000))} {tag("typical")}</dd></div>
                <div><dt>{s.money}</dt><dd>{money(c.dollars)} {tag("typical")}</dd></div>
                <div><dt>{s.battery}</dt><dd>{s.batt(pctB(c.joules))} {tag("typical")}</dd></div>
                <div><dt>{s.offline}</dt><dd>{s.fails}</dd></div>
              </dl>
            </section>
          </div>
          <div className="lb-panel">
            <strong>{s.month(count(perDay, s.req))}</strong>
            <p className="lb-note">{s.monthData(s.mb(num(mb)), s.mb(one((c.bytes * month) / 1e6)))}</p>
            <p className="lb-note">{s.monthMoney(money(c.dollars * month), money(c.dataDollars * month))}</p>
            <p className="lb-note">{s.monthBattery(pctB(t.joules * month), pctB(c.joules * month))}</p>
            <p className="lb-verdict">{s.even(count(breakEven(tiny.bytes, c.bytes), s.req))}</p>
          </div>
          <p className="lb-note">{s.typicalNote} {s.honest}</p>
        </div>
      )}
    </LabShell>
  );
}
