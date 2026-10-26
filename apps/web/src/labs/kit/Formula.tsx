/**
 * A left-to-right line of maths. Every number and operator gets its own isolate: Arabic-Indic digits separated by
 * spaces or operators would otherwise be reordered right to left inside an Arabic page.
 */
export function Formula({ parts, label }: { parts: (string | number)[]; label?: string }) {
  return (
    <p className="lb-mono" dir="ltr" aria-label={label}>
      {parts.flatMap((t, i) => [...(i ? [" "] : []), <bdi key={i}>{t}</bdi>])}
    </p>
  );
}
