/**
 * Counted words ("3 days", "٣ أيام", "١١ يومًا") using the language's own plural rules. Arabic has six forms:
 * zero, one, two, few (3–10), many (11–99) and other (100, 1000…). `{n}` in a form is replaced by the formatted number.
 */
import { useCallback } from "react";
import { useI18n } from "../../i18n";

export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function usePlural() {
  const { lang, num } = useI18n();
  return useCallback((n: number, forms: Forms, opts?: Intl.NumberFormatOptions) => {
    const rule = new Intl.PluralRules(lang).select(n);
    return (forms[rule] ?? forms.other).replace("{n}", num(n, opts));
  }, [lang, num]);
}
