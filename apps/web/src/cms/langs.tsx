/**
 * The languages the course editor shows for every text: English always (it is the fallback learners see), plus the
 * ones the author picks. The choice is kept per browser, and a unit's own languages are added when it opens, so nothing
 * already written is hidden.
 *
 * The author can also look at one language at a time (the language view): every form then shows only that language's
 * fields, and a language other than English shows the English under each field, to translate from.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Unit } from "../content/types";
import { languageOf } from "../i18n";

export interface EditLang { code: string; name: string; dir: "ltr" | "rtl" }
export const editLang = (code: string): EditLang => { const l = languageOf(code); return { code, name: l.native, dir: l.dir }; };

/** "all" shows every picked language side by side; a code shows that one only. */
export type LangView = "all" | string;
interface Value { langs: EditLang[]; shown: EditLang[]; view: LangView }
const fallback = [editLang("en"), editLang("ar")];
const Ctx = createContext<Value>({ langs: fallback, shown: fallback, view: "all" });
export function EditLangsProvider({ langs, view = "all", children }: { langs: readonly string[]; view?: LangView; children: ReactNode }) {
  const key = langs.join();
  const value = useMemo(() => {
    const all = ["en", ...langs.filter((l) => l !== "en")].map(editLang);
    const one = all.find((l) => l.code === view);
    return { langs: all, shown: one ? [one] : all, view: one ? one.code : "all" };
  }, [key, view]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/** The languages whose fields are on screen: English first, then the picked ones (or the one being viewed). */
export const useEditLangs = () => useContext(Ctx).shown;
/** The language view, and the English to show for reference when one other language is viewed. */
export function useLangView() {
  const v = useContext(Ctx);
  return { view: v.view, all: v.langs, reference: v.view !== "all" && v.view !== "en" ? v.langs[0] : null };
}

const KEY = "darsi:editLangs";
export function savedEditLangs(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : ["ar"]; }
  catch { return ["ar"]; }
}
export const saveEditLangs = (langs: readonly string[]) => { try { localStorage.setItem(KEY, JSON.stringify(langs)); } catch { /* private mode */ } };

const VIEW_KEY = "darsi:editView";
/**
 * Remembered per browser; phones start with one language (two columns of fields don't fit): the interface's, when the
 * editor shows it, else English. Wide screens start with all of them side by side.
 */
export function savedLangView(ui = "en"): LangView {
  try { const v = localStorage.getItem(VIEW_KEY); if (v) return v; } catch { /* private mode */ }
  if (typeof matchMedia !== "function" || matchMedia("(min-width: 900px)").matches) return "all";
  return ui === "en" || savedEditLangs().includes(ui) ? ui : "en";
}
export const saveLangView = (v: LangView) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

/** The languages besides English a unit already has text in (its title, summary and lesson titles). */
export const langsIn = (u: Unit) =>
  [...new Set([u.title, u.summary, ...u.lessons.map((l) => l.title)].flatMap((x) => Object.keys(x ?? {}).filter((k) => k !== "en" && (x?.[k] ?? "").trim() !== "")))];
