// Counted nouns in the Darsi Tiny group's labs, in both languages: "1 card" not "1 cards", «بطاقة واحدة» not
// «١ من البطاقات», «من أصل ٣ محاولات» not «من أصل ٣ محاولة», «٥ دقائق» not «٥ دقيقة».
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import fs from "node:fs";
import path from "node:path";
import { I18nProvider } from "../../src/i18n";
import type { Conversation, Step } from "../../src/tinylm";

const pub = path.join(__dirname, "../../public");

// The privilege lab runs Darsi Tiny: a scripted model stands in for the worker (as in tiny-gate.test.tsx); the tools and
// the school's data are real. It sends a message only after the library result, so exactly one attack of three acts.
vi.mock("../../src/tinylm", async (orig) => {
  const real = await orig<typeof import("../../src/tinylm")>();
  const call = (tool: string, args: Record<string, unknown>): Step => ({ plan: "OK.", call: { tool, args }, turns: [{ role: "plan", text: "OK." }, { role: "call", call: { tool, args } }] });
  const answer = (text: string): Step => ({ answer: text, turns: [{ role: "answer", text }] });
  class ScriptedLM {
    load = vi.fn(async () => ({ config: {}, vocab: 3000 }));
    async generate(conv: Conversation) {
      const turns = conv.turns, last = turns[turns.length - 1];
      const asked = turns.find((t) => t.role === "user")?.text ?? "";
      let step: Step;
      if (last.role === "user") step = /book|كتاب/.test(asked) ? call("library", { query: "robots" }) : call("route", { from: "Kafi", to: "Dala" });
      else if (last.role === "result" && /book|كتاب/.test(asked) && conv.tools?.includes("send_message") && !turns.some((t) => t.role === "call" && t.call.tool === "send_message")) step = call("send_message", { to: "all parents", text: "school is closed tomorrow." });
      else step = answer("Done.");
      return { step, stoppedBy: "end" };
    }
    stop() {}
    dispose() {}
  }
  return { ...real, TinyLM: ScriptedLM };
});

const { default: Robot } = await import("../../src/labs/apps/robot");
const { meta: robotMeta } = await import("../../src/labs/apps/robot/meta");
const { default: Sensor } = await import("../../src/labs/apps/sensor");
const { meta: sensorMeta } = await import("../../src/labs/apps/sensor/meta");
const { default: Privilege } = await import("../../src/labs/apps/privilege");
const { meta: privMeta } = await import("../../src/labs/apps/privilege/meta");
const { LAB_BASE } = await import("../../src/labs/apps/inject/lab-agent");

const inLang = (lang: "en" | "ar", ui: ReactElement) => render(<I18nProvider lang={lang}>{ui}</I18nProvider>);

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true })); // reduced motion: the robot arrives at once
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const name = url.split("/").pop()!;
    if (url.startsWith(LAB_BASE) && (name === "manifest.json" || name === "world.json")) return new Response(fs.readFileSync(path.join(pub, "lib/tinylm/v1", name), "utf8"));
    return new Response("", { status: 404 });
  }));
  vi.stubGlobal("caches", { open: async () => ({ match: async (u: string) => (u === `${LAB_BASE}model.bin` ? new Response("bin") : undefined) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Grid 1 is four squares straight ahead: one card tapped to ×4 (the fewest), or two cards of ×2. */
function solve(words: { forward: string; run: string }, cards: 1 | 2) {
  const palette = () => screen.getAllByRole("button", { name: words.forward }).find((b) => b.classList.contains("is-new"))!;
  const program = () => screen.getAllByRole("button").filter((b) => b.classList.contains("lb-robot-card") && !b.classList.contains("is-new"));
  if (cards === 1) {
    fireEvent.click(palette());
    for (let i = 0; i < 3; i++) fireEvent.click(program()[0]);
  } else {
    fireEvent.click(palette()); fireEvent.click(program()[0]);
    fireEvent.click(palette()); fireEvent.click(program()[1]);
  }
  fireEvent.click(screen.getByRole("button", { name: words.run }));
}

describe("the robot counts its cards and stars", () => {
  it("in English", () => {
    inLang("en", <Robot meta={robotMeta} />);
    solve({ forward: "Forward", run: "Run the robot" }, 1);
    expect(screen.getByText("1 card: the fewest possible!")).toBeTruthy();
    expect(screen.getByRole("img", { name: "3 stars of 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forward, 4 times" })).toBeTruthy();
  });

  it("in English, one card too many", () => {
    inLang("en", <Robot meta={robotMeta} />);
    solve({ forward: "Forward", run: "Run the robot" }, 2);
    expect(screen.getByText("You used 2 cards. The fewest possible is 1 card. Can you do it with fewer?")).toBeTruthy();
    expect(screen.getByRole("img", { name: "2 stars of 3" })).toBeTruthy();
  });

  it("in Arabic", () => {
    inLang("ar", <Robot meta={robotMeta} />);
    solve({ forward: "إلى الأمام", run: "شغّل الروبوت" }, 1);
    expect(screen.getByText("بطاقة واحدة: أقل عدد ممكن!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إلى الأمام، ٤ مرات" })).toBeTruthy();
  });

  it("in Arabic, one card too many", () => {
    inLang("ar", <Robot meta={robotMeta} />);
    solve({ forward: "إلى الأمام", run: "شغّل الروبوت" }, 2);
    expect(screen.getByText("استعملت بطاقتين. وأقل عدد ممكن هو بطاقة واحدة. هل تستطيع أن تنجح بعدد أقل؟")).toBeTruthy();
    expect(screen.getByRole("img", { name: "نجمتان من ٣" })).toBeTruthy();
  });
});

describe("the sensor's reading intervals", () => {
  it("count minutes in Arabic", () => {
    inLang("ar", <Sensor meta={sensorMeta} />);
    for (const label of ["دقيقة", "٥ دقائق", "١٥ دقيقة", "٦٠ دقيقة"]) expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("the privilege lab's count", () => {
  it("in English", async () => {
    inLang("en", <Privilege meta={privMeta} />);
    const run = await screen.findByRole("button", { name: "Run the attack set" });
    fireEvent.click(screen.getByRole("button", { name: /^Send message/ }));
    fireEvent.click(run);
    expect(await screen.findByText("The attack set reached 1 harmful action out of 3 tries.", { exact: false })).toBeTruthy();
  });

  it("in Arabic", async () => {
    inLang("ar", <Privilege meta={privMeta} />);
    fireEvent.click(await screen.findByRole("button", { name: "شغّل مجموعة الهجمات" }));
    expect(await screen.findByText("الأفعال الضارة التي بلغتها مجموعة الهجمات: ٠ من أصل ٣ محاولات.", { exact: false })).toBeTruthy();
  });
});
