import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TinyLM, fetchManifest, type Turn } from "../../../tinylm";
import { useTeachBase } from "../../../tinylm/base";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { runTurn } from "../agentloop/agent";
import { Txt } from "../agentloop/lab-agents";
import { compileQuestion, pictureHint } from "./compile";
import { expand, parseScene, sceneResult, specForTopic, specFromCourse, specFromQuestion, type SceneSpec } from "./expand";
import { CONCEPTS, matchConcept, norm } from "./model";
import { PackStage, type StageScene } from "./stage";

const S = {
  en: {
    intro: "Talk to the tutor. A small teaching model writes a scene, and a Lesson Studio pack draws it live on the canvas. A new question is a new animation. Voice comes later. It does not teach other subjects.",
    ask: "Talk to the tutor", send: "Send", stop: "Stop",
    ideas: "Ideas to explain",
    showing: (name: string) => `Drawing ${name} on the canvas.`,
    none: "That is outside the courses. Ask about a neuron, a neural network, a transformer, gradient descent, a logic gate, binary, a sensor, a loop, bubble sort, a query, HTTPS, phishing, or a shortest path.",
    hello: "Hello. Tell me which technology idea you want to understand.",
    off: "I explain technology ideas from the courses. Ask me about one of them.",
    hintSort: "A sort needs three to six numbers, each up to 99. Try 4, 2, 5, 1.",
    hintBag: "Name each item with its weight and its points, then a capacity. Try books 5 3, desks 4 4, capacity 8.",
    hintGraph: "Write each road as Place-Place and a distance, then the start and the finish. Try Home-Tala 4, Tala-School 3, Home-School 9, from Home to School.",
    try1: "Ask “Sort 4, 2, 5, 1, 3”. The scene JSON is built on the phone, and the array pack swaps each pair.",
    try2: "Ask “Home-Tala 4, Tala-School 3, Home-School 9, from Home to School”. Dijkstra draws that map.",
    try3: "Say “I still don't understand. Explain it again.” The tutor stays on the same idea.",
    takeaway: "You talk, and the tutor explains. Each picture step is drawn when its turn comes.",
  },
  ar: {
    intro: "تحدّث مع المعلّم. يكتب نموذج تعليم صغير مشهدًا، وترسمه حزمة من ستوديو الدرس مباشرة على اللوحة. والسؤال الجديد مشهد جديد. الصوت يأتي لاحقًا. وهو لا يدرّس مواد أخرى.",
    ask: "تحدّث مع المعلّم", send: "أرسل", stop: "أوقف",
    ideas: "أفكار للشرح",
    showing: (name: string) => `يرسم ${name} على اللوحة.`,
    none: "هذا خارج المقررات. اسأل عن خلية عصبية، أو شبكة عصبية، أو المحوّل، أو الانحدار التدريجي، أو البوابات المنطقية، أو النظام الثنائي، أو الحساس، أو الحلقة، أو الترتيب الفقاعي، أو الاستعلام، أو HTTPS، أو التصيّد، أو أقصر طريق.",
    hello: "مرحبًا. قل لي أي فكرة تقنية تريد أن تفهمها.",
    off: "أشرح أفكار التقنية من المقررات. اسألني عن واحدة منها.",
    hintSort: "الترتيب يحتاج من ثلاثة إلى ستة أعداد، كل منها حتى ٩٩. جرّب ٤، ٢، ٥، ١.",
    hintBag: "اذكر كل غرض مع وزنه ونقاطه، ثم السعة. جرّب كتب ٥ ٣، مقاعد ٤ ٤، سعة ٨.",
    hintGraph: "اكتب كل طريق هكذا: مكان-مكان والمسافة، ثم البداية والنهاية. جرّب البيت-تالا ٤، تالا-المدرسة ٣، البيت-المدرسة ٩، من البيت إلى المدرسة.",
    try1: "اسأل «رتب 4، 2، 5، 1، 3». يُبنى JSON المشهد على الهاتف، وحزمة المصفوفة تبدّل كل زوج.",
    try2: "اسأل «البيت-تالا 4، تالا-المدرسة 3، البيت-المدرسة 9، من البيت إلى المدرسة». يرسم ديكسترا تلك الخريطة.",
    try3: "قل «ما زلت لا أفهم. اشرح مرة أخرى.» يبقى المعلّم على الفكرة نفسها.",
    takeaway: "أنت تتحدّث، والمعلّم يشرح. وكل خطوة في الصورة تُرسم عندما يأتي دورها.",
  },
};

interface Msg { who: "you" | "tiny" | "app"; text: string }

/**
 * A plea to hear the last idea again ("I still don't understand. Explain it again."), written as norm() leaves it
 * (ة → ه, أ → ا, ى → ي), or the Arabic branches could never match. Words such as "understand", "more" or "example"
 * alone are not pleas: "Help me understand HTTPS" is a new question.
 */
