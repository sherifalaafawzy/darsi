/**
 * Staff screens' strings (admin, the course editor) in an added language: fetched when a staff chunk registers its area
 * and whenever the page language changes, from public/content/i18n-staff/<lang>/<area>.json (keyed like en.json).
 * English and Arabic ship inside those chunks; learners never load either, nor this file (it is outside startup). It
 * follows the page language through <html lang> (applyLocale sets it), so startup needs no hook for it.
 */
import { addMessages } from "../i18n";

const areas = new Set<string>();
const pageLang = () => document.documentElement.lang || "en";
const tried = new Set<string>();
function load(lang: string, area: string) {
  const key = `${lang}/${area}`;
  if (lang === "en" || lang === "ar" || tried.has(key) || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang)) return;
  tried.add(key);
  fetch(`/content/i18n-staff/${key}.json`)
    .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<Record<string, string>> : null))
    .then((d) => { if (d) addMessages({ [lang]: d }); })
    .catch(() => { tried.delete(key); });
}
/** Called by a staff chunk when it loads ("admin", "cms"). */
export function addStaffArea(area: string) {
  if (areas.has(area)) return;
  areas.add(area);
  if (areas.size === 1) new MutationObserver(() => areas.forEach((a) => load(pageLang(), a))).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  load(pageLang(), area);
}
