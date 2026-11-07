import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { RobotBlock, RobotCommand } from "../../../content/types";
import type { RobotOutcome } from "../../../content/robot";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { COMMANDS, LEVELS, best, fold, repeat, run, stars } from "./model";

const S = {
  en: {
    intro: "A robot does exactly what its program says, one card after another, and nothing else. Lay the cards in order, then press Run to watch it walk.",
    level: "Grid", goal: "Get the robot to the flag.", program: "Your program", cards: (n: string, max: string) => `${n} of ${max}`, cardsN: { one: "{n} card", other: "{n} cards" } as Forms,
    sep: ", ", commands: "Cards to use", forward: "Forward", left: "Turn left", right: "Turn right", times: { one: "once", other: "{n} times" } as Forms,
    tapCard: "Tap a card in your program to repeat it, up to 4 times.", full: "No room for another card: take one out first.",
    remove: (c: string) => `Take out ${c}`, run: "Run the robot", clear: "Clear", grid: "The robot's grid", empty: "Tap the cards below to build a program.",
    outcome: { goal: "The robot reached the flag!", wall: "Bump! The robot walked into a wall.", edge: "The robot reached the edge of the grid.", short: "The robot stopped before the flag." } as Record<RobotOutcome, string>,
    used: (cards: string, best: string) => `You used ${cards}. The fewest possible is ${best}. Can you do it with fewer?`,
    bestDone: (cards: string) => `${cards}: the fewest possible!`, stars: { one: "{n} star of 3", other: "{n} stars of 3" } as Forms, next: "Next grid", shorten: "Join repeated cards",
    try1: "On grid 1, use four Forward cards, then one Forward card tapped to ×4. The robot walks the same way: repeating is a loop.",
    try2: "On grid 2 the robot faces the wrong way. A turn can be repeated too: “Turn right ×2” turns it round.",
    try3: "On grid 5, find the route that needs the fewest cards. Is it the shortest walk?",
    takeaway: "A program is a list of exact steps that run in order. Repeating a step (a loop) makes a program shorter, and the best program is often not the shortest walk but the simplest list.",
  },
  ar: {
    intro: "ينفّذ الروبوت ما يقوله برنامجه بالضبط، بطاقة بعد بطاقة، ولا شيء غير ذلك. رتّب البطاقات، ثم اضغط «شغّل» لتراه يمشي.",
    level: "الشبكة", goal: "أوصل الروبوت إلى الراية.", program: "برنامجك", cards: (n: string, max: string) => `${n} من ${max}`, cardsN: { one: "بطاقة واحدة", two: "بطاقتين", few: "{n} بطاقات", many: "{n} بطاقة", other: "{n} بطاقة" } as Forms,
    sep: "، ", commands: "البطاقات المتاحة", forward: "إلى الأمام", left: "استدر يسارًا", right: "استدر يمينًا", times: { one: "مرة واحدة", two: "مرتين", few: "{n} مرات", many: "{n} مرة", other: "{n} مرة" } as Forms,
    tapCard: "انقر بطاقة في برنامجك لتكرّرها حتى ٤ مرات.", full: "لا مكان لبطاقة أخرى: أخرِج واحدة أولًا.",
    remove: (c: string) => `أخرِج ${c}`, run: "شغّل الروبوت", clear: "امسح", grid: "شبكة الروبوت", empty: "انقر البطاقات في الأسفل لتبني برنامجًا.",
    outcome: { goal: "وصل الروبوت إلى الراية!", wall: "طاخ! اصطدم الروبوت بجدار.", edge: "وصل الروبوت إلى حافة الشبكة.", short: "توقّف الروبوت قبل الراية." } as Record<RobotOutcome, string>,
    used: (cards: string, best: string) => `استعملت ${cards}. وأقل عدد ممكن هو ${best}. هل تستطيع أن تنجح بعدد أقل؟`,
    bestDone: (cards: string) => `${cards}: أقل عدد ممكن!`, stars: { one: "نجمة واحدة من ٣", two: "نجمتان من ٣", few: "{n} نجوم من ٣", many: "{n} نجمة من ٣", other: "{n} نجمة من ٣" } as Forms, next: "الشبكة التالية", shorten: "اجمع البطاقات المتكرّرة",
    try1: "في الشبكة ١، استعمل أربع بطاقات «إلى الأمام»، ثم بطاقة واحدة تنقرها حتى تصير ×٤. يمشي الروبوت المسار نفسه: التكرار حلقة.",
    try2: "في الشبكة ٢ يتّجه الروبوت إلى الجهة الخطأ. والاستدارة يمكن تكرارها أيضًا: «استدر يمينًا ×٢» تجعله يلتفّ إلى الخلف.",
    try3: "في الشبكة ٥، ابحث عن المسار الذي يحتاج إلى أقل عدد من البطاقات. هل هو أقصر طريق؟",
    takeaway: "البرنامج قائمة خطوات دقيقة تُنفَّذ بالترتيب. وتكرار خطوة (الحلقة) يجعل البرنامج أقصر، وأفضل برنامج كثيرًا ما يكون أبسط قائمة لا أقصر طريق.",
  },
};