export function isFollowUp(q: string): boolean {
  return /\b(again|simpler|simply|one more time|once more)\b|\bdon['’]?t understand\b|\bdo not understand\b|مره اخري|مره ثانيه|لا افهم|لم افهم|ابسط|زدني/.test(norm(q));
}

/** A follow-up only when the message names nothing of its own: a picture, a course idea or a term from the courses. */
export function asksAgain(q: string): boolean {
  return isFollowUp(q) && !compileQuestion(q) && !matchConcept(q) && !specFromQuestion(q) && !specFromCourse(q);
}

/** A greeting is not a concept, so the tutor answers it itself instead of asking the model to invent one. */
function isHello(q: string): boolean {
  const n = norm(q).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return n === "hi" || n === "hello" || n === "hey" || n === "can you teach me" || n === "can you help me"
    || n === "hello can you teach me" || n === "can you help me understand"
    || n === "مرحبا" || n === "السلام عليكم" || n === "هل تعلمني" || n === "مرحبا هل تعلمني" || n === "هل تساعدني على الفهم";
}

/** A 3M model can choose a scene well and still garble an unfamiliar paraphrase. Never show that over a known-good
 * explanation: accept its prose only when it stays in the UI language and carries enough of the scene's meaning. */
export function usableAnswer(got: string, fallback: string, lang: "en" | "ar"): boolean {
  const text = got.trim();
  if (text.length < 16 || text.length > 500 || /nothing else|outside the|خارج المقررات/i.test(text)) return false;
  const hasAr = /[\u0600-\u06ff]/.test(text);
  if ((lang === "ar") !== hasAr) return false;
  const words = (s: string) => new Set(norm(s).match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length >= 3) ?? []);
  const want = words(fallback), have = words(text);
  let overlap = 0;
  for (const w of want) if (have.has(w)) overlap++;
  return overlap >= Math.max(2, Math.ceil(want.size * 0.22));
}

const EXTRA_CHIPS = [
  { id: "neuron", term: { en: "neuron", ar: "خلية عصبية" } },
  { id: "model-net", term: { en: "neural network", ar: "شبكة عصبية" } },
];

