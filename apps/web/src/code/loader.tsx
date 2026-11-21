/**
 * The code steps (code, parsons, codefill, bug, blocks) load on demand: CodeSteps.tsx is its own lazy chunk, kept out of
 * the precache and cached the first time a lesson needs it; downloading a unit pins it (with the sandbox) in
 * "darsi-saved", where it stays across app updates (platform/offline.ts). Import this only from startup modules (StepView).
 * If the chunk still can't load (offline, never saved), the learner can retry or skip the exercise: a graded step that
 * can't be answered must never trap them in the lesson.
 */
import { Component, lazy, Suspense, type ReactNode } from "react";
import { Button, EmptyState } from "@darsi/design-system";
import { useI18n } from "../i18n";
import type { StepViewProps } from "../lesson/StepView";

let CodeSteps = lazy(() => import("./CodeSteps"));
/** Fetches the code steps' chunk ahead (downloading a unit for offline). */
export const prefetchCodeSteps = () => import("./CodeSteps").then(() => {}, () => {});

class Boundary extends Component<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  retry = () => { CodeSteps = lazy(() => import("./CodeSteps")); this.setState({ failed: false }); };
  render() { return this.state.failed ? this.props.fallback(this.retry) : this.props.children; }
}

export function CodeStepEmbed(p: StepViewProps) {
  const { t } = useI18n();
  return (
    <Boundary fallback={(retry) => <EmptyState tone="offline" title={t("code.notSaved")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>}
      secondary={p.onSkip && <Button size="sm" variant="ghost" iconEnd="next" onClick={p.onSkip}>{t("code.skip")}</Button>} />}>
      <Suspense fallback={<div className="loading" aria-busy="true" />}><CodeSteps {...p} /></Suspense>
    </Boundary>
  );
}
