/**
 * A stand-in for Paymob (EGP) and Stripe (USD) on http://127.0.0.1:4799, for `npm run local`: the functions emulator
 * talks to it instead of the real providers (functions/.env.local: PAYMOB_BASE and STRIPE_BASE). Its checkout page has
 * Pay and Cancel; Pay sends the emulator's webhook a callback signed like the real one (functions/.secret.local's test
 * secrets), so a purchase runs end to end with no money and no provider account.
 */
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const id = (p) => `${p}_${randomBytes(8).toString("hex")}`;
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem}button{font:inherit;padding:.7rem 1.4rem;margin-inline-end:.5rem}p.t{color:#a33}</style>
<p class="t">Local test payment: no money moves.</p>${body}`;

/** Reads KEY=value lines (functions/.secret.local). */
const readEnv = (file) => Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

/** Stripe's form encoding back into an object (line_items[0][price_data][unit_amount]=…). */
function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const keys = k.split(/\[|\]\[|\]/).filter(Boolean);
    let o = out;
    keys.slice(0, -1).forEach((key) => { o = o[key] ??= {}; });
    o[keys.at(-1)] = v;
  }
  return out;
}

export async function startPayments({ secrets, functionsUrl, paymobHmac }) {
  const s = readEnv(secrets);
  const paymob = new Map(), sessions = new Map(), invoices = new Map(), transactions = new Map();
  const post = (url, body, headers) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body }).then(async (r) => `${r.status} ${await r.text()}`);

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", async () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      const html = (text) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(text); };
      const go = (to) => { res.writeHead(303, { Location: to }); res.end(); };
      try {
        // Paymob: the intention, its checkout page, and the signed "transaction processed" callback.
        if (req.method === "POST" && url.pathname === "/v1/intention/") {
          const b = JSON.parse(raw), secret = id("csec");
          paymob.set(secret, { ...b, id: id("int"), order: Math.floor(Math.random() * 1e9) });
          // Like Paymob's: the intention's order id, which its callbacks sign (the functions match payments through it).
          return json(201, { id: paymob.get(secret).id, client_secret: secret, intention_order_id: paymob.get(secret).order });
        }
        if (url.pathname === "/unifiedcheckout/") {
          const p = paymob.get(url.searchParams.get("clientSecret") ?? "");
          if (!p) return html(page("Paymob", "<p>This checkout has expired.</p>"));
          return html(page("Paymob (test)", `<h1>Paymob</h1><p>${p.items?.[0]?.name ?? "Darsi"}: <strong>${(p.amount / 100).toFixed(2)} EGP</strong></p>
<form method="post" action="/paymob/pay"><input type="hidden" name="s" value="${url.searchParams.get("clientSecret")}"><button>Pay</button><button name="cancel" value="1">Cancel</button></form>`));
        }
        if (req.method === "POST" && url.pathname === "/paymob/pay") {
          const f = new URLSearchParams(raw), p = paymob.get(f.get("s") ?? "");
          if (!p) return html(page("Paymob", "<p>This checkout has expired.</p>"));
          if (f.get("cancel")) return go(p.redirection_url.replace(/\?.*/, "?from=cancel"));
          const obj = { id: Math.floor(Math.random() * 1e9), amount_cents: p.amount, created_at: new Date().toISOString(), currency: "EGP", error_occured: false, has_parent_transaction: false,
            integration_id: p.payment_methods?.[0] ?? 0, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false,
            order: { id: p.order, merchant_order_id: p.special_reference }, owner: 1, pending: false, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true };
          transactions.set(String(obj.id), obj);
          console.log(`  payments: Paymob → ${await post(`${functionsUrl}/paymobWebhook?hmac=${paymobHmac(obj, s.PAYMOB_HMAC_SECRET)}`, JSON.stringify({ type: "TRANSACTION", obj }))}`);
          paymob.delete(f.get("s"));
          return go(p.redirection_url);
        }
        // Paymob's transaction inquiry: the webhook asks it before it believes a refund that names its original.
        const tm = req.method === "GET" && url.pathname.match(/^\/api\/acceptance\/transactions\/(\d+)$/);
        if (tm) { const t = transactions.get(tm[1]); return t ? json(200, t) : json(404, { detail: "Not found." }); }
        // Stripe: checkout sessions, their page, the signed event, and reading sessions and invoices back.
        if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
          const b = parseForm(raw), li = b.line_items?.["0"] ?? {}, total = Number(li.price_data?.unit_amount ?? 0) * Number(li.quantity ?? 1);
          const sid = id("cs_test");
          sessions.set(sid, { id: sid, object: "checkout.session", client_reference_id: b.client_reference_id, mode: b.mode, payment_status: "unpaid", payment_intent: null, invoice: null, subscription: null,
            amount_total: total, currency: li.price_data?.currency ?? "usd", success_url: b.success_url, cancel_url: b.cancel_url, name: li.price_data?.product_data?.name ?? "Darsi" });
          return json(200, { id: sid, url: `http://127.0.0.1:4799/stripe/${sid}` });
        }
        const sm = req.method === "GET" && url.pathname.match(/^\/stripe\/(cs_test_[0-9a-f]+)$/);
        if (sm) {
          const c = sessions.get(sm[1]);
          if (!c) return html(page("Stripe", "<p>This checkout has expired.</p>"));
          return html(page("Stripe (test)", `<h1>Stripe</h1><p>${c.name}: <strong>${(c.amount_total / 100).toFixed(2)} USD</strong></p>
<form method="post"><button>Pay</button><button name="cancel" value="1">Cancel</button></form>`));
        }
        const pm = req.method === "POST" && url.pathname.match(/^\/stripe\/(cs_test_[0-9a-f]+)$/);
        if (pm) {
          const c = sessions.get(pm[1]);
          if (new URLSearchParams(raw).get("cancel")) return go(c.cancel_url);
          c.payment_status = "paid"; c.payment_intent = id("pi");
          if (c.mode === "subscription") {
            c.subscription = id("sub"); c.invoice = id("in");
            invoices.set(c.invoice, { id: c.invoice, subscription: c.subscription, payment_intent: c.payment_intent, billing_reason: "subscription_create", amount_paid: c.amount_total, currency: c.currency });
          }
          const body = JSON.stringify({ id: id("evt"), type: "checkout.session.completed", data: { object: { id: c.id } } }), t = Math.floor(Date.now() / 1000);
          const sig = `t=${t},v1=${createHmac("sha256", s.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex")}`;
          console.log(`  payments: Stripe → ${await post(`${functionsUrl}/stripeWebhook`, body, { "Stripe-Signature": sig })}`);
          return go(c.success_url);
        }
        const get = req.method === "GET" && url.pathname.match(/^\/v1\/(checkout\/sessions|invoices)\/([^/?]+)/);
        if (get) { const o = (get[1] === "invoices" ? invoices : sessions).get(get[2]); return o ? json(200, o) : json(404, { error: { message: "No such object" } }); }
        json(404, { error: { message: `The local stand-in has no ${req.method} ${url.pathname}` } });
      } catch (e) { json(500, { error: { message: String(e) } }); }
    });
  });
  await new Promise((ok, fail) => server.once("error", fail).listen(4799, "127.0.0.1", ok));
  return server;
}
