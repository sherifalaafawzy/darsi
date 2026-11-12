import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../i18n";

export interface InlineConfirmProps {
  /** The question ("Remove Sara's access?"); it names the dialog. */
  title: string;
  /** What happens if they go on, in a sentence. */
  body?: ReactNode;
  confirmLabel: string;
  /** "Cancel" when left out. */
  cancelLabel?: string;
  /** The action deletes or locks something: the question is drawn as a warning. */
  danger?: boolean;
  /** The action is running: the confirm button spins, and neither button acts again. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** More to fill in or read before confirming (a reason field, why the last try failed). */
  children?: ReactNode;
}

/**
 * A question asked on the page, where the action is, instead of a browser dialog (an installed app on iOS may not show
 * confirm() at all, and it can be neither translated nor styled). Render it only while asking:
 *   {asking && <InlineConfirm title=… confirmLabel=… onConfirm=… onCancel={() => setAsking(false)} />}
 * Opening moves the keyboard focus to the safe action (Cancel), so Enter or Space on a question that just appeared
 * never deletes anything; Escape cancels. Closing, by cancel or by confirm, gives the focus back to whatever opened
 * it when that is still on the page (a row the action removed is not: the caller then says what happened in a notice).
 * It looks like the confirmations the staff screens already had (a notice with the question, the action, then Cancel).
 */
export function InlineConfirm({ title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel, children }: InlineConfirmProps) {
  const { t } = useI18n();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  // What had the focus when the question was asked: read during the first render, before the question takes it.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  // A layout effect: its clean-up runs while the question is still in the page, so "is the focus inside it?" has an
  // answer. Focus that went elsewhere meanwhile (the person clicked another field) is left where it is.
  useLayoutEffect(() => {
    const el = box.current;
    el?.querySelector<HTMLElement>("[data-safe]")?.focus();
    return () => {
      // Safari gives a clicked button no focus: "nowhere" (the body) counts as still being in the question.
      const at = document.activeElement;
      if (opener?.isConnected && opener !== document.body && (!at || at === document.body || el?.contains(at))) opener.focus();
    };
  }, [opener]);
  return (
    <div ref={box} className={danger ? "notice err stack-sm" : "notice stack-sm"} role="alertdialog" aria-labelledby={`${id}-t`} aria-describedby={body ? `${id}-b` : undefined}
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); } }}>
      <strong id={`${id}-t`}>{title}</strong>
      {body && <span id={`${id}-b`}>{body}</span>}
      {children}
      <div className="row-gap">
        <Button size="sm" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        <Button size="sm" variant="ghost" data-safe="" disabled={busy} onClick={onCancel}>{cancelLabel ?? t("common.cancel")}</Button>
      </div>
    </div>
  );
}
