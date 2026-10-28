import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ChoiceCard, LanguagePicker, Mark, OnboardingStep, PlacementResult, QuestionHeader, QuizOption, TrueFalse, LessonTopBar, type IconName } from "@darsi/design-system";
import { useI18n, useLanguages } from "../i18n";
import { useStore, type AppState } from "../state/store";
import { loadPlacement, useAsync } from "../content/load";
import type { Audience, Placement, Track } from "../content/types";
import { useTracks } from "../content/settings";
import { useMine } from "../content/mine";
import { grade, shuffled, type Answer } from "../lesson/engine";

type Phase = "language" | "where" | "tracks" | "time" | "offer" | "quiz" | "result";
export function Onboarding() {
  const nav = useNavigate();
  const { t } = useI18n();
  const languages = useLanguages();
  const { state, dispatch } = useStore();
  const [phase, setPhase] = useState<Phase>("language");
  const tracks = useTracks();
  // School accounts are already a teacher or a student, so they skip "Who are you?".
  const { fixed } = useMine();
  const teacher = state.audience !== "students";
  const [levels, setLevels] = useState<Partial<Record<Track, number>>>({});
  const set = (patch: Partial<AppState>) => dispatch({ type: "set", patch });
  const finish = (lv: Partial<Record<Track, number>>) => { set({ onboarded: true, levels: lv }); nav("/learn", { replace: true }); };
  const cont = (to: Phase, disabled = false) => <Button block iconEnd="next" disabled={disabled} onClick={() => setPhase(to)}>{t("common.continue")}</Button>;

  if (phase === "language") return (
    <main className="screen narrow onb">
      <div className="onb-hero"><Mark size={72} /></div>
      <h1 className="dr-onb-title">{t("onb.language")}</h1>
      <LanguagePicker label={t("onb.language")} value={state.lang} onChange={(lang) => set({ lang })} languages={languages} />
      {cont(fixed ? "tracks" : "where")}
    </main>
  );
  if (phase === "where") return (
    <main className="screen narrow">
      <OnboardingStep step={1} total={4} title={t("onb.where")} body={t("onb.whereBody")} primary={cont("tracks", teacher && !state.teach)}
        secondary={<Button block variant="ghost" onClick={() => setPhase("tracks")}>{t("common.skip")}</Button>}>
        <ChoiceCard icon="profile" title={t("onb.primary")} description={t("onb.primaryD")} selected={teacher && state.teach === "primary"} onClick={() => set({ teach: "primary", audience: "teachers" })} />
        <ChoiceCard icon="learn" title={t("onb.secondary")} description={t("onb.secondaryD")} selected={teacher && state.teach === "secondary"} onClick={() => set({ teach: "secondary", audience: "teachers" })} />
        <ChoiceCard icon="award" title={t("onb.university")} selected={teacher && state.teach === "university"} onClick={() => set({ teach: "university", audience: "teachers" })} />
        <ChoiceCard icon="book" title={t("onb.student")} description={t("onb.studentD")} selected={!teacher} onClick={() => set({ teach: undefined, audience: "students" })} />
      </OnboardingStep>
    </main>
  );
  if (phase === "tracks") return (
    <main className="screen narrow">
      <OnboardingStep step={2} total={4} title={t("onb.tracks")} body={t("onb.tracksBody")} primary={cont("time", !state.tracks.length)}>
        {tracks.visible.map(({ id: tr, icon }) => <ChoiceCard key={tr} icon={icon as IconName} multi title={tracks.name(tr)} selected={state.tracks.includes(tr)}
          onClick={() => set({ tracks: state.tracks.includes(tr) ? state.tracks.filter((x) => x !== tr) : [...state.tracks, tr] })} />)}
      </OnboardingStep>
    </main>
  );
  if (phase === "time") return (
    <main className="screen narrow">
      <OnboardingStep step={3} total={4} title={t("onb.time")} body={t("onb.timeBody")} primary={cont("offer")}>
        {([[2, "onb.t15", "onb.t15d"], [4, "onb.t30", "onb.t30d"], [8, "onb.t60", "onb.t60d"]] as const).map(([n, a, b]) =>
          <ChoiceCard key={n} title={t(a)} description={t(b)} selected={state.weeklyLessons === n} onClick={() => set({ weeklyLessons: n })} />)}
      </OnboardingStep>
    </main>
  );
  if (phase === "offer") return (
    <main className="screen narrow">
      <OnboardingStep step={4} total={4} title={t("onb.placement")} body={t("onb.placementBody")} art={<Mark size={72} />}
        primary={<Button block iconEnd="next" onClick={() => setPhase("quiz")}>{t("onb.startCheck")}</Button>}
        secondary={<Button block variant="ghost" onClick={() => finish({})}>{t("onb.skipCheck")}</Button>} />
    </main>
  );
  if (phase === "quiz") return <PlacementQuiz onDone={(lv) => { setLevels(lv); setPhase("result"); }} />;
  return (
    <main className="screen narrow">
      <PlacementResult title={t("place.title")} summary={t("place.summary")}
        levels={tracks.visible.filter(({ id }) => !state.tracks.length || state.tracks.includes(id)).map(({ id: tr, levels: of }) => ({ track: tr, trackLabel: tracks.name(tr), level: levels[tr] ?? 1, of, label: tracks.levelName(tr, levels[tr] ?? 1) }))}
        actions={<Button block iconEnd="next" onClick={() => finish(levels)}>{t("place.go")}</Button>} />
    </main>
  );
}

