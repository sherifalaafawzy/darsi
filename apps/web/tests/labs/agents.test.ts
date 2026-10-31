// @vitest-environment node
// The AI agents labs (agentloop, tools, planner, memory, approve, teach, evals, team, costs): their pure logic, and the
// behaviours each lab is built on, checked with the real Darsi Tiny in Node (the same int8 engine the phone runs).
import { applySaved, exampleFrom, FineTuner } from "../../src/tinylm/finetune";
import { buildPrompt, openedBy, readStep, TOOLS, type Conversation, type ToolCall, type Turn } from "../../src/tinylm/format";
import { generate } from "../../src/tinylm/generate";
import { TinyModel } from "../../src/tinylm/model";
import { runTool, type Lang } from "../../src/tinylm/tools";
import { advance, approvedInCode, askedApproval, checkCall, classSaid, isYes, langOfTurns, nextOf, runTurn, sameCall, unfound, type Gen } from "../../src/labs/apps/agentloop/agent";
import { EXAMPLES as LOOP_EXAMPLES, stageOf } from "../../src/labs/apps/agentloop/model";
import { EXAMPLES as TOOL_EXAMPLES, notSaid, outcome } from "../../src/labs/apps/tools/model";
import { calledTools, GOALS, provenance, samePlan, wentAheadAfterError } from "../../src/labs/apps/planner/model";
import { fit, SCRIPT, toolsCost, turnCost, turnText, visible, type Strategy } from "../../src/labs/apps/memory/model";
import { guardFor, SCENARIOS, toolsFor } from "../../src/labs/apps/approve/model";
import { ASK, BUS_TOOLS, busExample, busResult, EXAMPLES as BUS_EXAMPLES, LR, oldPhoneMinutes, runBus, TEST_VILLAGES, TESTS } from "../../src/labs/apps/teach/model";
import { CASES, GROUPS, pct, score, tally } from "../../src/labs/apps/evals/model";
import { REQUESTS, review, verdict } from "../../src/labs/apps/team/model";
import { breakEven, cloud, measure, tiny } from "../../src/labs/apps/costs/model";
import { loadTokenizer, loadWeights, loadWorld } from "../tinylm/load";
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { labMeta } from "../../src/labs/catalog";
import type { LabProps } from "../../src/labs/types";