export default function Tutor({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui } = useI18n();
  const uiLang = ui === "ar" ? "ar" : "en";
  const sceneBaseOn = useTeachBase();
  const sceneLm = useMemo(() => new TinyLM({ base: sceneBaseOn }), [sceneBaseOn]);
  const [sceneOn, setSceneOn] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchManifest(sceneBaseOn).then(() => { if (alive) setSceneOn(true); }).catch(() => { if (alive) setSceneOn(false); });
    return () => { alive = false; sceneLm.dispose(); };
  }, [sceneLm, sceneBaseOn]);
  const [text, setText] = useState("");
  const [log, setLog] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draw, setDraw] = useState<{ scene: StageScene; dur: number; lang: "en" | "ar"; run: number; orient: "landscape" | "portrait"; pace: "steps" | "lesson" } | null>(null);
  const stopped = useRef(false);
  /** The last exchange, so the next message is a follow-up rather than a new stranger. */
  const thread = useRef<Turn[]>([]);
  /** The last scene drawn: "explain it again" replays it (same map, same numbers) instead of asking for a new one. */
  const lastSpec = useRef<SceneSpec | null>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    stopped.current = false;
    setLog((m) => [...m, { who: "you", text: question }]);
    setText("");
    if (isHello(question)) {
      setLog((m) => [...m, { who: "tiny", text: s.hello }]);
      setBusy(false);
      return;
    }
    let shown = "";
    let played = null as ReturnType<typeof expand> | null;
    const showBuilt = (built: ReturnType<typeof expand>) => {
      played = built;
      lastSpec.current = built.spec;
      onDone?.();
      if (built.json === shown) return;
      shown = built.json;
      setDraw((d) => ({ scene: built.scene, dur: built.dur, lang: uiLang, run: (d?.run ?? 0) + 1, orient: "landscape", pace: built.pace }));
    };
    // "I still don't understand. Explain it again.": the same scene from the start, with its line. Asking the scene model
    // for "<last question> (n)" drew a new, garbled picture (four nodes all named «المدرسة», a different map).
    if (lastSpec.current && asksAgain(question)) {
      const built = expand(lastSpec.current);
      showBuilt(built);
      thread.current = [{ role: "user", text: question }, { role: "plan", text: built.spec.kind }, { role: "answer", text: built.line[uiLang] }];
      setLog((m) => [...m, { who: "tiny", text: built.line[uiLang] }]);
      setBusy(false);
      return;
    }
    const early = compileQuestion(question);
    if (early) {
      const built = expand(early);
      showBuilt(built);
      thread.current = [{ role: "user", text: question }, { role: "plan", text: built.spec.kind }, { role: "answer", text: built.line[uiLang] }];
      setLog((m) => [...m, { who: "tiny", text: built.line[uiLang] }]);
      setBusy(false);
      return;
    }
    const hint = pictureHint(question);
    if (hint) {
      const said = hint === "sort" ? s.hintSort : hint === "bag" ? s.hintBag : s.hintGraph;
      setLog((m) => [...m, { who: "tiny", text: said }]);
      setBusy(false);
      return;
    }
    // A message that names an idea is about that idea, even with "again" or "understand" in it ("Help me understand
    // HTTPS" after bubble sort is HTTPS, not bubble sort once more).
    const conceptEarly = matchConcept(question);
    const direct = specFromQuestion(question);
    const courseHint = direct ? null : specFromCourse(question);
    const made = direct ?? (conceptEarly ? specForTopic(conceptEarly.id, question) : null);
    if (made) {
      const built = expand(made);
      showBuilt(built);
      thread.current = [{ role: "user", text: question }, { role: "plan", text: built.spec.kind }, { role: "answer", text: built.line[uiLang] }];
      setLog((m) => [...m, { who: "tiny", text: built.line[uiLang] }]);
      setBusy(false);
      return;
    }
    // The scene model gets the message alone, or after the last exchange when it is a plea and nothing was drawn yet.
    if (!isFollowUp(question)) thread.current = [];
    thread.current = [...thread.current, { role: "user", text: question }];
    if (sceneOn) {
      let done = false;
      try {
        await sceneLm.load();
        if (stopped.current) return;
        const { outs } = await runTurn(
          { tools: ["scene"], turns: thread.current },
          (c, opts) => sceneLm.generate(c, { ...opts, maxTokens: 110 }),
          (call) => {
            const spec = call.tool === "scene" ? parseScene(JSON.stringify(call.args)) : null;
            const owned = compileQuestion(question);
            if (!spec || (owned && JSON.stringify(spec) !== JSON.stringify(owned)) || (courseHint && spec.kind !== courseHint.kind)) return { error: "bad scene" };
            showBuilt(expand(spec));
            return sceneResult(spec);
          },
          { maxSteps: 3, stopped: () => stopped.current },
        );
        const answer = outs.find((o) => o.kind === "answer");
        const modelText = answer && answer.kind === "answer" ? answer.text.trim() : "";
        if (!played && courseHint) showBuilt(expand(courseHint));
        const said = played
          ? (usableAnswer(modelText, played.line[uiLang], uiLang) ? modelText : played.line[uiLang])
          : s.none;
        if (!played) lastSpec.current = null; // "again" after "that is outside the courses" has nothing to replay
        thread.current = played
          ? [{ role: "user", text: question }, { role: "plan", text: played.spec.kind }, { role: "answer", text: said }]
          : [];
        setLog((m) => [...m, { who: "tiny", text: said }]);
        done = true;
        return;
      } catch { /* no scene, so the tutor says what it can draw */ }
      finally { if (done || stopped.current) setBusy(false); }
    }
    if (courseHint) {
      const built = expand(courseHint);
      showBuilt(built);
      thread.current = [{ role: "user", text: question }, { role: "plan", text: "Explain the picture." }, { role: "answer", text: built.line[uiLang] }];
      setLog((m) => [...m, { who: "tiny", text: built.line[uiLang] }]);
      setBusy(false);
      return;
    }
    lastSpec.current = null;
    setLog((m) => [...m, { who: "tiny", text: s.none }]);
    setBusy(false);
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          {draw ? <PackStage scene={draw.scene} lang={draw.lang} run={draw.run} dur={draw.dur} orient={draw.orient} pace={draw.pace} /> : <p className="lb-note">{s.ideas}</p>}
        </div>
        <div className="stack">
          <div className="lb-tutor-log" aria-live="polite">
            {log.map((m, i) => (
              <p key={i} className={`lb-tutor-msg is-${m.who}`}><Txt text={m.text} /></p>
            ))}
          </div>
          <label className="dr-field-label" htmlFor="tutor-q">{s.ask}</label>
          <input id="tutor-q" className="dr-field-input" dir="auto" value={text} maxLength={240} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(text); }} />
          <div className="lb-seg" role="group" aria-label={s.ideas}>
            {[...EXTRA_CHIPS, ...CONCEPTS].map((c) => (
              <button key={c.id} type="button" className="lb-seg-btn" disabled={busy} onClick={() => { void ask(uiLang === "ar" ? `اشرح لي ${c.term.ar}` : `Can you explain ${c.term.en}?`); }}>
                {c.term[uiLang]}
              </button>
            ))}
          </div>
          <div className="lb-row">
            {busy
              ? <Button variant="secondary" icon="pause" onClick={() => { stopped.current = true; sceneLm.stop(); }}>{s.stop}</Button>
              : <Button icon="next" onClick={() => void ask(text)} disabled={!text.trim()}>{s.send}</Button>}
          </div>
        </div>
      </div>
    </LabShell>
  );
}
