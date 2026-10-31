/**
 * Which of the four models this phone should load. A missing language folder falls back:
 * the labs to the shipped bilingual app model, the tutor to the mixed teaching model.
 */
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { TEACH_FALLBACK, TINYLM_BASE, appBase, fetchManifest, teachBase } from "./index";

function useFolder(primary: string, fallback: string): string {
  const [base, setBase] = useState(fallback);
  useEffect(() => {
    let live = true;
    fetchManifest(primary).then(() => { if (live) setBase(primary); }).catch(() => { if (live) setBase(fallback); });
    return () => { live = false; };
  }, [primary, fallback]);
  return base;
}

/** The text-and-tool model for the labs, in the language on screen. */
export function useAppBase(): string {
  const { lang } = useI18n();
  return useFolder(appBase(lang === "ar" ? "ar" : "en"), TINYLM_BASE);
}

/** The teaching model for live scenes, in the language on screen. */
export function useTeachBase(): string {
  const { lang } = useI18n();
  return useFolder(teachBase(lang === "ar" ? "ar" : "en"), TEACH_FALLBACK);
}
