import type { ReactNode } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../i18n";
import { categoryOf } from "../categories";
import type { LabMeta } from "../types";
import { useKit } from "./strings";
import "../../styles/lab-kit.css";

/**
 * Every lab's frame: track colour and icon, its shelf as the kicker, title, a short intro, "Try this" (one to three
 * things to do and notice, so the app teaches rather than just sits there), the app, and the takeaway.
 */
export function LabShell({ meta, intro, tries, takeaway, onReset, children }: { meta: LabMeta; intro?: ReactNode; tries?: ReactNode[]; takeaway?: ReactNode; onReset?: () => void; children: ReactNode }) {
  const { L } = useI18n();
  const k = useKit();
  const cat = categoryOf(meta.category);
  return (
    <section className={`lb-shell is-${cat.track}`} aria-labelledby={`lb-${meta.id}`}>
      <header className="lb-head">
        <span className="lb-icon" aria-hidden><Icon name={cat.track} /></span>
        <div className="lb-head-text"><span className="lb-kicker">{L(cat.name)}</span><h2 id={`lb-${meta.id}`}>{L(meta.title)}</h2></div>
        {onReset && <Button size="sm" variant="ghost" icon="sync" onClick={onReset}>{k.reset}</Button>}
      </header>
      {intro && <p className="lb-intro">{intro}</p>}
      {!!tries?.length && <TryThis items={tries} />}
      {children}
      {takeaway && <p className="lb-takeaway"><Icon name="idea" size={18} /><span>{takeaway}</span></p>}
    </section>
  );
}

/** "Try this": one to three things to do in the app, and what to notice. LabShell shows it under the intro; the original
 *  five AI apps (design-system components with their own frame) show it above their card. */
export function TryThis({ items }: { items: ReactNode[] }) {
  const k = useKit();
  return <div className="lb-try"><strong>{k.tryThis}</strong><ol className="lb-try-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ol></div>;
}
