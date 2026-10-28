import type { ReactNode } from "react";
import { Button, Icon, Mark, cx, type IconName } from "./primitives";
import { dirFor } from "../locale";

export interface AppBarProps { title: ReactNode; onBack?: () => void; backLabel?: string; actions?: ReactNode; floating?: boolean; }
export function AppBar({ title, onBack, backLabel = "Back", actions, floating }: AppBarProps) {
  return (
    <header className={cx("dr-appbar", floating && "dr-floating-top")}>
      {onBack ? <Button variant="ghost" iconOnly icon="back" onClick={onBack}>{backLabel}</Button> : <span className="dr-appbar-brand"><Mark size={32} /></span>}
      <h1 className="dr-appbar-title">{title}</h1>
      <div className="dr-appbar-actions">{actions}</div>
    </header>
  );
}

export interface BottomNavItem { icon: IconName; label: string; href?: string; active?: boolean; badge?: string; onClick?: () => void; }
export interface BottomNavProps { items: BottomNavItem[]; label?: string; floating?: boolean; }
/** 3–5 destinations, icon + label always. */
export function BottomNav({ items, label = "Main", floating }: BottomNavProps) {
  return (
    <nav className={cx("dr-bottomnav", floating && "dr-floating-bottom")} aria-label={label}>
      {items.map((it, i) => (
        <a key={i} href={it.href ?? "#"} onClick={it.onClick} className={cx("dr-bottomnav-item", it.active && "is-active")} aria-current={it.active ? "page" : undefined}>
          <span className="dr-bottomnav-icon"><Icon name={it.icon} />{it.badge && <span className="dr-bottomnav-badge">{it.badge}</span>}</span>
          <span className="dr-bottomnav-label">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}

export interface StreakCounterProps { count: string; label?: string; done?: number; days?: number; compact?: boolean; }
/** Streaks count teaching weeks, not days. */
export function StreakCounter({ count, label, done = 0, days = 7, compact }: StreakCounterProps) {
  if (compact) return <span className="dr-streak-compact" aria-label={label ? `${count} · ${label}` : count}><Icon name="streak" size={20} /><span>{count}</span></span>;
  return (
    <div className="dr-streak">
      <span className="dr-streak-flame"><Icon name="streak" /></span>
      <span className="dr-streak-num">{count}</span>
      <span className="dr-streak-label">{label}</span>
      <span className="dr-streak-dots" aria-hidden>{Array.from({ length: days }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}</span>
    </div>
  );
}

export interface PhoneFrameProps { caption?: string; dir?: "ltr" | "rtl"; lang?: string; children: ReactNode; }
/** 340×680 phone outline for docs and prototypes. */
export function PhoneFrame({ caption, dir, lang, children }: PhoneFrameProps) {
  return (
    <figure className="dr-phone-wrap">
      <div className="dr-phone" dir={dir} lang={lang}>{children}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export interface DarsiRootProps { lang?: string; dir?: "ltr" | "rtl"; theme?: "light" | "sunlight"; className?: string; children: ReactNode; }
/** Scopes theme, language and direction to a subtree (use applyLocale() for the whole page). */
export function DarsiRoot({ lang = "en", dir, theme = "light", className, children }: DarsiRootProps) {
  return <div className={className} lang={lang} dir={dir ?? dirFor(lang)} data-theme={theme}>{children}</div>;
}