const CELL = 40;
const ARROW: Record<RobotCommand, string> = { forward: "M12 19V5M6 11l6-6 6 6", left: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", right: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" };
const CmdIcon = ({ cmd }: { cmd: RobotCommand }) => (
  <svg className="lb-robot-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d={ARROW[cmd]} /></svg>
);
const STEP_MS = 400;

export default function Robot({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [lvl, setLvl] = useState(0);
  const [program, setProgram] = useState<RobotBlock[]>([]);
  const [shown, setShown] = useState(0); // how far along its path the robot is drawn
  const [walking, setWalking] = useState(false);
  const [outcome, setOutcome] = useState<RobotOutcome | null>(null);
  const [solved, setSolved] = useState<Record<number, number>>({}); // level → fewest cards used
  const level = LEVELS[lvl], w = level.world;
  const fewest = useMemo(() => best(level), [level]);
  const result = useMemo(() => run(level, program), [level, program]);
  const label: Record<RobotCommand, string> = { forward: s.forward, left: s.left, right: s.right };

  const edit = (next: RobotBlock[]) => { setProgram(next); setShown(0); setOutcome(null); setWalking(false); };
  const pick = (i: number) => { setLvl(i); edit([]); };
  // The walk: one square every 400 ms, then it stops by itself; at once when the phone asks for less motion.
  useEffect(() => {
    if (!walking) return;
    const last = result.path.length - 1;
    if (shown >= last || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(last); setWalking(false); setOutcome(result.outcome);
      if (result.outcome === "goal") setSolved((x) => ({ ...x, [lvl]: Math.min(x[lvl] ?? Infinity, program.length) }));
      return;
    }
    const id = setTimeout(() => setShown(shown + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [walking, shown, result, lvl, program.length]);
  useEffect(() => { if (Object.keys(solved).length >= 3) onDone?.(); }, [Object.keys(solved).length >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  const pose = result.path[Math.min(shown, result.path.length - 1)];
  const rot = { N: 0, E: 90, S: 180, W: 270 }[pose.dir];
  const full = program.length >= level.maxCards;
  const won = outcome === "goal";
  const folded = fold(program);
  const isWall = (x: number, y: number) => (w.walls ?? []).some((p) => p.x === x && p.y === y);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setSolved({}); pick(0); }}>
      <Segmented label={s.level} value={lvl} onChange={pick}
        options={LEVELS.map((_, i) => [i, solved[i] !== undefined ? `${num(i + 1)} ✓` : num(i + 1)] as const)} />
      <p className="lb-note">{s.goal}</p>
      <svg className="lb-robot-grid" viewBox={`0 0 ${w.cols * CELL} ${w.rows * CELL}`} role="img" aria-label={s.grid} style={{ maxInlineSize: `${w.cols * 64}px` }}>
        {Array.from({ length: w.rows }, (_, y) => Array.from({ length: w.cols }, (_, x) => (
          <rect key={`${x},${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} className={isWall(x, y) ? "lb-robot-wall" : "lb-robot-cell"} />
        )))}
        <g transform={`translate(${w.goal.x * CELL + 12} ${w.goal.y * CELL + 8})`} className="lb-robot-flag">
          <path d="M2 0V26" className="lb-robot-pole" /><path d="M3 1H18L14 7L18 13H3Z" />
        </g>
        {result.path.slice(1, shown + 1).map((p, i) => <circle key={i} cx={p.x * CELL + CELL / 2} cy={p.y * CELL + CELL / 2} r={3} className="lb-robot-trail" />)}
        <g transform={`translate(${pose.x * CELL + CELL / 2} ${pose.y * CELL + CELL / 2}) rotate(${rot})`} className={outcome && !won ? "lb-robot-bot is-stuck" : "lb-robot-bot"}>
          <rect x={-13} y={-13} width={26} height={26} rx={6} /><circle cx={-5} cy={-2} r={2.5} className="lb-robot-eye" /><circle cx={5} cy={-2} r={2.5} className="lb-robot-eye" />
          <path d="M-6 -9L0 -16L6 -9Z" className="lb-robot-nose" />
        </g>
      </svg>
      {outcome && <p className={won ? "lb-verdict" : "lb-verdict is-warn"} role="status">{s.outcome[outcome]}</p>}
      {won && (
        <div className="lb-robot-score">
          <span className="lb-robot-stars" role="img" aria-label={count(stars(program.length, fewest), s.stars)}>
            {[1, 2, 3].map((k) => <span key={k} className={k <= stars(program.length, fewest) ? "is-on" : undefined} aria-hidden>★</span>)}
          </span>
          <p className="lb-note">{program.length <= fewest ? s.bestDone(count(program.length, s.cardsN)) : s.used(count(program.length, s.cardsN), count(fewest, s.cardsN))}</p>
          {lvl < LEVELS.length - 1 && <Button size="sm" variant="secondary" icon="next" onClick={() => pick(lvl + 1)}>{s.next}</Button>}
        </div>
      )}

      <section className="lb-robot-sec" aria-label={s.program}>
        <h3 className="lb-robot-h">{s.program} <span className="lb-note">{s.cards(num(program.length), count(level.maxCards, s.cardsN))}</span></h3>
        {program.length ? (
          <ol className="lb-robot-prog">
            {program.map((b, i) => (
              <li key={i} className="lb-robot-item">
                <button type="button" className={`lb-robot-card is-${b.cmd}`} disabled={walking} aria-label={`${label[b.cmd]}${s.sep}${count(b.times, s.times)}`}
                  onClick={() => edit(repeat(program, i))}>
                  <CmdIcon cmd={b.cmd} /><span>{label[b.cmd]}</span>{b.times > 1 && <strong className="lb-robot-times">×{num(b.times)}</strong>}
                </button>
                <button type="button" className="lb-robot-x" disabled={walking} aria-label={s.remove(label[b.cmd])} onClick={() => edit(program.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ol>
        ) : <p className="lb-robot-empty">{s.empty}</p>}
        {program.length > 0 && <p className="lb-note">{s.tapCard}</p>}
      </section>
      <section className="lb-robot-sec" aria-label={s.commands}>
        <h3 className="lb-robot-h">{s.commands}</h3>
        <div className="lb-robot-palette">
          {COMMANDS.map((cmd) => (
            <button key={cmd} type="button" className={`lb-robot-card is-${cmd} is-new`} disabled={full || walking} onClick={() => edit([...program, { cmd, times: 1 }])}>
              <CmdIcon cmd={cmd} /><span>{label[cmd]}</span>
            </button>
          ))}
        </div>
        {full && <p className="lb-note">{s.full}</p>}
      </section>
      <div className="lb-runbar">
        <Button size="sm" icon="play" disabled={!program.length || walking} onClick={() => { setShown(0); setOutcome(null); setWalking(true); }}>{s.run}</Button>
        {folded.length < program.length && <Button size="sm" variant="secondary" disabled={walking} onClick={() => edit(folded)}>{s.shorten}</Button>}
        <Button size="sm" variant="ghost" icon="undo" disabled={!program.length || walking} onClick={() => edit([])}>{s.clear}</Button>
      </div>
    </LabShell>
  );
}
