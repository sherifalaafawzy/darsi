import { useEffect, useState } from "react";
import { Button, TextField } from "@darsi/design-system";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { call } from "../fb";
import { useI18n } from "../i18n";
import { CAPSTONE_BOUNDS, CAPSTONE_DEFAULTS, type CapstoneConfig } from "../content/capstone";
import { message, Note, type Msg } from "./Super";
import "./strings";

type Limit = keyof typeof CAPSTONE_BOUNDS;
const LIMITS: { k: Limit; label: "sp.capPerDay" | "sp.capMaxPerDay" | "sp.capCallsPerDay" }[] = [
  { k: "perDay", label: "sp.capPerDay" }, { k: "maxPerDay", label: "sp.capMaxPerDay" }, { k: "callsPerDay", label: "sp.capCallsPerDay" },
];
const save = call<Partial<CapstoneConfig>, CapstoneConfig>("saveCapstoneConfig");

/**
 * On /super/plans (platform admins): AI reviews of capstone milestones on or off, and their daily limits
 * (config/capstone, changed only through saveCapstoneConfig; TECHNICAL.md "Capstones"), with today's reviews and their
 * cost (analytics/{day}.capstone). Read once when the page opens, never listened to.
 */
export function CapstoneSettings() {
  const { t, num } = useI18n();
  const [cfg, setCfg] = useState<CapstoneConfig | null>(null);
  const [form, setForm] = useState<Record<Limit, string>>({ perDay: "", maxPerDay: "", callsPerDay: "" });
  const [today, setToday] = useState<{ reviews?: number; usd?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const show = (c: CapstoneConfig) => { setCfg(c); setForm({ perDay: String(c.perDay), maxPerDay: String(c.maxPerDay), callsPerDay: String(c.callsPerDay) }); };
  useEffect(() => {
    let live = true;
    const day = new Date().toISOString().slice(0, 10);
    Promise.all([getDoc(doc(db, "config", "capstone")), getDoc(doc(db, "analytics", day))]).then(([c, a]) => {
      if (!live) return;
      show({ ...CAPSTONE_DEFAULTS, ...(c.data() as Partial<CapstoneConfig> | undefined) });
      setToday((a.get("capstone") as { reviews?: number; usd?: number } | undefined) ?? {});
    }, (e: unknown) => { if (live) setMsg({ ok: false, text: message(e) }); });
    return () => { live = false; };
  }, []);
  const run = async (patch: Partial<CapstoneConfig>, ok: string) => {
    setBusy(true); setMsg(null);
    try { show(await save(patch)); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  // The numbers saveCapstoneConfig accepts; anything else can't be saved, and the field says what can.
  const value = (k: Limit) => { const v = Number(form[k]), [lo, hi] = CAPSTONE_BOUNDS[k]; return form[k].trim() !== "" && Number.isInteger(v) && v >= lo && v <= hi ? v : null; };
  const limits = { perDay: value("perDay"), maxPerDay: value("maxPerDay"), callsPerDay: value("callsPerDay") };
  const valid = LIMITS.every(({ k }) => limits[k] !== null);
  return (
    <section className="panel stack" aria-labelledby="cap-h"><h3 id="cap-h">{t("sp.capTitle")}</h3>
      {cfg && <>
        <p className={cfg.ai ? "notice ok" : "notice"} role="status">{t(cfg.ai ? "sp.capOn" : "sp.capOff")}</p>
        <div><Button variant={cfg.ai ? "secondary" : "primary"} icon={cfg.ai ? "close" : "check"} loading={busy} onClick={() => { void run({ ai: !cfg.ai }, t(cfg.ai ? "sp.capTurnedOff" : "sp.capTurnedOn")); }}>{t(cfg.ai ? "sp.capTurnOff" : "sp.capTurnOn")}</Button></div>
        <div className="form-grid">
          {LIMITS.map(({ k, label }) => (
            <TextField key={k} label={t(label)} type="number" inputMode="numeric" min={CAPSTONE_BOUNDS[k][0]} max={CAPSTONE_BOUNDS[k][1]} step={1} dir="ltr"
              value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              hint={limits[k] === null ? undefined : t("sp.capRange", { lo: CAPSTONE_BOUNDS[k][0], hi: CAPSTONE_BOUNDS[k][1] })}
              error={limits[k] === null ? t("sp.capRange", { lo: CAPSTONE_BOUNDS[k][0], hi: CAPSTONE_BOUNDS[k][1] }) : undefined} />
          ))}
        </div>
        {today && <p className="muted small">{t("sp.capToday", { n: today.reviews ?? 0, usd: num(today.usd ?? 0, { style: "currency", currency: "USD", maximumFractionDigits: 3 }) })}</p>}
        <div><Button loading={busy} disabled={!valid} onClick={() => { if (valid) void run({ perDay: limits.perDay!, maxPerDay: limits.maxPerDay!, callsPerDay: limits.callsPerDay! }, t("sp.capSaved")); }}>{t("sp.capSave")}</Button></div>
      </>}
      <Note msg={msg} />
    </section>
  );
}
