/**
 * Per-app strings. Each app keeps its own English and Arabic text inside its chunk (not in the app's main dictionaries),
 * so learners download a lab's words only when they open it. Arabic falls back to English key by key.
 */
import { useI18n } from "../../i18n";

export interface Strings<T> { en: T; ar: { [K in keyof T]?: T[K] } }
export function useS<T extends object>(s: Strings<T>): T {
  const { lang } = useI18n();
  return lang === "ar" ? ({ ...s.en, ...s.ar } as T) : s.en;
}

/** Words every lab uses (controls, outcomes). */
export const KIT = {
  en: {
    run: "Run", pause: "Pause", step: "One step", reset: "Start again", train: "Train", test: "Test", stop: "Stop",
    loss: "Error", epoch: "Round", accuracy: "Accuracy", takeaway: "Takeaway", tryIt: "Try it", tryThis: "Try this",
    drawHint: "Draw with your finger or mouse. Keyboard: arrows move, Space paints.", clear: "Clear", yes: "Yes", no: "No",
    // A chart's sliders for choosing a spot without tapping (Plot).
    pickOpen: "Choose a spot with sliders", pickX: "Across, left to right", pickY: "Up, bottom to top", pickNext: "Next point", pickHere: "Choose this spot",
  },
  ar: {
    run: "شغّل", pause: "أوقف مؤقتًا", step: "خطوة واحدة", reset: "ابدأ من جديد", train: "درّب", test: "اختبر", stop: "أوقف",
    loss: "الخطأ", epoch: "الجولة", accuracy: "الدقة", takeaway: "الخلاصة", tryIt: "جرّب", tryThis: "جرّب هذا",
    drawHint: "ارسم بإصبعك أو بالفأرة. لوحة المفاتيح: الأسهم للتحريك، والمسافة للتلوين.", clear: "امسح", yes: "نعم", no: "لا",
    pickOpen: "اختر مكانًا بالمنزلقات", pickX: "أفقيًا، من اليسار إلى اليمين", pickY: "رأسيًا، من الأسفل إلى الأعلى", pickNext: "النقطة التالية", pickHere: "اختر هذا المكان",
  },
};
export const useKit = () => useS(KIT);
