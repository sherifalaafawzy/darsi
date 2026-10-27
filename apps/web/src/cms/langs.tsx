/**
 * The languages the course editor shows for every text: English always (it is the fallback learners see), plus the
 * ones the author picks. The choice is kept per browser, and a unit's own languages are added when it opens, so nothing
 * already written is hidden.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Unit } from "../content/types";
import { languageOf } from "../i18n";

export interface EditLang { code: string; name: string; dir: "ltr" | "rtl" }
export const editLang = (code: string): EditLang => { const l = languageOf(code); return { code, name: l.native, dir: l.dir }; };

const Ctx = createContext<EditLang[]>([editLang("en"), editLang("ar")]);
export function EditLangsProvider({ langs, children }: { langs: readonly string[]; children: ReactNode }) {
  const key = langs.join();
  const value = useMemo(() => ["en", ...langs.filter((l) => l !== "en")].map(editLang), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/** English first, then the picked languages. */
export const useEditLangs = () => useContext(Ctx);

const KEY = "darsi:editLangs";
export function savedEditLangs(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : ["ar"]; }
  catch { return ["ar"]; }
}
export const saveEditLangs = (langs: readonly string[]) => { try { localStorage.setItem(KEY, JSON.stringify(langs)); } catch { /* private mode */ } };
/** The languages besides English a unit already has text in (its title, summary and lesson titles). */
export const langsIn = (u: Unit) =>
  [...new Set([u.title, u.summary, ...u.lessons.map((l) => l.title)].flatMap((x) => Object.keys(x ?? {}).filter((k) => k !== "en" && (x?.[k] ?? "").trim() !== "")))];
