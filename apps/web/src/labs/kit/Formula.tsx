/**
 * A left-to-right line of maths. Every number and operator gets its own isolate: Arabic-Indic digits separated by
 * spaces or operators would otherwise be reordered right to left inside an Arabic page. Numbers lose their direction
 * marks (`ltrNum`), so an Arabic negative reads "-٠٫٤", minus first, like the English.
 */
export function Formula({ parts, label }: { parts: (string | number)[]; label?: string }) {
  return (
    <p className="lb-mono" dir="ltr" aria-label={label}>
      {parts.flatMap((t, i) => [...(i ? [" "] : []), <bdi key={i}>{typeof t === "string" ? ltrNum(t) : t}</bdi>])}
    </p>
  );
}

/**
 * A formatted number for a left-to-right line (a formula, a chart, a table of weights). Intl writes an Arabic negative
 * with an Arabic letter mark (U+061C) before the minus, and older data with a right-to-left mark (U+200F): either turns
 * the number right to left wherever it stands, so a left-to-right formula shows "٠٫٤-". Without the marks the minus
 * follows its line: first in a left-to-right line, and still on the right (read first) in Arabic text.
 */
export const ltrNum = (s: string) => s.replace(/[\u061C\u200E\u200F]/g, "");

/**
 * A number for a maths line, rounded to `digits` decimals, with a real minus sign (U+2212) and no direction marks.
 * The sign is taken after rounding, so a tiny negative shows as 0, not "-0".
 */
export function signed(num: (n: number, o?: Intl.NumberFormatOptions) => string, v: number, digits = 2): string {
  const f = 10 ** digits, r = Math.round(v * f) / f;
  return (r < 0 ? "−" : "") + num(Math.abs(r));
}
