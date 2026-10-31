/**
 * Light colouring for Python and SQL: keywords, built-in functions, strings, numbers and comments, one line at a time.
 * Enough to read code on a small screen; not a parser. Startup-safe (no imports).
 */
import type { CodeLang } from "../content/types";

export type TokenKind = "kw" | "fn" | "str" | "num" | "com";
export interface Token { text: string; kind?: TokenKind }

const PY_KW = new Set("and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(" "));
const PY_FN = new Set("print input range len int str float list dict set tuple abs min max sum round sorted enumerate zip open bool type".split(" "));
const SQL_KW = new Set(("select from where group by order having insert into values update set delete create table primary key integer text real "
  + "join left right inner outer on as and or not null distinct limit asc desc like in is between case when then else end union all exists default references foreign").split(" "));
const SQL_FN = new Set("count sum avg min max round length upper lower substr coalesce abs date strftime".split(" "));

const PY = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g;
const SQL = /(--.*$)|('(?:[^']|'')*'?|"[^"]*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g;

export function tokens(line: string, lang: CodeLang): Token[] {
  const out: Token[] = [];
  const re = new RegExp(lang === "sql" ? SQL : PY);
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const [text, com, str, num, word] = m;
    const kind: TokenKind | undefined = com ? "com" : str ? "str" : num ? "num"
      : word ? (lang === "sql" ? (SQL_KW.has(word.toLowerCase()) ? "kw" : SQL_FN.has(word.toLowerCase()) ? "fn" : undefined) : PY_KW.has(word) ? "kw" : PY_FN.has(word) ? "fn" : undefined)
      : undefined;
    const last = out[out.length - 1];
    if (!kind && last && !last.kind) last.text += text; else out.push(kind ? { text, kind } : { text });
    if (!text) break;
  }
  return out;
}
