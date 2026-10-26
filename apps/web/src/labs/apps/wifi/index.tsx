import { useEffect, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { leaksPassword, seen, type Action, type Conn } from "./model";

const S = {
  en: {
    intro: "You're on the café's free Wi-Fi, “Cafe_Free_WiFi”. Whoever runs it (or a stranger running a fake hotspot with the same name) can watch the traffic. Do three things and look at their screen.",
    conn: "How you connect", http: "http:// (no padlock)", https: "https:// (padlock)", vpn: "https:// + VPN",
    do: "What you do", act: { news: "Read the sports news", login: "Sign in to the school portal", search: "Search for a medicine" } as Record<Action, string>,
    you: "Your phone", them: "What the hotspot owner sees",
    what: { site: "Website", page: "Page", typed: "What you typed", size: "Data", tunnel: "All traffic goes to" } as Record<string, string>, kb: (n: string) => `${n} KB`, scrambled: "scrambled",
    pwLeak: "They can read your password. Anyone on this network can now sign in as you.", allVisible: "Everything is readable: the full page address, what you searched for, and the page itself.", pwSafe: "Your password and pages are scrambled; they can only see which sites you visit and how much data.", vpnNote: "Even the site names are hidden from the café. But now the VPN company can see them, so choose one you trust.",
    tips: "Look for the padlock and https:// before typing anything. Be wary of open networks with tempting names, and use mobile data for banking if you can.",
    takeaway: "On shared networks, assume someone is watching. HTTPS (the padlock) protects what you read and type; a VPN hides where you go from the local network. Neither helps if you type your password into a fake site.",
  },
  ar: {
    intro: "أنت متصل بشبكة المقهى المجانية «Cafe_Free_WiFi». من يديرها (أو غريب يشغّل نقطة مزيّفة بالاسم نفسه) يستطيع مراقبة البيانات. افعل ثلاثة أشياء وانظر إلى شاشته.",
    conn: "طريقة الاتصال", http: "http://‎ (بلا قفل)", https: "https://‎ (بقفل)", vpn: "https://‎ مع VPN",
    do: "ماذا تفعل", act: { news: "اقرأ الأخبار الرياضية", login: "ادخل إلى بوابة المدرسة", search: "ابحث عن دواء" } as Record<Action, string>,
    you: "هاتفك", them: "ما يراه صاحب الشبكة",
    what: { site: "الموقع", page: "الصفحة", typed: "ما كتبته", size: "البيانات", tunnel: "كل البيانات تذهب إلى" } as Record<string, string>, kb: (n: string) => `${n} كيلوبايت`, scrambled: "مشفّر",
    pwLeak: "يستطيعون قراءة كلمة مرورك. أي أحد على هذه الشبكة يستطيع الآن الدخول باسمك.", allVisible: "كل شيء مقروء: عنوان الصفحة كاملًا، وما بحثت عنه، والصفحة نفسها.", pwSafe: "كلمة مرورك وصفحاتك مشفّرة؛ لا يرون إلا المواقع التي تزورها وكمية البيانات.", vpnNote: "حتى أسماء المواقع مخفية عن المقهى. لكن شركة VPN تستطيع الآن رؤيتها، فاختر شركة تثق بها.",
    tips: "ابحث عن القفل و‎https://‎ قبل أن تكتب أي شيء. واحذر الشبكات المفتوحة ذات الأسماء المغرية، واستعمل بيانات الهاتف للمعاملات المالية إن استطعت.",
    takeaway: "على الشبكات المشتركة افترض أن أحدًا يراقب. يحمي HTTPS (القفل) ما تقرؤه وتكتبه، ويخفي VPN وجهتك عن الشبكة المحلية. ولا يفيد أيٌّ منهما إن كتبت كلمة مرورك في موقع مزيّف.",
  },
};

export default function Wifi({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [conn, setConn] = useState<Conn>("http");
  const [act, setAct] = useState<Action>("login");
  const [tried, setTried] = useState(() => new Set<Conn>(["http"]));
  useEffect(() => { if (tried.size >= 3) onDone?.(); }, [tried.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = seen(act, conn);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.conn} value={conn} options={[["http", s.http], ["https", s.https], ["vpn", s.vpn]]} onChange={(v) => { setConn(v); setTried((t) => new Set(t).add(v)); }} />
      <Segmented label={s.do} value={act} options={(["news", "login", "search"] as const).map((a) => [a, s.act[a]] as const)} onChange={setAct} />
      <div className="lb-two">
        <div className="lb-phone">
          <span className="lb-phone-head"><Icon name={conn === "http" ? "warning" : "lock"} size={16} /> {s.you}</span>
          <strong>{s.act[act]}</strong>
        </div>
        <div className="lb-snoop" aria-live="polite">
          <span className="lb-kicker">{s.them}</span>
          <dl>
            {lines.map((l, i) => (
              <div key={i}><dt>{s.what[l.what]}</dt><dd dir="ltr" className={l.hidden ? "is-hidden" : l.what === "typed" ? "is-leak" : undefined}>{l.what === "size" ? s.kb(num(Number(l.text))) : l.text}{l.hidden ? ` (${s.scrambled})` : ""}</dd></div>
            ))}
          </dl>
        </div>
      </div>
      <p className={leaksPassword(conn) ? "lb-verdict is-warn" : "lb-answer is-ok"}>{leaksPassword(conn) ? (act === "login" ? s.pwLeak : s.allVisible) : conn === "vpn" ? s.vpnNote : s.pwSafe}</p>
      <p className="lb-flags-one">{s.tips}</p>
    </LabShell>
  );
}
