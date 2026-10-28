import { build, CORPUS as WORDS, nearest } from "../../src/labs/apps/embeddings/model";
import { attend, SENTENCES } from "../../src/labs/apps/attention/model";
import { CORPUS as MINI, generate, isCopy, train as trainMini } from "../../src/labs/apps/minilm/model";
import { CORPUS as STORY, END, pick, PROMPTS, think, tokenize, train as trainLm } from "../../src/labs/apps/llm/model";
import { answer, DOCS, index, QUESTIONS, search, stem } from "../../src/labs/apps/rag/model";
import { accuracy as treeAccuracy, auto, DATA, entropy, gain, grow, questions, type Node } from "../../src/labs/apps/tree/model";
import { knn, looAccuracy, mangoes } from "../../src/labs/apps/knn/model";
import { assign, houses, move, run, startStops, walk } from "../../src/labs/apps/kmeans/model";
import { episode, greedyPath, newQ, yard } from "../../src/labs/apps/rl/model";
import { best, cases, confusion, cost } from "../../src/labs/apps/threshold/model";
import { breakEven, ev, PAYOFF, SCORES, totals, WEIGHTS, winner } from "../../src/labs/apps/decision/model";
import { errorRate, leaves, missRate, train as trainBias } from "../../src/labs/apps/bias/model";
import { cosine, pca } from "../../src/labs/kit/vectors";
import { matchKey } from "../../src/labs/kit/text";
import { rng } from "../../src/labs/kit/rng";

describe("vectors", () => {
  it("cosine and PCA behave", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1); expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
    const xy = pca([[0, 0], [1, 1], [2, 2], [3, 3]], 1); // all on one line: one direction explains it
    expect(Math.abs(xy[3][0] - xy[0][0])).toBeCloseTo(Math.hypot(3, 3), 4);
  });
});

describe("word map", () => {
  it("puts words used alike next to each other, in both languages", () => {
    const en = build(WORDS.en), ar = build(WORDS.ar);
    expect(nearest(en, "mangoes", 1)[0].key).toBe("bananas");
    expect(nearest(en, "teacher", 3).map((n) => n.key)).toContain("pupil");
    expect(nearest(ar, matchKey("المانجو"), 1)[0].key).toBe(matchKey("الموز"));
    expect(nearest(ar, matchKey("المطر"), 1)[0].key).toBe(matchKey("الرياح"));
  });

  it("places a new word by the company it keeps (Try this: the camel)", () => {
    const en = build(`${WORDS.en}
The camel eats grass on the farm. The camel gives milk on the farm.`);
    expect(nearest(en, "camel", 2).map((n) => n.key).sort()).toEqual(["cow", "goat"]);
    const ar = build(`${WORDS.ar}
تأكل الناقة العشب في المزرعة. تعطي الناقة الحليب في المزرعة.`);
    expect(nearest(ar, matchKey("الناقة"), 2).map((n) => n.key).sort()).toEqual([matchKey("البقرة"), matchKey("العنزة")].sort());
    expect(build(`${WORDS.en}
The camel eats grass.`).v.keys).not.toContain("camel"); // seen once: not on the map
  });
});

describe("attention", () => {
  it("“it” attends to the dog when hungry and to the milk when fresh; shares add up to 1", () => {
    for (const lang of ["en", "ar"] as const) {
      const top = (id: string) => { const toks = SENTENCES[id][lang], a = attend(toks, toks.findIndex((x) => x.focus), 3); expect(a.weights.reduce((x, y) => x + y, 0)).toBeCloseTo(1); return toks[a.weights.indexOf(Math.max(...a.weights))].text; };
      expect(top("hungry")).toMatch(lang === "en" ? /dog/ : /الكلب/);
      expect(top("fresh")).toMatch(lang === "en" ? /milk/ : /الحليب/);
      expect(top("light")).toMatch(lang === "en" ? /sack/ : /الكيس/);
    }
  });

  it("a verb splits its attention between who and what; focus 0 shares it out evenly", () => {
    const toks = SENTENCES.hungry.en, verb = toks.findIndex((x) => x.text === "drank"), a = attend(toks, verb, 3).weights;
    expect(a[1]).toBeCloseTo(a[4]); // dog and milk
    expect(a[1]).toBeGreaterThan(0.4);
    for (const w of attend(toks, 6, 0).weights) expect(w).toBeCloseTo(1 / toks.length);
    expect(Math.max(...attend(toks, 6, 8).weights)).toBeGreaterThan(0.99);
  });
});

describe("tiny language model (minilm)", () => {
  it("looking back two words makes it copy the training text far more often", () => {
    for (const lang of ["en", "ar"] as const) {
      const copies = (order: 1 | 2) => { const m = trainMini(MINI[lang], order), r = rng(3); let n = 0; for (let i = 0; i < 200; i++) if (isCopy(m, generate(m, 1, r))) n++; return n / 200; };
      expect(copies(2)).toBeGreaterThan(0.8);
      expect(copies(1)).toBeLessThan(0.5);
    }
  });
});