type PQ = Placement["questions"][number];
/** Where the check stands in one track: the level being asked, and how many of its two questions were answered. */
export interface PlaceState { level: number; asked: number }
/**
 * After one answer. Two questions per level from Beginner up, and a level is passed only with both right, so a wrong
 * answer (or "I don't know yet") ends the track at that level: the learner starts there. Passing the top level places
 * them at the top.
 */
export function placementNext(s: PlaceState, ok: boolean, top: number): { level: number } | { state: PlaceState } {
  if (!ok) return { level: s.level };
  if (s.asked === 0) return { state: { level: s.level, asked: 1 } };
  return s.level >= top ? { level: top } : { state: { level: s.level + 1, asked: 0 } };
}
const randomly = <T,>(items: T[]) => items.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
/** One track's questions for one audience: two per level (picked at random, so checking again asks others). */
export const placementBank = (questions: PQ[], track: Track, audience: Audience, top: number, pick: (q: PQ[]) => PQ[] = randomly): PQ[][] =>
  Array.from({ length: top }, (_, i) => pick(questions.filter((q) => q.track === track && q.audience === audience && q.level === i + 1)).slice(0, 2));

/**
 * The placement check for the learner's tracks (or only `tracks`), for their audience. Tracks without questions start
 * at level 1. Closing it gives no levels.
 */
export function PlacementQuiz({ tracks: only, onDone, onClose }: { tracks?: Track[]; onDone: (levels: Partial<Record<Track, number>>) => void; onClose?: () => void }) {
  const { t, L, lang } = useI18n();
  const tracks = useTracks();
  const mine = useMine();
  const { data } = useAsync(loadPlacement, []);
  const list = only ?? mine.tracks.map((x) => x.id);
  const banks = useMemo(() => (data ? Object.fromEntries(list.map((tr) => [tr, placementBank(data.questions, tr, mine.audience, tracks.of(tr).levels)])) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]);
  const asked = list.filter((tr) => banks?.[tr]?.[0]?.length);
  const [ti, setTi] = useState(0);
  const [st, setSt] = useState<PlaceState>({ level: 1, asked: 0 });
  const [n, setN] = useState(1);
  const [levels, setLevels] = useState<Partial<Record<Track, number>>>({});
  const [answer, setAnswer] = useState<Answer | null>(null);
  const all = (got: Partial<Record<Track, number>>) => ({ ...Object.fromEntries(list.map((tr) => [tr, 1])), ...got });
  useEffect(() => { if (banks && !asked.length) onDone(all({})); }, [banks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!banks || !asked.length) return <div className="loading" aria-busy="true" />;
  const tr = asked[ti];
  const top = tracks.of(tr).levels;
  const q = banks[tr][st.level - 1]?.[st.asked];
  const finish = (level: number) => {
    const got = { ...levels, [tr]: level };
    setLevels(got); setAnswer(null); setN(1); setSt({ level: 1, asked: 0 });
    if (ti + 1 < asked.length) setTi(ti + 1); else onDone(all(got));
  };
  const next = (ok: boolean) => {
    const r = placementNext(st, ok, top);
    if ("level" in r) return finish(r.level);
    // A level without two questions (a track with more levels than the check covers) is where the learner starts.
    if (!banks[tr][r.state.level - 1]?.[r.state.asked]) return finish(r.state.level);
    setSt(r.state); setAnswer(null); setN(n + 1);
  };
  if (!q) return <div className="loading" aria-busy="true" />;
  const keys = lang === "ar" ? ["أ", "ب", "ج", "د"] : ["A", "B", "C", "D"];
  const progress = ((ti + (st.level - 1 + st.asked / 2) / top) / asked.length) * 100;
  return (
    <div className="lesson">
      <div className="lesson-top"><LessonTopBar value={progress} track={tr} onClose={onClose ?? (() => onDone({}))} closeLabel={t("common.close")} /></div>
      <main className="screen narrow lesson-body">
        <div className="stack">
          <QuestionHeader type={q.type} typeLabel={t("place.qTrack", { track: tracks.name(tr), n })} prompt={L(q.prompt)} />
          {q.type === "truefalse"
            ? <TrueFalse value={answer?.kind === "truefalse" ? answer.value : undefined} trueLabel={t("q.true")} falseLabel={t("q.false")} onChange={(v) => setAnswer({ kind: "truefalse", value: v })} />
            : shuffled(q.options, q.id).map((o, k) => <QuizOption key={o.id} keyLabel={keys[k]} state={answer?.kind === "choice" && answer.id === o.id ? "selected" : "idle"} onClick={() => setAnswer({ kind: "choice", id: o.id })}>{L(o.text)}</QuizOption>)}
          <Button block variant="ghost" onClick={() => next(false)}>{t("common.dontKnow")}</Button>
        </div>
      </main>
      <div className="lesson-bar"><Button block disabled={!answer} onClick={() => next(grade(q, answer!, lang))}>{t("common.continue")}</Button></div>
    </div>
  );
}