// The labs read their language through useI18n (the provider needs a browser store); a fixed one is enough here.
const i18n = vi.hoisted(() => ({ lang: "en" }));
vi.mock("../../src/i18n", async (orig) => ({
  ...(await orig<typeof import("../../src/i18n")>()),
  useI18n: () => ({
    lang: i18n.lang, dir: i18n.lang === "ar" ? "rtl" : "ltr", locale: i18n.lang === "ar" ? "ar-EG" : "en", t: (k: string) => k,
    L: (x?: Record<string, string>) => (x ? x[i18n.lang] ?? x.en : ""), num: (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(i18n.lang === "ar" ? "ar-EG" : "en", o).format(n),
  }),
}));

const tok = loadTokenizer();
const weights = loadWeights();
const world = loadWorld();
const model = new TinyModel(weights);
const gen: Gen = async (c, o) => { const p = buildPrompt(tok, c); const g = generate(model, tok, p, o); return { ...g, step: readStep(tok, g.ids, openedBy(p)) }; };
const run = (call: ToolCall, lang: Lang) => runTool(world, call.tool, call.args, lang);
const calc = (e: string) => { const r = runTool(world, "calculator", { expr: e }, "en"); return typeof r.value === "number" ? r.value : null; };
const user = (text: string): Turn[] => [{ role: "user", text }];
const turn = (text: string, tools: readonly string[] = TOOLS, before: Turn[] = []) => runTurn({ tools, turns: [...before, ...user(text)] }, gen, run);
const calls = (ts: readonly Turn[]) => ts.filter((t): t is { role: "call"; call: ToolCall } => t.role === "call").map((t) => t.call);
const answer = (ts: readonly Turn[]) => (ts[ts.length - 1] as { text?: string }).text ?? "";

describe("the agent loop (agentloop/agent.ts)", () => {
  it("knows what comes next and the conversation's language", () => {
    expect(nextOf([])).toBe("done");
    expect(nextOf(user("hi"))).toBe("plan");
    expect(nextOf([...user("hi"), { role: "plan", text: "x" }])).toBe("act");
    expect(nextOf([...user("hi"), { role: "call", call: { tool: "weather", args: {} } }])).toBe("tool");
    expect(nextOf([...user("hi"), { role: "answer", text: "x" }])).toBe("done");
    expect([langOfTurns(user("Hello")), langOfTurns(user("مرحبًا"))]).toEqual(["en", "ar"]);
    expect(stageOf([...user("a"), { role: "plan", text: "p" }], "answer").next).toBe("answer");
  });

  it("takes one step at a time and ends where one generation of the whole turn ends", async () => {
    for (const text of ["What's the weather in Kafi tomorrow?", "ما حالة الطقس في كافي غدًا؟"]) {
      const steps: string[] = [];
      let c: Conversation = { tools: TOOLS, turns: user(text) };
      while (nextOf(c.turns) !== "done") { const { out, add } = await advance(c, gen, run); steps.push(out.kind); c = { tools: TOOLS, turns: [...c.turns, ...add] }; }
      expect(steps).toEqual(["plan", "call", "result", "answer"]);
      const p = buildPrompt(tok, { tools: TOOLS, turns: user(text) });
      expect(calls(c.turns)[0]).toEqual(readStep(tok, generate(new TinyModel(weights), tok, p).ids, openedBy(p)).call);
      expect(answer(c.turns)).toContain("35");
    }
  }, 60_000);

  it("runs every example request of the first lab to an answer, in both languages", async () => {
    for (const lang of ["en", "ar"] as const) for (const text of LOOP_EXAMPLES[lang]) {
      const { turns } = await turn(text);
      expect(turns[turns.length - 1].role, text).toBe("answer");
    }
    const trip = await turn(LOOP_EXAMPLES.en[5]);
    expect(calledTools(trip.turns)).toEqual(["route", "weather"]);
  }, 60_000);

  it("checks a call's details against the tool, and scores calls like evaluate.py", () => {
    expect(checkCall({ tool: "weather", args: { place: "Kafi", day: "tomorrow" } }, TOOLS)).toEqual([]);
    expect(checkCall({ tool: "weather", args: { day: "tomorrow" } }, TOOLS)).toEqual([{ kind: "missing", arg: "place" }]);
    expect(checkCall({ tool: "calculator", args: { expr: "6B", day: "today" } }, TOOLS).map((i) => i.kind)).toEqual(["type", "extra"]);
    expect(checkCall({ tool: "reminder", args: { text: "x", when: "tomorrow 25:00" } }, ["weather"]).map((i) => i.kind)).toEqual(["off", "type"]);
    expect(sameCall({ tool: "calculator", args: { expr: "48*12" } }, { tool: "calculator", args: { expr: "12*48" } }, calc)).toEqual({ tool: true, args: true });
    expect(sameCall({ tool: "glossary", args: { term: "battery" } }, { tool: "glossary", args: { term: "the term battery" } }, calc)).toEqual({ tool: true, args: false });
    expect(sameCall({ tool: "convert", args: { value: 12, from: "mi", to: "km" } }, { tool: "convert", args: { to: "km", from: "mi", value: 12 } }, calc).args).toBe(true);
    expect(sameCall({ tool: "route", args: { from: "a", to: "b" } }, undefined, calc).tool).toBe(false);
  });

  it("finds words that came from nowhere, and classes however they are written", () => {
    expect(unfound("tisums the library", ["Remind me to tidy the library tomorrow at 9:00."])).toEqual(["tisums"]);
    expect(unfound("6B: PE", ["What is 6B's first lesson?", JSON.stringify({ subject: "PE" })])).toEqual([]);
    expect(unfound(12, ["كم كيلومتر تساوي ١٢ ميل؟"])).toEqual([]);
    expect(classSaid("9C", ["What does 9Z have tomorrow?"])).toBe(false);
    expect(["6B", "class 6b", "ما حصص الصف السادس ب غدًا؟", "جدول ٦ب"].map((t) => classSaid("6B", [t]))).toEqual([true, true, true, true]);
    expect(classSaid("4A", ["ما حصص الصف الرابع أ يوم الاثنين؟"])).toBe(true);
  });

  it("reads Darsi Tiny's approval question, and checks the approval in code", () => {
    const q = 'Shall I send this message to Mrs Mensah: "The trip to the farm is cancelled."? Please reply yes or no.';
    expect(askedApproval(q)).toEqual({ to: "Mrs Mensah", text: "The trip to the farm is cancelled." });
    expect(askedApproval("هل أرسل هذه الرسالة إلى الأستاذة مينسا: «أُلغيت الرحلة إلى المزرعة.»؟ أجب بنعم أو لا.")).toEqual({ to: "الأستاذة مينسا", text: "أُلغيت الرحلة إلى المزرعة." });
    expect(["yes", "Yes.", "نعم", "OK, go ahead.", "no", "لا"].map(isYes)).toEqual([true, true, true, true, false, false]);
    const msg = { tool: "send_message", args: { to: "Mrs Mensah", text: "The trip to the farm is cancelled." } };
    const asked: Turn[] = [...user("Send it"), { role: "plan", text: "p" }, { role: "answer", text: q }];
    expect(approvedInCode(msg, [...asked, ...user("yes"), { role: "plan", text: "p" }, { role: "call", call: msg }])).toEqual({ ok: true });
    expect(approvedInCode(msg, [...asked, ...user("no")])).toEqual({ ok: false, why: "no-yes" });
    expect(approvedInCode({ ...msg, args: { ...msg.args, text: "Something else" } }, [...asked, ...user("yes")])).toEqual({ ok: false, why: "changed" });
    expect(approvedInCode(msg, user("نعم، أرسلها."))).toEqual({ ok: false, why: "no-question" });
  });
});

describe("tools", () => {
  it("names each way a turn went: a tool, off, can't, asks, wrong details", async () => {
    expect(outcome((await turn("What's the weather in Kafi tomorrow?")).turns, TOOLS)?.kind).toBe("used");
    const noWeather = TOOLS.filter((t) => t !== "weather");
    expect(outcome((await turn("What's the weather in Kafi tomorrow?", noWeather)).turns, noWeather)?.kind).toBe("off");
    expect(outcome((await turn("Book a bus ticket to the city.")).turns, TOOLS)?.kind).toBe("cant");
    const asked = (await turn("What's the weather tomorrow?")).turns;
    expect(outcome(asked, TOOLS)?.kind).toBe("ask");
    const replied = (await turn("Dala", TOOLS, asked)).turns;
    expect(calls(replied)).toEqual([{ tool: "weather", args: { place: "Dala", day: "tomorrow" } }]);
    // The lab's notes are true: 9Z is copied as 9C, and one changed word makes the model guess a tool.
    const nineZ = outcome((await turn("What does 9Z have tomorrow?")).turns, TOOLS);
    expect(nineZ?.kind).toBe("wrong");
    expect(nineZ?.ungrounded).toEqual(["9C"]);
    expect(calls((await turn("What's the capital of France?")).turns)).toEqual([]);
    expect(calls((await turn("What is the capital of France?")).turns)[0]?.tool).toBe("glossary");
    expect(TOOL_EXAMPLES.en.length + TOOL_EXAMPLES.ar.length).toBeGreaterThan(15);
    expect(notSaid({ tool: "weather", args: { place: "Paris", day: "today" } }, ["Weather in Paris?"])).toEqual([]);
  }, 60_000);
});

describe("planner", () => {
  it("plans two tools for each two-step goal, and feeds the first result into the second call", async () => {
    for (const g of GOALS.filter((x) => !x.fails)) for (const lang of ["en", "ar"] as const) {
      const { turns } = await turn(g.text[lang]);
      expect(calledTools(turns), `${g.id} ${lang}`).toEqual(g.tools);
    }
    const lesson = (await turn(GOALS.find((g) => g.id === "lesson")!.text.en)).turns;
    const reminder = calls(lesson)[1];
    expect(reminder).toEqual({ tool: "reminder", args: { text: "6B: PE", when: "tomorrow 07:30" } });
    const words = provenance(reminder.args.text, GOALS.find((g) => g.id === "lesson")!.text.en, [{ subject: "PE" }]);
    expect(words.filter((w) => w.from).map((w) => `${w.text}:${w.from}`)).toEqual(["6B:request", "PE:result"]);
    expect(samePlan(["route", "weather"], ["route", "weather"])).toBe(true);
    expect(samePlan(["route"], ["route", "weather"])).toBe(false);
  }, 60_000);

  it("goes ahead after a failed first step (what the lab shows)", async () => {
    for (const lang of ["en", "ar"] as const) {
      const { turns } = await turn(GOALS.find((g) => g.id === "saturday")!.text[lang]);
      expect(wentAheadAfterError(turns), lang).not.toBeNull();
      expect(calledTools(turns)).toEqual(["timetable", "reminder"]);
    }
  }, 60_000);
});

describe("memory", () => {
  const head = toolsCost(tok.encode(TOOLS.join(" ")).length);
  const costs = (ts: readonly Turn[]) => ts.map((t) => turnCost(t, tok.encode(turnText(t)).length));

  it("counts tokens exactly as the prompt has them", async () => {
    const { turns } = await turn("What's the weather in Kafi tomorrow?");
    const next = [...turns, ...user("Dala")];
    expect(fit(next, costs(next), head, 384, "all").used).toBe(buildPrompt(tok, { tools: TOOLS, turns: next }).length);
  });

  it("drops the oldest turns or keeps notes, never the current request", () => {
    const ts: Turn[] = [...user("a"), { role: "plan", text: "p" }, { role: "call", call: { tool: "x", args: {} } }, { role: "result", result: {} }, { role: "answer", text: "b" }, ...user("c")];
    const cost = [10, 10, 10, 50, 10, 10];
    expect(fit(ts, cost, 20, 200, "all", 64)).toMatchObject({ full: false, used: 121 });
    expect(fit(ts, cost, 20, 150, "all", 64).full).toBe(true);
    expect(fit(ts, cost, 20, 150, "drop", 64).fate).toEqual(["out", "out", "out", "out", "kept", "kept"]);
    expect(fit(ts, cost, 20, 150, "notes", 64).fate).toEqual(["kept", "kept", "noted", "noted", "kept", "kept"]);
    expect(fit(ts, cost, 20, 100, "notes", 64).fate[5]).toBe("kept");
  });

  async function chat(lang: Lang, strategy: Strategy, size: number) {
    let ts: Turn[] = [];
    let full = false;
    for (const msg of SCRIPT[lang]) {
      ts = [...ts, ...user(msg)];
      for (let k = 0; k < 6 && nextOf(ts) !== "done"; k++) {
        if (nextOf(ts) === "tool") { ts = [...ts, ...(await advance({ tools: TOOLS, turns: ts }, gen, run)).add]; continue; }
        const w = fit(ts, costs(ts), head, size, strategy);
        if (size - w.used <= 4) { full = true; break; }
        const { out, add } = await advance({ tools: TOOLS, turns: visible(ts, w.fate) }, gen, run, undefined, size - w.used);
        ts = [...ts, ...add];
        if (out.kind === "bad" || (out.kind === "answer" && out.cut)) break;
      }
      if (full) break;
    }
    return { ts, full };
  }

  it("keeping everything runs out of room by the fourth message", async () => {
    const { ts, full } = await chat("en", "all", 384);
    expect(full).toBe(true);
    expect(ts.filter((t) => t.role === "user").length).toBeLessThan(6);
  }, 60_000);

  it("with a 128-token window, the oldest turns fall out and Darsi Tiny forgets", async () => {
    const { ts } = await chat("en", "drop", 128);
    expect(calls(ts).some((c) => c.tool === "send_message")).toBe(false); // the question fell out before "yes"
    expect(calls(ts).at(-1)).toEqual({ tool: "weather", args: { place: "Dala", day: "today" } }); // "tomorrow" fell out
  }, 60_000);

  it("with notes, all seven messages work in 384 tokens", async () => {
    for (const lang of ["en", "ar"] as const) {
      const { ts, full } = await chat(lang, "notes", 384);
      expect(full).toBe(false);
      expect(calls(ts).map((c) => c.tool)).toEqual(["timetable", "weather", "route", "send_message", "weather"]);
      expect(calls(ts).at(-1)?.args.day).toBe("tomorrow");
    }
  }, 60_000);
});

describe("approve", () => {
  it("gives each level its tools and checks", () => {
    expect(toolsFor("read")).not.toContain("send_message");
    expect(toolsFor("read")).not.toContain("reminder");
    expect(toolsFor("ask")).toHaveLength(10);
    const rem = { tool: "reminder", args: { text: "x", when: "tomorrow 08:00" } };
    expect(guardFor("read", true, () => true)(rem, [])).toEqual({ ok: false, reason: "read-only" });
    expect(guardFor("ask", true, () => false)(rem, [])).toEqual({ ok: false, reason: "needs-you" });
    expect(guardFor("ask", true, () => true)(rem, [])).toEqual({ ok: true });
    expect(guardFor("free", true, () => false)(rem, [])).toEqual({ ok: true });
    expect(guardFor("read", true, () => false)({ tool: "weather", args: {} }, [])).toEqual({ ok: true });
  });

  it("Darsi Tiny asks before a message; a bare yes makes it invent one, and the code check blocks it", async () => {
    const msg = SCENARIOS.find((x) => x.id === "message")!;
    for (const lang of ["en", "ar"] as const) {
      const asked = (await turn(msg.text[lang])).turns;
      expect(calls(asked)).toEqual([]);
      expect(askedApproval(answer(asked))).not.toBeNull();
      const guard = guardFor("ask", true, () => false);
      const yes = await runTurn({ tools: TOOLS, turns: [...asked, ...user(lang === "en" ? "yes" : "نعم")] }, gen, run, { guard });
      expect(yes.outs.some((o) => o.kind === "blocked")).toBe(false);
      expect(calls(yes.turns)[0]?.tool).toBe("send_message");
      const noAsk = (await turn(SCENARIOS.find((x) => x.id === "noask")!.text[lang])).turns;
      expect(calls(noAsk)).toEqual([]); // "no need to ask" changes nothing
    }
    const bare = await runTurn({ tools: TOOLS, turns: user("نعم، أرسلها.") }, gen, run, { guard: guardFor("ask", true, () => false) });
    expect(bare.outs.find((o) => o.kind === "blocked")).toMatchObject({ reason: "no-question" });
    const unchecked = await runTurn({ tools: TOOLS, turns: user("نعم، أرسلها.") }, gen, run, { guard: guardFor("free", false, () => false) });
    expect(unchecked.turns.some((t) => t.role === "result" && (t.result as { sent?: boolean }).sent)).toBe(true);
  }, 60_000);
});

describe("team", () => {
  it("the checker passes good calls, stops slips, and hands actions to a person", async () => {
    const check = async (text: string) => {
      let v: string | undefined;
      await runTurn({ tools: TOOLS, turns: user(text) }, gen, run, { guard: (call, ts) => { v = verdict(review(call, ts, TOOLS, false)); return v === "run" ? { ok: true } : { ok: false, reason: v }; } });
      return v;
    };
    const t = (id: string, lang: Lang = "en") => REQUESTS.find((r) => r.id === id)!.text[lang];
    expect(await check(t("fine"))).toBe("run");
    expect(await check(t("class"))).toBe("stop");
    expect(await check(t("copy"))).toBe("stop"); // "tidy" becomes "tisums"
    expect(await check(t("copy", "ar"))).toBe("stop"); // a word is garbled
    expect(await check(t("time"))).toBe("stop");
    expect(await check(t("remind"))).toBe("ask");
    const chain = await turn(t("chain"));
    const second = chain.turns.findIndex((x, i) => x.role === "call" && i > chain.turns.findIndex((y) => y.role === "call"));
    expect(review(calls(chain.turns)[1], chain.turns.slice(0, second + 1), TOOLS, true).find((c) => c.rule === "after")?.ok).toBe(false);
  }, 60_000);
});

describe("evals", () => {
  it("has 8 requests per group, and Darsi Tiny scores higher on trained wordings than on new ones", async () => {
    expect(CASES).toHaveLength(32);
    for (const g of GROUPS) expect(CASES.filter((c) => c.group === g)).toHaveLength(8);
    const rows = [];
    for (const cs of CASES) {
      const r = await gen({ tools: TOOLS, turns: user(cs.text) }, { maxTokens: 60 });
      rows.push(score(cs, r.step.call, r.step.answer, 0, calc));
    }
    const t = tally(rows);
    // Measured 2026-10-28: trained 16/16, new 13/16 (the term battery, a pupil's name, a library request read as a refusal).
    expect(t.trained.args).toBeGreaterThanOrEqual(15);
    expect(t.new.args).toBeLessThan(t.trained.args);
    expect(pct(t.all.args, t.all.n)).toBeGreaterThanOrEqual(80);
    expect(rows.find((r) => r.id === "en-new-5")?.got?.args.term).toBe("the term battery");
  }, 60_000);
});

describe("teach", () => {
  it("has 16 taught examples and a test on villages they never name", () => {
    expect(BUS_EXAMPLES).toHaveLength(16);
    const named = new Set(BUS_EXAMPLES.map((e) => (e.turns[2] as { call: ToolCall }).call.args.from));
    for (const v of TEST_VILLAGES) { expect(named.has(v.en)).toBe(false); expect(named.has(v.ar)).toBe(false); }
    expect(TESTS.filter((t) => t.kind === "new")).toHaveLength(8);
    expect(TESTS.filter((t) => t.kind === "old")).toHaveLength(8);
    expect(busResult({ en: "Kafi", ar: "كافي" })).toEqual(busResult({ en: "Kafi", ar: "x" }));
    expect(runBus({ from: "كافي" })).toEqual(busResult({ en: "Kafi", ar: "كافي" }));
    expect(runBus({ from: "Paris" })).toEqual({ error: "unknown place" });
    for (const e of BUS_EXAMPLES) { const ex = exampleFrom(tok, e); expect(ex.ids.length).toBeLessThan(384); expect(ex.mask.some(Boolean)).toBe(true); }
    expect(Math.round(oldPhoneMinutes(64))).toBe(11);
    expect(ASK.en).toHaveLength(12);
  });

  it("the original model doesn't use the bus tool; a few steps on the examples start to teach it", async () => {
    const busCall = (m: TinyModel, text: string) => { const p = buildPrompt(tok, { tools: BUS_TOOLS, turns: user(text) }); return readStep(tok, generate(m, tok, p, { maxTokens: 40 }).ids, openedBy(p)).call; };
    const newTests = TESTS.filter((t) => t.kind === "new");
    expect(newTests.filter((t) => busCall(model, t.text)?.tool === "bus")).toHaveLength(0);
    // The lab trains 15 steps (with 48 old conversations about 2 minutes on a laptop); 6 steps without replay keep this test quick.
    const ft = new FineTuner(weights, { blocks: 1, lr: LR });
    ft.add(BUS_EXAMPLES.map((e) => exampleFrom(tok, e)));
    const first = ft.step().loss;
    let last = first;
    for (let s = 0; s < 5; s++) last = ft.step().loss;
    expect(last).toBeLessThan(first / 2);
    const tuned = new TinyModel(applySaved(weights, ft.save()));
    expect(newTests.filter((t) => busCall(tuned, t.text)?.tool === "bus").length).toBeGreaterThan(0);
    expect(busExample("en", ASK.en[0], { en: "Kafi", ar: "كافي" }).tools).toContain("bus");
  }, 60_000);
});

describe("costs", () => {
  it("measures a request and prices it for a cloud model", () => {
    const m = measure([{ kind: "plan", prompt: 36, reused: 0, wrote: 6, ms: 20 }, { kind: "act", prompt: 42, reused: 41, wrote: 15, ms: 40 }, { kind: "act", prompt: 80, reused: 57, wrote: 30, ms: 60 }]);
    expect(m).toMatchObject({ steps: 3, trips: 2, read: 60, wrote: 51, ms: 120, promptPerTrip: [42, 80], wrotePerTrip: [21, 30] });
    const g2 = cloud(m, "2g", 2), g3 = cloud(m, "3g", 2);
    expect(g2.tokensIn).toBe(1200 * 2 + 42 + 80);
    expect(g2.bytes).toBe(g3.bytes);
    expect(g2.seconds).toBeGreaterThan(g3.seconds);
    expect(g2.bytes).toBeGreaterThan(15_000);
    expect(tiny(m)).toMatchObject({ bytes: 0, dollars: 0, seconds: 0.12 });
    expect(breakEven(2_773_328, g2.bytes)).toBeGreaterThan(100);
  });
});

describe("every agents lab", () => {
  const IDS = ["agentloop", "tools", "planner", "memory", "approve", "teach", "evals", "team", "costs"];
  it("is on its shelf and says what to try, in English and Arabic", async () => {
    for (const id of IDS) {
      const meta = labMeta(id)!;
      expect(meta.category, id).toMatch(/^agents-(how|practice)$/);
      const App = (await import(`../../src/labs/apps/${id}/index.tsx`)).default as ComponentType<LabProps>;
      for (const lang of ["en", "ar"]) {
        i18n.lang = lang;
        const html = renderToString(createElement(App, { meta }));
        const tries = [...html.matchAll(/<li>(.*?)<\/li>/g)].filter((m) => html.indexOf("lb-try-list") < m.index!).slice(0, 3).map((m) => m[1].replace(/<[^>]+>/g, ""));
        expect(tries, `${id} ${lang}`).toHaveLength(3);
        for (const t of tries) expect(t.length, `${id} ${lang}`).toBeGreaterThan(30);
        expect(html, `${id} ${lang}`).toContain("lb-takeaway");
        if (lang === "ar") { expect(html, id).not.toContain("·"); expect(meta.title.ar + meta.summary.ar).not.toContain("·"); }
      }
    }
  }, 60_000);
});