describe("inside an LLM", () => {
  it("scores only words seen after the context, with probabilities adding up to 1, and writes to the end", () => {
    const lm = trainLm(STORY.en), r = rng(3);
    const ctx = tokenize(lm, "The cat").map((t) => t.key);
    const st = think(lm, ctx);
    expect(st.cands.reduce((x, c) => x + c.p, 0)).toBeCloseTo(1);
    expect(st.cands.map((c) => c.key)).toEqual(expect.arrayContaining(["drinks", "sleeps", "plays"]));
    expect(st.attn.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    for (const p of PROMPTS.ar) {
      const lmAr = trainLm(STORY.ar), c = tokenize(lmAr, p).map((t) => t.key);
      let w = "";
      for (let i = 0; i < 20 && w !== END; i++) { w = pick(think(lmAr, c).cands, r()); if (w !== END) c.push(w); }
      expect(w).toBe(END);
    }
    expect(think(lm, ctx, 0.02).cands[0].p).toBeGreaterThan(0.95); // cold: nearly always the top word
  });

  it("attention brings in the earlier words: the cat sleeps on the bed, the teacher writes on the board", () => {
    const lm = trainLm(STORY.en);
    const p = (text: string, w: string, ctxWeight: number) => think(lm, text.split(" "), 1, ctxWeight).cands.find((c) => c.key === w)!.p;
    for (const [text, w] of [["the cat sleeps on the", "bed"], ["the teacher writes on the", "board"], ["the cow eats grass on the", "farm"]]) {
      expect(p(text, w, 0)).toBeCloseTo(1 / 3); // the word counts only see "on the"
      expect(p(text, w, 4)).toBeGreaterThan(0.6);
    }
    const ar = trainLm(STORY.ar);
    expect(think(ar, ["المعلم", "يشرب", "الشاي", "بعد"].map(matchKey), 1, 4).cands[0].key).toBe(matchKey("الدرس"));
    // Every Arabic prompt has more than one way to go on, so temperature and attention change something.
    for (const p of PROMPTS.ar) expect(think(ar, tokenize(ar, p).map((t) => t.key)).cands.length).toBeGreaterThan(1);
  });
});

describe("answers with sources", () => {
  it("finds the right document, quotes it, and declines what it doesn't know", () => {
    const ids = ["exams", "library", "bus", "lunch", "phones"];
    for (const lang of ["en", "ar"] as const) {
      const ix = index(DOCS[lang]);
      QUESTIONS[lang].slice(0, 5).forEach((q, i) => { expect(search(ix, q)[0].doc.id).toBe(ids[i]); expect(answer(ix, q)?.doc.id).toBe(ids[i]); });
      expect(answer(ix, QUESTIONS[lang][5])).toBeNull();
    }
    expect(stem("الامتحانات")).toBe(stem("امتحانات"));
    const edited = index(DOCS.en.map((d) => (d.id === "exams" ? { ...d, text: "Mid-year exams start on Monday 20 January." } : d)));
    expect(answer(edited, "When do the exams start?")?.quote).toMatch(/Monday 20 January/);
    expect(answer(index(DOCS.en), "When does the library open?")?.doc.id).toBe("library");
    expect(answer(index(DOCS.ar), "متى تفتح المكتبة؟")?.doc.id).toBe("library");
  });
});

describe("decision tree", () => {
  it("ID3 asks about the sky first and fits all 14 days", () => {
    expect(entropy(DATA)).toBeCloseTo(0.940, 3);
    expect(gain(DATA, "sky")).toBeCloseTo(0.247, 3);
    const root = grow(auto());
    expect(root.kind === "split" && root.attr).toBe("sky");
    expect(treeAccuracy(root)).toBe(1);
    expect(questions(root)).toBe(3);
    expect(questions(grow(auto(new Map([["", "heat"]]))))).toBe(7); // the smallest gain first: a bigger tree
  });

  it("an answer no day had goes with the majority one level up", () => {
    // Humid days were mostly "stay"; none of them was cool.
    const root = grow(new Map([["", "humid"], ["humid=high", "heat"]]));
    const find = (n: Node, path: string): Node | null => n.path === path ? n : n.kind === "split" ? n.kids.map((k) => find(k.node, path)).find(Boolean) ?? null : null;
    const empty = find(root, "humid=high/heat=cool");
    expect(empty?.kind === "leaf" && empty.rows.length === 0 && empty.play).toBe(false);
  });
});

describe("nearest neighbours", () => {
  it("k = 1 judges a training example by itself; a messy set favours a bigger k", () => {
    const pts = mangoes();
    expect(knn(pts, pts[0], 1).ripe).toBe(pts[0].ripe);
    expect(looAccuracy(pts, 5)).toBeGreaterThan(0.8);
    const messy = mangoes(true);
    expect(looAccuracy(messy, 7)).toBeGreaterThanOrEqual(looAccuracy(messy, 1));
    expect(looAccuracy(messy, 5)).toBeGreaterThan(looAccuracy(messy, 1) + 0.1);
  });
});

describe("k-means", () => {
  it("never makes the average walk longer, and settles", () => {
    const pts = houses();
    let stops = startStops(pts, 4, 3), a = assign(pts, stops), w = walk(pts, stops, a);
    for (let i = 0; i < 20; i++) { stops = move(pts, stops, a); a = assign(pts, stops); const nw = walk(pts, stops, a); expect(nw).toBeLessThanOrEqual(w + 1e-9); w = nw; }
    expect(run(pts, startStops(pts, 4, 3)).rounds).toBeLessThan(100);
  });

  it("with 3 stops, different starts can settle on different answers", () => {
    const pts = houses(), ends = new Set<number>();
    for (let seed = 3; seed < 9; seed++) { const r = run(pts, startStops(pts, 3, seed)); ends.add(Math.round(walk(pts, r.stops, r.a) * 100)); }
    expect(ends.size).toBeGreaterThan(1);
  });
});

describe("learn by reward", () => {
  it("learns the shortest way to the charger", () => {
    const g = yard(), q = newQ(), r = rng(5);
    for (let e = 0; e < 300; e++) episode(g, q, r);
    const p = greedyPath(g, q);
    expect(p.reached).toBe(true);
    expect(p.path.length - 1).toBe(10);
  });

  it("knows it is lost as soon as it goes round in a loop, and learns a way round a new puddle", () => {
    const lost = greedyPath(yard(), newQ()); // nothing learned: always "up", then it bumps the top wall
    expect(lost.reached).toBe(false);
    expect(lost.path.length).toBeLessThan(10);
    const g = yard(), q = newQ(), r = rng(5);
    for (let e = 0; e < 200; e++) episode(g, q, r);
    expect(greedyPath(g, q).path).toContain(18);
    g[18] = "puddle";
    for (let e = 0; e < 200; e++) episode(g, q, r);
    const p = greedyPath(g, q);
    expect(p.reached).toBe(true);
    expect(p.path).not.toContain(18);
    expect(p.path.length - 1).toBe(12);
  });
});

describe("thresholds", () => {
  it("trades misses for false alarms, and the best threshold depends on the job", () => {
    const cs = cases("smoke"), lo = confusion(cs, 0), hi = confusion(cs, 1);
    expect(lo.miss).toBe(0); expect(hi.falseAlarm).toBe(0);
    expect(lo.hit + lo.miss + lo.falseAlarm + lo.quiet).toBe(60);
    expect(best("smoke", cs)).toBeLessThan(best("spam", cases("spam")));
    expect(cost("smoke", confusion(cs, best("smoke", cs)))).toBeLessThanOrEqual(cost("smoke", confusion(cs, 0.5)));
    const high = confusion(cs, 0.9); // Try this: no false alarms, nearly every fire missed
    expect(high.falseAlarm).toBe(0); expect(high.miss).toBeGreaterThan(25);
  });
});

describe("decide with numbers", () => {
  it("weights change the winner; expected value flips at the break-even chance", () => {
    expect(winner(totals(SCORES, WEIGHTS))).toBe("museum");
    expect(winner(totals(SCORES, { cost: 5, learning: 0, travel: 0, safety: 0 }))).toBe("farm");
    expect(winner(totals(SCORES, { cost: 0, learning: 5, travel: 0, safety: 0 }))).toBe("science");
    expect(breakEven(PAYOFF)).toBeCloseTo(0.5);
    expect(ev(0.2, PAYOFF).outside).toBeGreaterThan(ev(0.2, PAYOFF).hall);
    expect(ev(0.8, PAYOFF).outside).toBeLessThan(ev(0.8, PAYOFF).hall);
  });
});

describe("bias in data", () => {
  it("few region-B photos: big errors in B hidden by a good overall score; balanced data closes the gap", () => {
    const testA = leaves(300, 0, 901), testB = leaves(300, 1, 902);
    const skewed = trainBias(leaves(200, 0.05, 77)), fair = trainBias(leaves(200, 0.5, 77));
    expect(errorRate(skewed, leaves(400, 0.05, 903))).toBeLessThan(0.06);
    expect(missRate(skewed, testB)).toBeGreaterThan(0.25);
    expect(missRate(fair, testB)).toBeLessThan(0.1);
    expect(Math.abs(errorRate(fair, testA) - errorRate(fair, testB))).toBeLessThan(0.05);
    expect(missRate(trainBias(leaves(200, 0, 77)), testB)).toBeGreaterThan(0.4); // no hill photos: nearly half missed
  });
});
