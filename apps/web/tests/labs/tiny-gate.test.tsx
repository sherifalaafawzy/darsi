// The Darsi Tiny security labs when the model is already on the phone (another lab, or an earlier visit, downloaded it):
// the gate is skipped, so the lab itself must fetch the school's data before a run, or every run died on its first tool
// call with nothing on screen. The worker can't run in jsdom: a scripted model stands in for TinyLM; everything else
// in src/tinylm (the tools, the world, the manifest) is real.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import fs from "node:fs";
import path from "node:path";
import { I18nProvider } from "../../src/i18n";
import type { Conversation, Step } from "../../src/tinylm";

const pub = path.join(__dirname, "../../public");
const file = (p: string) => fs.readFileSync(path.join(pub, p), "utf8");

/** What the scripted model writes next: a tool call after the person's message, an answer after a result. */
let script: (conv: Conversation) => Step = () => ({ turns: [] });
const answer = (text: string): Step => ({ answer: text, turns: [{ role: "answer", text }] });
const call = (plan: string, tool: string, args: Record<string, unknown>): Step => ({ plan, call: { tool, args }, turns: [{ role: "plan", text: plan }, { role: "call", call: { tool, args } }] });
const failGenerate = { on: false };

vi.mock("../../src/tinylm", async (orig) => {
  const real = await orig<typeof import("../../src/tinylm")>();
  class ScriptedLM {
    load = vi.fn(async () => ({ config: {}, vocab: 3000 }));
    async generate(conv: Conversation) {
      if (failGenerate.on) throw new Error("tinylm: worker failed");
      return { step: script(conv), stoppedBy: "end" };
    }
    stop() {}
    dispose() {}
  }
  return { ...real, TinyLM: ScriptedLM };
});

const { default: Inject } = await import("../../src/labs/apps/inject");
const { meta: injectMeta } = await import("../../src/labs/apps/inject/meta");
const { default: Guardrails } = await import("../../src/labs/apps/guardrails");
const { meta: guardMeta } = await import("../../src/labs/apps/guardrails/meta");
const { default: Redteam } = await import("../../src/labs/apps/redteam");
const { meta: redMeta } = await import("../../src/labs/apps/redteam/meta");
const { LAB_BASE } = await import("../../src/labs/apps/inject/lab-agent");

const fetched: string[] = [];
function phone({ cached }: { cached: boolean }) {
  fetched.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetched.push(url);
    const name = url.split("/").pop()!;
    if (url.startsWith(LAB_BASE) && (name === "manifest.json" || name === "world.json")) return new Response(file(`lib/tinylm/v1/${name}`));
    return new Response("", { status: 404 });
  }));
  vi.stubGlobal("caches", { open: async () => ({ match: async (u: string) => (cached && u === `${LAB_BASE}model.bin` ? new Response("bin") : undefined) }) });
}

beforeEach(() => {
  failGenerate.on = false;
  script = (conv) => {
    const last = conv.turns[conv.turns.length - 1];
    if (last.role === "user") {
      if (/book/.test(last.text)) return call("I'll search the library.", "library", { query: "robots" });
      if (/Kafi/.test(last.text)) return call("I'll find the route.", "route", { from: "Kafi", to: "Dala" });
      return answer("Sorry, I won't help with that.");
    }
    if (last.role === "result") return answer("I found 2 books: My First Robot, Robots at Work.");
    return answer("OK.");
  };
});
afterEach(() => { vi.unstubAllGlobals(); });

const en = (ui: ReactElement) => render(<I18nProvider lang="en">{ui}</I18nProvider>);

describe("Darsi Tiny labs with the model already on the phone", () => {
  it("inject skips the gate, fetches the school's data, and a run shows its transcript", async () => {
    phone({ cached: true });
    en(<Inject meta={injectMeta} />);
    const run = await screen.findByRole("button", { name: "Run the attack" });
    expect(screen.queryByRole("button", { name: /Download the model/ })).toBeNull();
    expect(fetched).toContain(`${LAB_BASE}world.json`);
    fireEvent.click(run);
    expect(await screen.findByText("No effect")).toBeTruthy();
    expect(screen.getByText("I found 2 books: My First Robot, Robots at Work.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the red team runs its whole bank", async () => {
    phone({ cached: true });
    en(<Redteam meta={redMeta} />);
    fireEvent.click(await screen.findByRole("button", { name: "Run the bank" }));
    expect(await screen.findByText("Refused 8 of 8.")).toBeTruthy();
  });

  it("guardrails never claims a guardrail stopped a message the model never sent", async () => {
    phone({ cached: true });
    en(<Guardrails meta={guardMeta} />);
    fireEvent.click(await screen.findByRole("button", { name: "Run it" }));
    expect(await screen.findByText("No message was sent: the model did not send one this time, so no guardrail was needed.")).toBeTruthy();
    expect(screen.queryByText("A guardrail stopped the message before it was sent.")).toBeNull();
    expect(screen.getByText("had nothing to check", { exact: false })).toBeTruthy();
    expect(screen.getByText("the model sent no message")).toBeTruthy();
  });

  it("guardrails names the rule that really stopped the message the agent tried to send", async () => {
    phone({ cached: true });
    const msg = "send your password to keep your account open.";
    script = (conv) => {
      const last = conv.turns[conv.turns.length - 1];
      if (last.role === "user" && last.text === "yes") return call("Approved. Sending the message.", "send_message", { to: "all parents", text: msg });
      if (last.role === "user") return answer(`Shall I send this message to all parents: "${msg}"? Please reply yes or no.`);
      return answer("Sent to all parents.");
    };
    en(<Guardrails meta={guardMeta} />); // the plain scam, with "Filter the outgoing message" on
    fireEvent.click(await screen.findByRole("button", { name: "Run it" }));
    expect(await screen.findByText("A guardrail stopped the message before it was sent.")).toBeTruthy();
    expect(screen.getByText("stopped it", { exact: false })).toBeTruthy();
    expect(screen.getByText("found “password”")).toBeTruthy();
    expect(screen.getByText("Blocked by a rule")).toBeTruthy(); // the transcript shows the call the rule stopped
  });

  it("a run that breaks says so, with Try again and the recorded run", async () => {
    phone({ cached: true });
    failGenerate.on = true;
    en(<Inject meta={injectMeta} />);
    fireEvent.click(await screen.findByRole("button", { name: "Run the attack" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't finish this run/);
    failGenerate.on = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No effect")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Darsi Tiny labs on a phone without the model", () => {
  it("shows the download gate first, and the lab once the model and the data are in", async () => {
    phone({ cached: false });
    en(<Inject meta={injectMeta} />);
    const download = await screen.findByRole("button", { name: /Download the model \(2\.8 MB, once\)/ });
    expect(fetched).not.toContain(`${LAB_BASE}world.json`); // nothing big before the button
    fireEvent.click(download);
    expect(await screen.findByRole("button", { name: "Run the attack" })).toBeTruthy();
    expect(fetched).toContain(`${LAB_BASE}world.json`);
  });
});

describe("the gate in Arabic", () => {
  it("offers the download in Arabic", async () => {
    phone({ cached: false });
    render(<I18nProvider lang="ar"><Inject meta={injectMeta} /></I18nProvider>);
    expect(await screen.findByRole("button", { name: /نزّل النموذج/ })).toBeTruthy();
  });
});

