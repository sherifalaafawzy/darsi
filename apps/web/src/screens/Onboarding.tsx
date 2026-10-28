import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ChoiceCard, LanguagePicker, Mark, OnboardingStep, PlacementResult, QuestionHeader, QuizOption, TrueFalse, LessonTopBar, type IconName } from "@darsi/design-system";
import { useI18n, useLanguages } from "../i18n";
import { useStore, type AppState } from "../state/store";
import { loadPlacement, useAsync } from "../content/load";
import type { Track } from "../content/types";
import { useTracks } from "../content/settings";
import { useMine } from "../content/mine";
import { grade, shuffled, type Answer } from "../lesson/engine";

type Phase = "language" | "where" | "tracks" | "time" | "offer" | "quiz" | "result";
/**
 * A placement level from a share of right answers: all wrong → 1, all right → the track's top level, evenly between.
 * (Tracks without placement questions start at level 1.)
 */
export const placementLevel = (correct: number, asked: number, levels: number) =>
  asked ? 1 + Math.floor((correct / asked) * (levels - 1) + 1e-9) : 1;

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

function PlacementQuiz({ onDone }: { onDone: (levels: Partial<Record<Track, number>>) => void }) {
  const { t, L, lang } = useI18n();
  const tracks = useTracks();
  const { data } = useAsync(loadPlacement, []);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState<Record<string, [number, number]>>({});
  if (!data) return <div className="loading" aria-busy="true" />;
  const qs = data.questions, q = qs[i];
  const keys = lang === "ar" ? ["أ", "ب", "ج", "د"] : ["A", "B", "C", "D"];
  const next = (correct: boolean) => {
    const [c, n] = score[q.track] ?? [0, 0];
    const s = { ...score, [q.track]: [c + (correct ? 1 : 0), n + 1] as [number, number] };
    setScore(s); setAnswer(null);
    if (i + 1 < qs.length) setI(i + 1);
    else onDone(Object.fromEntries(Object.entries(s).map(([tr, [cc, nn]]) => [tr, placementLevel(cc, nn, tracks.of(tr).levels)])));
  };
  return (
    <div className="lesson">
      <div className="lesson-top"><LessonTopBar value={(i / qs.length) * 100} track={q.track} onClose={() => onDone({})} closeLabel={t("common.close")} /></div>
      <main className="screen narrow lesson-body">
        <div className="stack">
          <QuestionHeader type={q.type} typeLabel={t("place.q", { n: i + 1, total: qs.length })} prompt={L(q.prompt)} />
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
