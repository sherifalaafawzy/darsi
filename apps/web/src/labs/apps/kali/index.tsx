import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { storage } from "../../../platform";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { complete, exec, MISSIONS, pacing, TARGET, tokenize, type ExecResult, type Line, type MissionId } from "./model";

/** Per-device acknowledgement of the legal disclaimer (IndexedDB via the platform layer, like other labs). */
const ACK_KEY = "lab:kali:legal-ack";

const S = {
  en: {
    intro:
      "A safe, offline Kali Linux terminal. Everything you type runs against one fictional practice target — " +
      TARGET.domain + " on " + TARGET.net + " — and nothing real is ever contacted. Work through the missions on the " +
      "side to go from first recon to finding the weak login and writing the fix.",
    try1: "Start with recon: run `whois darsi-lab.test` and `dig darsi-lab.test ANY` to see the domain and its subdomains.",
    try2: "Scan the host: `nmap -sV 10.10.14.20` lists the open ports and the exact service versions.",
    try3: "Find the weakness: `gobuster dir -u http://10.10.14.20 -w /usr/share/wordlists/rockyou-mini.txt`, then `hydra -l admin -P /usr/share/wordlists/rockyou-mini.txt ssh://10.10.14.20`.",
    takeaway:
      "A real test follows the same order: recon (who and what), scanning (which ports and services), enumeration " +
      "(what the app exposes), then the weakness. Here the weakness is a guessable password and an unsalted MD5 hash — " +
      "the fix is long unique passwords, hashing with bcrypt and a salt, and locking out repeated guesses.",
    legalHead: "Legal warning — read before you start",
    legalBody:
      "These tools and techniques are taught for education only. Only ever use them on systems you own or have explicit " +
      "written permission to test. Unauthorised scanning, access, password guessing or attacks are illegal in most " +
      "countries under computer-misuse and cybercrime laws, and can lead to fines, imprisonment and a criminal record — " +
      "wherever you are. Darsi accepts no responsibility for any misuse. Misusing what you learn here may also get your " +
      "Darsi account suspended.",
    ackCheck: "I understand, and I will only test systems I own or have explicit permission to test.",
    ackButton: "I understand — unlock the terminal",
    locked: "The terminal is locked. Read the legal warning above and accept it to start.",
    missions: "Missions",
    hints: "Type a command and press Enter. `help` lists commands, `man <tool>` explains one, Tab completes, ↑/↓ recall history, `clear` wipes the screen, Ctrl+C stops a running command.",
    reset: "Reset terminal",
    promptLabel: "Terminal input",
    m: {
      recon: { t: "1 · Recon", d: "Find the target's addresses and subdomains.", h: "whois / dig / nslookup / host / ping the domain." },
      scan: { t: "2 · Scanning", d: "Discover open ports and the services behind them.", h: "nmap -sV 10.10.14.20 (or -sn for a host sweep, nc for a banner)." },
      enum: { t: "3 · Enumeration", d: "See what the web app exposes.", h: "whatweb, curl -I, gobuster/dirb, nikto against the site." },
      weakness: { t: "4 · The weakness", d: "Find and prove the way in.", h: "hydra on the login, sqlmap on product.php?id=1, crack the hash with john/hashcat." },
      fix: { t: "5 · The fix", d: "Say how you would close it.", h: "Done once you have found the weak login — read the takeaway for the fix." },
    },
  },
  ar: {
    intro:
      "طرفية Kali Linux آمنة وتعمل دون إنترنت. كل ما تكتبه يُنفَّذ على هدف تدريبي خيالي واحد — " +
      TARGET.domain + " على الشبكة " + TARGET.net + " — ولا يُتَّصَل بأي نظام حقيقي أبدًا. اتبع المهام على الجانب " +
      "لتنتقل من الاستطلاع الأول إلى اكتشاف تسجيل الدخول الضعيف وكتابة الإصلاح.",
    try1: "ابدأ بالاستطلاع: شغّل `whois darsi-lab.test` و`dig darsi-lab.test ANY` لترى النطاق ونطاقاته الفرعية.",
    try2: "افحص المضيف: `nmap -sV 10.10.14.20` يسرد المنافذ المفتوحة وإصدارات الخدمات بدقّة.",
    try3: "اكتشف نقطة الضعف: `gobuster dir -u http://10.10.14.20 -w /usr/share/wordlists/rockyou-mini.txt`، ثم `hydra -l admin -P /usr/share/wordlists/rockyou-mini.txt ssh://10.10.14.20`.",
    takeaway:
      "الاختبار الحقيقي يتبع الترتيب نفسه: الاستطلاع (مَن وماذا)، ثم الفحص (أي المنافذ والخدمات)، ثم التعداد " +
      "(ماذا يكشف التطبيق)، ثم نقطة الضعف. هنا الضعف كلمة مرور يسهل تخمينها وبصمة MD5 بلا ملح — والإصلاح: كلمات مرور " +
      "طويلة وفريدة، وتعمية بـ bcrypt مع ملح، ومنع المحاولات المتكررة.",
    legalHead: "تحذير قانوني — اقرأه قبل أن تبدأ",
    legalBody:
      "تُدرَّس هذه الأدوات والأساليب لأغراض تعليمية فقط. لا تستخدمها إطلاقًا إلا على أنظمة تملكها أو لديك إذن مكتوب صريح " +
      "باختبارها. الفحص أو الوصول أو تخمين كلمات المرور أو الهجمات غير المصرّح بها مخالفة للقانون في معظم الدول بموجب " +
      "قوانين إساءة استخدام الحاسب والجرائم الإلكترونية، وقد تؤدّي إلى غرامات والسجن وسجلّ جنائي — أينما كنت. ولا تتحمّل " +
      "«درسي» أي مسؤولية عن أي إساءة استخدام. كما أن إساءة استخدام ما تتعلّمه هنا قد تؤدّي إلى تعليق حسابك في «درسي».",
    ackCheck: "أفهم ذلك، ولن أختبر إلا أنظمة أملكها أو لديّ إذن صريح باختبارها.",
    ackButton: "أفهم — افتح الطرفية",
    locked: "الطرفية مقفلة. اقرأ التحذير القانوني أعلاه ووافق عليه للبدء.",
    missions: "المهام",
    hints: "اكتب أمرًا واضغط Enter. `help` يسرد الأوامر، و`man <أداة>` يشرح أداة، وTab يُكمل، و↑/↓ يستعيدان السجل، و`clear` يمسح الشاشة، وCtrl+C يوقف أمرًا قيد التنفيذ.",
    reset: "إعادة الطرفية",
    promptLabel: "مُدخل الطرفية",
    m: {
      recon: { t: "١ · الاستطلاع", d: "اعثر على عناوين الهدف ونطاقاته الفرعية.", h: "whois / dig / nslookup / host / ping للنطاق." },
      scan: { t: "٢ · الفحص", d: "اكتشف المنافذ المفتوحة والخدمات خلفها.", h: "nmap -sV 10.10.14.20 (أو ‎-sn‎ لمسح المضيفين، nc لالتقاط اللافتة)." },
      enum: { t: "٣ · التعداد", d: "انظر ما يكشفه تطبيق الويب.", h: "whatweb وcurl -I وgobuster/dirb وnikto على الموقع." },
      weakness: { t: "٤ · نقطة الضعف", d: "اعثر على طريق الدخول وأثبته.", h: "hydra على تسجيل الدخول، sqlmap على product.php?id=1، وفك البصمة بـ john/hashcat." },
      fix: { t: "٥ · الإصلاح", d: "اذكر كيف ستغلق الثغرة.", h: "تكتمل بمجرد العثور على تسجيل الدخول الضعيف — اقرأ الخلاصة لمعرفة الإصلاح." },
    },
  },
};

