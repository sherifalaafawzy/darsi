import type { ReactNode } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../i18n";
import { categoryOf } from "../categories";
import type { LabMeta } from "../types";
import { useKit } from "./strings";
import "../../styles/lab-kit.css";

/** Every lab's frame: track colour and icon, its shelf as the kicker, title, a short intro, the app, and the takeaway. */
export function LabShell({ meta, intro, takeaway, onReset, children }: { meta: LabMeta; intro?: ReactNode; takeaway?: ReactNode; onReset?: () => void; children: ReactNode }) {
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
      {children}
      {takeaway && <p className="lb-takeaway"><Icon name="idea" size={18} /><span>{takeaway}</span></p>}
    </section>
  );
}
