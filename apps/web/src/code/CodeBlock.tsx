/**
 * Code to read: always left to right, in the phone's own monospace font, lightly coloured, with line numbers when
 * asked. Questions show their \`snippet\` with it; the code steps (CodeSteps.tsx) use it too. Startup-safe.
 */
import type { CodeLang } from "../content/types";
import { tokens } from "./highlight";

export function CodeLine({ text, lang }: { text: string; lang: CodeLang }) {
  return <>{tokens(text, lang).map((t, i) => (t.kind ? <span key={i} className={`cb-${t.kind}`}>{t.text}</span> : t.text))}</>;
}

export function CodeBlock({ text, lang, numbers, mark, label }: { text: string; lang: CodeLang; numbers?: boolean; mark?: number; label?: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <pre className="code-block" dir="ltr" translate="no" aria-label={label} tabIndex={0}>
      <code>{lines.map((line, i) => (
        <span key={i} className={mark === i + 1 ? "cb-line is-marked" : "cb-line"}>
          {numbers && <span className="cb-n" aria-hidden>{i + 1}</span>}<CodeLine text={line} lang={lang} />
        </span>
      ))}</code>
    </pre>
  );
}