interface Entry { prompt?: string; lines: Line[] }
/** A command whose output is still streaming in: `shown` lines of `lines` are visible so far. */
interface Pending { prompt: string; lines: Line[]; shown: number; res: ExecResult; initial: number; line: number; jitter: number }
const PROMPT = (cwd: string) => `kali@darsi:${cwd === "/root" ? "~" : cwd}$`;
/** Respect the OS "reduce motion" setting: when on, output is printed instantly rather than streamed. */
const reduceMotion = () => !!(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function Kali({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang } = useI18n();
  const [cwd, setCwd] = useState("/root");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histPos, setHistPos] = useState<number>(-1);
  const [done, setDone] = useState<Set<MissionId>>(() => new Set());
  const [accepted, setAccepted] = useState(false);
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const streaming = pending !== null;
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  // Legal MOTD: the terminal's first lines, like a real login banner.
  const banner = useMemo<Line[]>(() => [
    { text: "┌──(root㉿kali)-[~]  Darsi practice range — SIMULATED, offline", tone: "info" },
    { text: "** LEGAL: authorised testing only. Unauthorised access or scanning is a crime in most countries. **", tone: "warn" },
    { text: `└─ target: ${TARGET.domain} (${TARGET.ip})  ·  scope: ${TARGET.net}  ·  type 'help'`, tone: "dim" },
  ], []);

  // Load the saved acknowledgement once (per device), like the other labs load their saved state.
  useEffect(() => {
    let alive = true;
    storage.get<boolean>(ACK_KEY).then((v) => { if (alive && v) setAccepted(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Keep the newest output in view as it streams in.
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, pending]);
  // "The fix" mission completes once the weakness is found; the whole lab is done when every mission is.
  useEffect(() => {
    if (done.has("weakness") && !done.has("fix")) setDone((d) => new Set(d).add("fix"));
  }, [done]);
  useEffect(() => { if (MISSIONS.every((m) => done.has(m.id))) onDone?.(); }, [done, onDone]);

  const accept = () => { setAccepted(true); void storage.set(ACK_KEY, true).catch(() => {}); setTimeout(() => field.current?.focus(), 0); };

  /** Commit a finished command: keep its lines, move the cwd, and tick its missions — only once the output is complete. */
  const finalize = (prompt: string, res: ExecResult) => {
    setEntries((e) => [...e, { prompt, lines: res.lines }]);
    if (res.cwd) setCwd(res.cwd);
    if (res.hits.length) setDone((d) => { const n = new Set(d); for (const h of res.hits) n.add(h as MissionId); return n; });
  };

  // Reveal streaming output one line at a time; when the last line is shown, finalize it (and the mission ticks).
  useEffect(() => {
    if (!pending) return;
    if (pending.shown >= pending.lines.length) {
      finalize(pending.prompt, pending.res);
      setPending(null);
      setTimeout(() => field.current?.focus(), 0);
      return;
    }
    const base = pending.shown === 0 ? pending.initial : pending.line;
    const delay = base + Math.random() * pending.jitter;
    const id = window.setTimeout(() => setPending((p) => (p ? { ...p, shown: p.shown + 1 } : p)), delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Ctrl+C stops a running command: print ^C, drop the rest, hand back the prompt. The mission does not tick.
  useEffect(() => {
    if (!pending) return;
    const onInterrupt = (e: globalThis.KeyboardEvent) => {
      if ((e.key === "c" || e.key === "C") && e.ctrlKey) {
        e.preventDefault();
        setEntries((en) => [...en, { prompt: pending.prompt, lines: [...pending.lines.slice(0, pending.shown), { text: "^C", tone: "dim" }] }]);
        setPending(null);
        setTimeout(() => field.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onInterrupt);
    return () => window.removeEventListener("keydown", onInterrupt);
  }, [pending]);

  const submit = () => {
    if (streaming) return;
    const cmd = input;
    const res = exec(cmd, cwd);
    if (cmd.trim()) setHistory((h) => [...h, cmd]);
    setHistPos(-1);
    setInput("");
    if (res.clear) { setEntries([]); return; }
    const prompt = `${PROMPT(cwd)} ${cmd}`;
    const name = tokenize(cmd.trim())[0] || "";
    const pace = pacing(name);
    const instant = reduceMotion() || res.lines.length === 0 || (pace.initial === 0 && pace.line === 0);
    if (instant) { finalize(prompt, res); return; }
    setPending({ prompt, lines: res.lines, shown: 0, res, initial: pace.initial, line: pace.line, jitter: pace.jitter });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const pos = histPos < 0 ? history.length - 1 : Math.max(0, histPos - 1);
      setHistPos(pos); setInput(history[pos]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histPos < 0) return;
      const pos = histPos + 1;
      if (pos >= history.length) { setHistPos(-1); setInput(""); } else { setHistPos(pos); setInput(history[pos]); }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const opts = complete(input, cwd);
      if (opts.length === 1) {
        const parts = input.split(/\s+/); parts[parts.length - 1] = opts[0]; setInput(parts.join(" "));
      } else if (opts.length > 1) {
        setEntries((en) => [...en, { prompt: `${PROMPT(cwd)} ${input}`, lines: [{ text: opts.join("  "), tone: "dim" }] }]);
      }
    }
  };

  const reset = () => { setPending(null); setEntries([]); setInput(""); setHistory([]); setHistPos(-1); setCwd("/root"); setDone(new Set()); };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={accepted ? reset : undefined}>
      <section className="lb-kali-legal" role="note" aria-label={s.legalHead}>
        <div className="lb-kali-legal-head"><Icon name="warning" size={22} /><strong>{s.legalHead}</strong></div>
        <p className="lb-kali-legal-body">{s.legalBody}</p>
        {!accepted && (
          <div className="lb-kali-ack">
            <label className="lb-kali-ackrow">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>{s.ackCheck}</span>
            </label>
            <Button size="sm" icon="lock" disabled={!agree} onClick={accept}>{s.ackButton}</Button>
          </div>
        )}
      </section>

      <div className="lb-kali-wrap">
        <div className="lb-kali-term" dir="ltr" onClick={() => accepted && !streaming && field.current?.focus()}>
          <div className="lb-kali-scroll" ref={scroller} role="log" aria-live="polite" aria-label="terminal">
            {banner.map((l, i) => <div key={"b" + i} className={`lb-kali-line is-${l.tone || "out"}`}>{l.text}</div>)}
            {entries.map((en, i) => (
              <div key={i}>
                {en.prompt && <div className="lb-kali-line is-prompt">{en.prompt}</div>}
                {en.lines.map((l, j) => <div key={j} className={`lb-kali-line is-${l.tone || "out"}`}>{l.text || "\u00a0"}</div>)}
              </div>
            ))}
            {pending && (
              <div>
                <div className="lb-kali-line is-prompt">{pending.prompt}</div>
                {pending.lines.slice(0, pending.shown).map((l, j) => <div key={j} className={`lb-kali-line is-${l.tone || "out"}`}>{l.text || "\u00a0"}</div>)}
              </div>
            )}
          </div>
          {accepted ? (
            <div className="lb-kali-input">
              <span className="lb-kali-ps1" aria-hidden>{PROMPT(cwd)}</span>
              <input
                ref={field}
                className="lb-kali-field"
                dir="ltr"
                value={input}
                aria-label={s.promptLabel}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                translate="no"
                disabled={streaming}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
              />
              {!streaming && <span className="lb-kali-cursor" aria-hidden />}
            </div>
          ) : (
            <div className="lb-kali-input lb-kali-input-locked">
              <span className="lb-kali-ps1" aria-hidden>{PROMPT(cwd)}</span>
              <input className="lb-kali-field" dir="ltr" value="" aria-label={s.promptLabel} disabled readOnly />
            </div>
          )}
        </div>

        <aside className="lb-kali-missions" dir={lang === "ar" ? "rtl" : "ltr"}>
          {!accepted && <p className="lb-kali-locked"><Icon name="lock" size={16} /><span>{s.locked}</span></p>}
          <strong className="lb-kali-mtitle">{s.missions}</strong>
          <ol className="lb-kali-mlist">
            {MISSIONS.map((m) => {
              const ok = done.has(m.id);
              const info = s.m[m.id];
              return (
                <li key={m.id} className={ok ? "lb-kali-m is-done" : "lb-kali-m"}>
                  <span className="lb-kali-mcheck" aria-hidden>{ok ? "✔" : "○"}</span>
                  <div>
                    <span className="lb-kali-mname">{info.t}</span>
                    <span className="lb-kali-mdesc">{info.d}</span>
                    <span className="lb-kali-mhint" dir="ltr">{info.h}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="lb-note">{s.hints}</p>
        </aside>
      </div>
    </LabShell>
  );
}
