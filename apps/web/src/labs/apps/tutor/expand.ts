/**
 * A scene the model writes on demand, and the picture the phone makes from it.
 *
 * The model emits one compact JSON object. It does not emit frames, SVG or a video. Any numbers and names that fit
 * the grammar are a new scene, so the courses are not a fixed set of pictures. This file runs the idea and fills a
 * Lesson Studio pack element. The player draws each frame from the clock. Limits keep the JSON inside 384 tokens.
 */
import courseTerms from "./course-scenes.json";

export type Lang = "en" | "ar";

export type ArchPresetName = "mlp" | "cnn" | "rnn" | "transformer" | "gpt" | "agent" | "rag" | "autoencoder" | "gan" | "resnet";

export type SceneSpec =
  | { kind: "graph"; nodes: string[]; edges: [number, number, number][]; from: number; to: number }
  | { kind: "sort"; values: number[] }
  | { kind: "bag"; items: [string, number, number][]; cap: number }
  | { kind: "signal"; high: number; low: number; adc?: number }
  | { kind: "trace"; values: number[] }
  | { kind: "packet" }
  | { kind: "query"; min: number }
  | { kind: "pattern"; a: number; b: number }
  | { kind: "net"; layers: number[]; w?: number[]; b?: number; in?: string[]; out?: string }
  | { kind: "arch"; preset?: ArchPresetName; steps?: string[]; title?: string }
  | { kind: "plot"; mode: "descent" | "fit" | "loss" | "distribution"; start?: number }
  | { kind: "gates"; gate: "and" | "or" | "xor" | "not" }
  | { kind: "bits"; n: number; values: number[] }
  | { kind: "flow"; ask: string; yes: string; no: string }
  | { kind: "seq"; actors: string[]; msgs: [number, number, string][] }
  | { kind: "search"; values: number[]; target: number };

export interface BuiltScene {
  spec: SceneSpec;
  /** Compact JSON, the exact text a scene call carries after the tool name. */
  json: string;
  dur: number;
  /** One sentence the explanation may quote. */
  line: { en: string; ar: string };
  /** Steps glide one frame at a time. A sweep plays the scene's own clock. */
  pace: "steps" | "lesson";
  scene: {
    id: "s1";
    template: "canvas";
    narration: { en: string; ar: string };
    content: { elements: unknown[] };
  };
}

const tx = (en: string, ar: string) => ({ en, ar });

export function sceneJson(spec: SceneSpec): string {
  return JSON.stringify(spec);
}

export function parseScene(text: string): SceneSpec | null {
  const i = text.indexOf("{");
  if (i < 0) return null;
  try {
    return checkSpec(JSON.parse(text.slice(i)) as unknown);
  } catch {
    return null;
  }
}

function checkSpec(v: unknown): SceneSpec | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "graph") {
    const nodes = strs(o.nodes, 3, 6);
    const edges = pairs3(o.edges, 2, 10);
    const from = num(o.from), to = num(o.to);
    if (!nodes || !edges || from === null || to === null) return null;
    if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length || from === to) return null;
    if (edges.some(([a, b]) => a < 0 || b < 0 || a >= nodes.length || b >= nodes.length || a === b)) return null;
    return { kind: "graph", nodes, edges, from, to };
  }
  if (o.kind === "sort") {
    const values = nums(o.values, 3, 6);
    if (!values || values.some((n) => n < 0 || n > 99)) return null;
    return { kind: "sort", values };
  }
  if (o.kind === "bag") {
    const cap = num(o.cap);
    const items = bagItems(o.items);
    if (cap === null || cap < 1 || cap > 99 || !items) return null;
    return { kind: "bag", items, cap };
  }
  if (o.kind === "signal") {
    const high = num(o.high), low = num(o.low);
    if (high === null || low === null || low < 0 || high > 99 || high - low < 1) return null;
    const adc = o.adc === undefined ? undefined : num(o.adc);
    if (o.adc !== undefined && (adc == null || adc < 2 || adc > 8)) return null;
    return { kind: "signal", high, low, ...(adc ? { adc } : {}) };
  }
  if (o.kind === "trace") {
    const values = nums(o.values, 3, 4);
    if (!values || values.some((n) => n < 0 || n > 20)) return null;
    return { kind: "trace", values };
  }
  if (o.kind === "packet") return { kind: "packet" };
  if (o.kind === "query") {
    const min = num(o.min);
    if (min === null || min < 0 || min > 100) return null;
    return { kind: "query", min };
  }
  if (o.kind === "pattern") {
    const a = num(o.a), b = num(o.b);
    if (a === null || b === null || a < 0 || b < 0 || a > 9 || b > 9 || a === b) return null;
    return { kind: "pattern", a, b };
  }
  if (o.kind === "net") {
    const layers = nums(o.layers, 2, 4);
    if (!layers || layers.some((n) => n < 1 || n > 6)) return null;
    const w = o.w === undefined ? undefined : nums(o.w, 1, 6);
    if (o.w !== undefined && (!w || w.some((n) => n < -20 || n > 20))) return null;
    const b = o.b === undefined ? undefined : num(o.b);
    if (o.b !== undefined && (b == null || b < -30 || b > 30)) return null;
    const inn = o.in === undefined ? undefined : strs(o.in, 1, 6);
    if (o.in !== undefined && !inn) return null;
    const out = typeof o.out === "string" && o.out.trim().length <= 24 ? o.out.trim() : undefined;
    return { kind: "net", layers, ...(w ? { w } : {}), ...(b !== undefined && b !== null ? { b } : {}), ...(inn ? { in: inn } : {}), ...(out ? { out } : {}) };
  }
  if (o.kind === "arch") {
    const presets: ArchPresetName[] = ["mlp", "cnn", "rnn", "transformer", "gpt", "agent", "rag", "autoencoder", "gan", "resnet"];
    const preset = typeof o.preset === "string" && (presets as string[]).includes(o.preset) ? (o.preset as ArchPresetName) : undefined;
    const steps = o.steps === undefined ? undefined : strs(o.steps, 3, 6);
    if (!preset && !steps) return null;
    const title = typeof o.title === "string" && o.title.trim().length <= 40 ? o.title.trim() : undefined;
    return { kind: "arch", ...(preset ? { preset } : {}), ...(steps ? { steps } : {}), ...(title ? { title } : {}) };
  }
  if (o.kind === "plot") {
    const mode = o.mode === "descent" || o.mode === "fit" || o.mode === "loss" || o.mode === "distribution" ? o.mode : null;
    if (!mode) return null;
    const start = o.start === undefined ? undefined : num(o.start);
    if (o.start !== undefined && (start == null || start < 0 || start > 8)) return null;
    return { kind: "plot", mode, ...(start !== undefined && start !== null ? { start } : {}) };
  }
  if (o.kind === "gates") {
    const gate = o.gate === "and" || o.gate === "or" || o.gate === "xor" || o.gate === "not" ? o.gate : null;
    return gate ? { kind: "gates", gate } : null;
  }
  if (o.kind === "bits") {
    const n = num(o.n);
    const values = nums(o.values, 2, 6);
    if (n === null || n < 3 || n > 8 || !values || values.some((x) => x < 0 || x >= 2 ** n)) return null;
    return { kind: "bits", n, values };
  }
  if (o.kind === "flow") {
    const ask = typeof o.ask === "string" ? o.ask.trim() : "";
    const yes = typeof o.yes === "string" ? o.yes.trim() : "";
    const no = typeof o.no === "string" ? o.no.trim() : "";
    if (!ask || !yes || !no || ask.length > 28 || yes.length > 24 || no.length > 24) return null;
    return { kind: "flow", ask, yes, no };
  }
  if (o.kind === "seq") {
    const actors = strs(o.actors, 2, 4);
    if (!actors || !Array.isArray(o.msgs) || o.msgs.length < 2 || o.msgs.length > 5) return null;
    const msgs: [number, number, string][] = [];
    for (const m of o.msgs) {
      if (!Array.isArray(m) || m.length < 3) return null;
      const a = num(m[0]), b = num(m[1]), s = typeof m[2] === "string" ? m[2].trim() : "";
      if (a === null || b === null || a < 0 || b < 0 || a >= actors.length || b >= actors.length || !s || s.length > 28) return null;
      msgs.push([a, b, s]);
    }
    return { kind: "seq", actors, msgs };
  }
  if (o.kind === "search") {
    const values = nums(o.values, 4, 8);
    const target = num(o.target);
    if (!values || target === null || values.some((n) => n < 0 || n > 99)) return null;
    return { kind: "search", values: [...values].sort((a, b) => a - b), target };
  }
  return null;
}

const strs = (v: unknown, lo: number, hi: number): string[] | null => {
  if (!Array.isArray(v) || v.length < lo || v.length > hi) return null;
  const out = v.map((x) => (typeof x === "string" ? x.trim() : ""));
  return out.every((s) => s.length >= 1 && s.length <= 24) ? out : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const nums = (v: unknown, lo: number, hi: number): number[] | null => {
  if (!Array.isArray(v) || v.length < lo || v.length > hi) return null;
  const out = v.map(num);
  return out.every((n) => n !== null) ? out as number[] : null;
};
const pairs3 = (v: unknown, lo: number, hi: number): [number, number, number][] | null => {
  if (!Array.isArray(v) || v.length < lo || v.length > hi) return null;
  const out: [number, number, number][] = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length !== 3) return null;
    const a = num(row[0]), b = num(row[1]), w = num(row[2]);
    if (a === null || b === null || w === null || w < 1 || w > 99) return null;
    out.push([a, b, w]);
  }
  return out;
};
const bagItems = (v: unknown): [string, number, number][] | null => {
  if (!Array.isArray(v) || v.length < 2 || v.length > 5) return null;
  const out: [string, number, number][] = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length !== 3) return null;
    const name = typeof row[0] === "string" ? row[0].trim() : "";
    const w = num(row[1]), val = num(row[2]);
    if (!name || name.length > 24 || w === null || val === null || w < 1 || val < 1 || w > 99 || val > 99) return null;
    out.push([name, w, val]);
  }
  return out;
};

/* ---------- algorithms: the frames a pack draws ---------- */

export interface GraphStep { nodes: string; edges: string; vals: (number | string)[]; path?: number[]; total?: number; note: { en: string; ar: string } }

/** Dijkstra. One frame per settled place, then the path back. Undirected roads. */
export function shortest(spec: Extract<SceneSpec, { kind: "graph" }>): { total: number; path: number[]; frames: GraphStep[] } {
  const n = spec.nodes.length;
  const m = spec.edges.length;
  const adj: [number, number, number][][] = Array.from({ length: n }, () => []);
  spec.edges.forEach(([a, b, w], i) => { adj[a].push([b, w, i]); adj[b].push([a, w, i]); });
  const dist = Array<number>(n).fill(Infinity);
  const parent = Array<number>(n).fill(-1);
  const via = Array<number>(n).fill(-1);
  const done = Array<boolean>(n).fill(false);
  dist[spec.from] = 0;
  const frames: GraphStep[] = [];
  const name = (i: number) => spec.nodes[i];
  const snap = (chosen: number, note: GraphStep["note"], path?: number[]) => {
    const nodes = Array.from({ length: n }, (_, i) => (path?.includes(i) ? "p" : i === chosen ? "c" : done[i] ? "v" : dist[i] < Infinity ? "f" : ".")).join("");
    const onPath = new Set<number>();
    if (path) for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1];
      const e = spec.edges.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (e >= 0) onPath.add(e);
    }
    const edges = Array.from({ length: m }, (_, i) => (onPath.has(i) ? "p" : via.includes(i) ? "t" : ".")).join("");
    frames.push({
      nodes, edges, vals: dist.map((d) => (d === Infinity ? "∞" : d)), note,
      ...(path ? { path, total: dist[spec.to] } : {}),
    });
  };
  snap(-1, tx(`Start at ${name(spec.from)}: 0. The rest are unknown.`, `نبدأ من ${name(spec.from)}: 0، والباقي غير معروف.`));
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = true;
    if (u === spec.to) break;
    for (const [v, w, ei] of adj[u]) {
      if (!done[v] && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; parent[v] = u; via[v] = ei; }
    }
    snap(u, tx(`Settle ${name(u)}: ${dist[u]}. Check its roads.`, `نثبّت ${name(u)}: ${dist[u]}، ونفحص طرقها.`));
  }
  const path: number[] = [];
  if (dist[spec.to] < Infinity) {
    for (let x = spec.to; x !== -1; x = parent[x]) path.push(x);
    path.reverse();
  }
  const viaNames = path.map(name).join(" → ");
  const viaAr = path.map(name).join(" ← ");
  snap(-1, tx(`${viaNames}: ${dist[spec.to]}.`, `${viaAr}: ${dist[spec.to]}.`), path);
  return { total: dist[spec.to], path, frames };
}

export interface SortStep { order: number[]; compare?: number[]; swap?: number[]; done?: number[]; count: number[]; note: { en: string; ar: string } }

/** Bubble sort. Each compare, and each swap, is a frame. */
export function bubble(values: number[]): SortStep[] {
  const order = values.map((_, i) => i);
  const a = [...values];
  const frames: SortStep[] = [];
  let comps = 0, swaps = 0;
  const n = a.length;
  for (let pass = 0; pass < n; pass++) {
    for (let j = 0; j < n - 1 - pass; j++) {
      comps++;
      const gt = a[j] > a[j + 1];
      frames.push({
        order: [...order], compare: [j, j + 1], count: [comps, swaps],
        note: tx(`${a[j]} ${gt ? ">" : "≤"} ${a[j + 1]}`, `${a[j]} ${gt ? ">" : "≤"} ${a[j + 1]}`),
      });
      if (gt) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        [order[j], order[j + 1]] = [order[j + 1], order[j]];
        swaps++;
        frames.push({
          order: [...order], swap: [j, j + 1], count: [comps, swaps],
          note: tx("Swap", "تبديل"),
        });
      }
    }
  }
  frames.push({
    order: [...order], done: values.map((_, i) => i), count: [comps, swaps],
    note: tx("In order", "مرتب"),
  });
  return frames;
}

export interface BagStep { inn: string; note: { en: string; ar: string } }

/** Greedy knapsack: best value per weight first, then whatever still fits. */
export function greedyBag(items: [string, number, number][], cap: number): { value: number; frames: BagStep[] } {
  const order = items.map((it, i) => ({ i, r: it[2] / it[1] })).sort((a, b) => b.r - a.r || a.i - b.i);
  const taken = new Set<number>();
  let left = cap, value = 0;
  const frames: BagStep[] = [];
  const mark = (cur: number, letter: string, note: BagStep["note"]) => {
    const inn = items.map((_, i) => (i === cur ? letter : taken.has(i) ? "i" : ".")).join("");
    frames.push({ inn, note });
  };
  for (const { i } of order) {
    const [name, w, v] = items[i];
    if (w <= left) {
      taken.add(i); left -= w; value += v;
      mark(i, "n", tx(`${name} fits: ${left} left, ${value} points.`, `${name} تتسع: يبقى ${left}، و${value} نقطة.`));
    } else {
      mark(i, "x", tx(`${name} is ${w}, and only ${left} is left.`, `${name} وزنها ${w}، والباقي ${left} فقط.`));
    }
  }
  return { value, frames };
}

/* ---------- the canvas scene ---------- */

function place(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: Math.round((5 + 3.4 * Math.cos(a)) * 10) / 10, y: Math.round((5 + 3.4 * Math.sin(a)) * 10) / 10 };
  });
}

function anim(frames: number, dur: number): { prop: string; keys: { at: number; value: number; ease?: string }[] }[] {
  const last = Math.max(0, frames - 1);
  const keys = Array.from({ length: frames }, (_, i) => ({
    at: frames === 1 ? 0.4 : 0.4 + (i / last) * (dur - 1),
    value: i,
    ease: "linear" as const,
  }));
  return [
    { prop: "reveal", keys: [{ at: 0.3, value: 0 }, { at: 1.2, value: 1, ease: "linear" }] },
    { prop: "frame", keys },
  ];
}

const durFor = (frames: number) => Math.min(14, Math.max(8, frames * 0.7));

/** The tool result the scene model was trained to read. */
export function sceneResult(spec: SceneSpec): Record<string, unknown> {
  if (spec.kind === "graph") {
    const run = shortest(spec);
    return { total: run.total, path: run.path.map((i) => spec.nodes[i]) };
  }
  if (spec.kind === "sort") return { order: [...spec.values].sort((a, b) => a - b) };
  if (spec.kind === "bag") return { value: greedyBag(spec.items, spec.cap).value };
  if (spec.kind === "trace") return { total: spec.values.reduce((s, n) => s + n, 0) };
  if (spec.kind === "signal") return { on: spec.high, off: spec.low };
  if (spec.kind === "query") return { min: spec.min };
  if (spec.kind === "pattern") return { repeat: [spec.a, spec.b] };
  if (spec.kind === "net") return { layers: spec.layers, neurons: spec.layers.reduce((a, b) => a + b, 0) };
  if (spec.kind === "arch") return { blocks: spec.steps?.length ?? 5, ...(spec.preset ? { preset: spec.preset } : {}) };
  if (spec.kind === "plot") return { mode: spec.mode };
  if (spec.kind === "gates") return { gate: spec.gate };
  if (spec.kind === "bits") return { bits: spec.n, last: spec.values[spec.values.length - 1] };
  if (spec.kind === "flow") return { branch: spec.yes };
  if (spec.kind === "seq") return { steps: spec.msgs.length };
  if (spec.kind === "search") return { found: spec.values.indexOf(spec.target) };
  return { hidden: ["page", "password"] };
}

export function expand(spec: SceneSpec): BuiltScene {
  const json = sceneJson(spec);
  if (spec.kind === "net") return netScene(spec, json);
  if (spec.kind === "arch") return archScene(spec, json);
  if (spec.kind === "plot") return plotScene(spec, json);
  if (spec.kind === "gates") return gatesScene(spec, json);
  if (spec.kind === "bits") return bitsScene(spec, json);
  if (spec.kind === "flow") return flowScene(spec, json);
  if (spec.kind === "seq") return seqScene(spec, json);
  if (spec.kind === "search") return searchScene(spec, json);
  if (spec.kind === "graph") {
    const run = shortest(spec);
    const dur = durFor(run.frames.length);
    const nodes = place(spec.nodes.length).map((p, i) => ({
      ...p, label: spec.nodes[i], at: "b" as const, ...(i === spec.to ? { shape: "square" as const } : {}),
    }));
    const via = run.path.map((i) => spec.nodes[i]).join(", ");
    const told = tx(
      `Dijkstra settles the nearest place first. The shortest way is ${via}: ${run.total}.`,
      `ديكسترا يثبّت أقرب مكان أولًا. أقصر طريق هو ${via}، ${run.total}.`,
    );
    const body = {
      id: "map", x: 80, y: 108, w: 1120, h: 560, type: "graph", fit: "fill",
      nodes, edges: spec.edges.map(([a, b, w]) => ({ a, b, w })),
      frames: run.frames.map((f) => ({ nodes: f.nodes, edges: f.edges, vals: f.vals, note: f.note, ...(f.path ? { path: f.path, total: f.total } : {}) })),
      totalLabel: tx("Shortest way", "أقصر طريق"), unit: tx("km", "كم"), anim: anim(run.frames.length, dur),
    };
    return built(spec, json, dur, told, tx("The shortest way", "أقصر طريق"), body, "steps");
  }
  if (spec.kind === "sort") {
    const frames = bubble(spec.values);
    const dur = durFor(frames.length);
    const swaps = frames.filter((f) => f.swap).length;
    const sorted = [...spec.values].sort((a, b) => a - b).join(", ");
    const swapEn = swaps === 1 ? "It makes 1 swap" : `It makes ${swaps} swaps`;
    const swapAr = swaps === 1 ? "يفعل تبديلًا واحدًا" : `يفعل ${swaps} تبديلات`;
    const line = tx(
      `Bubble sort compares neighbours and swaps them when the left one is bigger. ${swapEn}. In order: ${sorted}.`,
      `الترتيب الفقاعي يقارن كل جارين ويبدّلهما إذا كان الأيسر أكبر. ${swapAr}. بعد الترتيب: ${sorted}.`,
    );
    const body = {
      id: "arr", x: 48, y: 120, w: 1184, h: 540, type: "array", values: spec.values, index: true,
      frames: frames.map((f) => ({
        order: f.order, count: f.count, note: f.note,
        ...(f.compare ? { compare: f.compare } : {}), ...(f.swap ? { swap: f.swap } : {}), ...(f.done ? { done: f.done } : {}),
      })),
      anim: anim(frames.length, dur),
    };
    return built(spec, json, dur, line, tx("Bubble sort", "الترتيب الفقاعي"), body, "steps");
  }
  if (spec.kind === "signal") return signalScene(spec, json);
  if (spec.kind === "trace") return traceScene(spec, json);
  if (spec.kind === "packet") return packetScene(spec, json);
  if (spec.kind === "query") return queryScene(spec, json);
  if (spec.kind === "pattern") return patternScene(spec, json);
  const run = greedyBag(spec.items, spec.cap);
  const dur = durFor(run.frames.length);
  const line = tx(
    `Pack the best points per kilo first, then whatever still fits. The score is ${run.value}.`,
    `عبّئ الأغلى لكل كيلو أولًا، ثم ما يتسع بعد ذلك. المجموع ${run.value}.`,
  );
  const body = {
    id: "truck", x: 160, y: 100, w: 960, h: 580, type: "knapsack", cap: spec.cap,
    items: spec.items.map(([label, w, v]) => ({ label, w, v })),
    unit: tx("kg", "كغ"), vunit: tx("points", "نقطة"),
    frames: run.frames.map((f) => ({ in: f.inn, note: f.note })),
    anim: anim(run.frames.length, dur),
  };
  return built(spec, json, dur, line, tx("Pack the truck", "حمّل الشاحنة"), body, "steps");
}

function built(spec: SceneSpec, json: string, dur: number, line: { en: string; ar: string }, title: { en: string; ar: string }, body: unknown, pace: BuiltScene["pace"]): BuiltScene {
  const scene = {
    id: "s1" as const, template: "canvas" as const, narration: line,
    content: { elements: [{ id: "title", type: "text", x: 48, y: 28, w: 1184, size: 42, weight: 800, text: title }, body] },
  };
  return { spec, json, dur, line, pace, scene };
}

/** A sweep of one value, used when the pack treats `frame` as time rather than a step index. */
function sweep(dur: number, from: number, to: number) {
  return [
    { prop: "reveal", keys: [{ at: 0.3, value: 0 }, { at: dur - 0.4, value: 1, ease: "linear" }] },
    { prop: "frame", keys: [{ at: 0.4, value: from }, { at: dur - 0.4, value: to, ease: "linear" }] },
  ];
}

function signalScene(spec: Extract<SceneSpec, { kind: "signal" }>, json: string): BuiltScene {
  const dur = 10;
  const curve: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const t = Math.round((8 + (i / 32) * 8) * 100) / 100;
    const rise = Math.sin(Math.PI * (i / 32));
    const v = spec.adc
      ? Math.round((0.4 + 3.2 * rise) * 100) / 100
      : Math.round((22 + (spec.high + 3 - 22) * rise) * 10) / 10;
    curve.push([t, v]);
  }
  const samples = curve.filter((_, i) => i % 4 === 0);
  let on = false;
  const out: [number, number][] = [[8, 0]];
  for (const [t, v] of samples) {
    const next: boolean = on ? v >= spec.low : v >= spec.high;
    if (next !== on) { on = next; out.push([t, on ? 1 : 0]); }
  }
  const line = spec.adc
    ? tx(
      `An ADC with ${spec.adc} bits turns the smooth reading into ${2 ** spec.adc} steps, so the value jumps from step to step.`,
      `محوّل بـ ${spec.adc} بتات يحوّل القراءة الملساء إلى ${2 ** spec.adc} درجات، فتقفز القيمة من درجة إلى أخرى.`,
    )
    : tx(
      `The fan switches on above ${spec.high} and off only below ${spec.low}. Two lines stop it flickering.`,
      `تعمل المروحة فوق ${spec.high} ولا تتوقف إلا تحت ${spec.low}. الخطان يمنعانها من التذبذب.`,
    );
  const body = {
    id: "sig", x: 48, y: 100, w: 1184, h: 560, type: "signal",
    xr: [8, 16], yr: spec.adc ? [0, 4] : [20, 36],
    curve, samples, threshold: [spec.high, spec.low], out, readout: spec.adc ? "both" : "value",
    ...(spec.adc ? { adc: { bits: spec.adc, lo: 0, hi: 4 } } : {}),
    unit: spec.adc ? "V" : "°C",
    xLabel: tx("time", "الزمن"), yLabel: tx(spec.adc ? "volts" : "°C", spec.adc ? "فولت" : "°م"),
    outLabel: tx("fan", "المروحة"),
    anim: sweep(dur, 8, 16),
  };
  return built(spec, json, dur, line, spec.adc ? tx("Bits chop the reading", "البتات تقطّع القراءة") : tx("Two thresholds", "عتبتان"), body, "lesson");
}

function traceScene(spec: Extract<SceneSpec, { kind: "trace" }>, json: string): BuiltScene {
  const values = spec.values;
  const marks = `[${values.join(", ")}]`;
  const code = `marks = ${marks}\ntotal = 0\nfor m in marks:\n    total = total + m\nprint(total)`;
  const steps: { line: number; vars: Record<string, string>; out?: number }[] = [
    { line: 1, vars: { marks } },
    { line: 2, vars: { marks, total: "0" } },
  ];
  let total = 0;
  for (const m of values) {
    steps.push({ line: 3, vars: { marks, total: String(total), m: String(m) } });
    total += m;
    steps.push({ line: 4, vars: { marks, total: String(total), m: String(m) } });
  }
  steps.push({ line: 5, vars: { marks, total: String(total), m: String(values[values.length - 1]) }, out: 1 });
  const dur = durFor(steps.length);
  const line = tx(
    `Python runs one line at a time. total starts at 0 and grows by each mark. It prints ${total}.`,
    `ينفّذ بايثون سطرًا في كل مرة. يبدأ total من صفر ويكبر بكل درجة. ويطبع ${total}.`,
  );
  const body = {
    id: "code", x: 80, y: 110, w: 1120, h: 540, type: "trace", code, steps,
    output: `${total}\n`,
    labels: { vars: tx("Variables", "المتغيرات"), out: tx("Output", "المخرجات") },
    anim: anim(steps.length, dur),
  };
  return built(spec, json, dur, line, tx("One line at a time", "سطر في كل مرة"), body, "steps");
}

function packetScene(spec: Extract<SceneSpec, { kind: "packet" }>, json: string): BuiltScene {
  const dur = 8;
  const line = tx(
    "On open Wi-Fi, HTTP shows the page and the password. HTTPS still shows the address, and scrambles the rest.",
    "على واي فاي مفتوح، يُظهر HTTP الصفحة وكلمة المرور. ويُظهر HTTPS العنوان فقط، ويشفّر الباقي.",
  );
  const body = {
    id: "packet", x: 80, y: 120, w: 1120, h: 520, type: "packet", watch: true,
    fields: [
      { name: tx("From", "من"), value: "192.168.1.20", size: "4 B" },
      { name: tx("To", "إلى"), value: "203.0.113.10", size: "4 B" },
      { name: tx("Port", "المنفذ"), value: "443", size: "2 B" },
      { name: tx("Page", "الصفحة"), value: "/grades", size: "8 B", secret: true, cipher: "8727 81bc" },
      { name: tx("Password", "كلمة المرور"), value: "••••••••", size: "8 B", secret: true, cipher: "d5c4 6651" },
    ],
    groups: [
      { label: tx("IP header", "ترويسة IP"), span: 2, tone: "accent" },
      { label: "TCP", span: 1, tone: "accent2" },
      { label: tx("Data", "البيانات"), span: 2, tone: "ok" },
    ],
    anim: sweep(dur, 0, 1),
  };
  return built(spec, json, dur, line, tx("What HTTPS hides", "ما الذي يخفيه HTTPS"), body, "lesson");
}

function queryScene(spec: Extract<SceneSpec, { kind: "query" }>, json: string): BuiltScene {
  const rows: [string, number][] = [["Amina", 78], ["Joseph", 45], ["Salma", 91], ["Musa", 62]];
  const keep = rows.map((_, i) => i).filter((i) => rows[i][1] >= spec.min);
  const ordered = [...keep].sort((a, b) => rows[b][1] - rows[a][1]);
  const at = (i: number) => keep.indexOf(i);
  const top = ordered.slice(0, 2);
  const sql = `SELECT name, mark\nFROM results\nWHERE mark >= ${spec.min}\nORDER BY mark DESC\nLIMIT 2`;
  const words = {
    Amina: tx("Amina", "أمينة"), Joseph: tx("Joseph", "جوزيف"), Salma: tx("Salma", "سلمى"), Musa: tx("Musa", "موسى"),
  };
  const steps = [
    { kind: "from", lines: [1], views: [{ g: 0, rows: [0, 1, 2, 3] }] },
    { kind: "where", lines: [2], views: [{ g: 0, rows: [0, 1, 2, 3], out: [0, 1, 2, 3].filter((i) => rows[i][1] < spec.min), lit: [1] }] },
    { kind: "select", lines: [0], views: [{ g: 1, rows: keep.map((_, i) => i) }] },
    { kind: "order", lines: [3], views: [{ g: 1, rows: ordered.map(at), sort: [[1, "desc"]], lit: [1] }] },
    { kind: "limit", lines: [4], views: [{ g: 1, rows: ordered.map(at), out: ordered.slice(2).map(at), cut: 2, sort: [[1, "desc"]] }] },
    { kind: "result", lines: [], views: [{ g: 1, rows: top.map(at), sort: [[1, "desc"]] }] },
  ];
  const dur = durFor(steps.length);
  const names = top.map((i) => rows[i][0]).join(", ");
  const line = tx(
    `WHERE keeps marks of ${spec.min} or more. ORDER BY puts the highest first, and LIMIT keeps two: ${names}.`,
    `يبقي WHERE الدرجات من ${spec.min} فأكثر. ويضع ORDER BY الأعلى أولًا، ويبقي LIMIT اثنين: ${names}.`,
  );
  const body = {
    id: "q", x: 48, y: 110, w: 1184, h: 560, type: "query", sql, words, layout: "top",
    grids: [
      { name: "results", cols: ["name", "mark"], rows },
      { cols: ["name", "mark"], rows: keep.map((i) => rows[i]) },
    ],
    steps, anim: anim(steps.length, dur),
  };
  return built(spec, json, dur, line, tx("The query, one clause at a time", "الاستعلام، بندًا بعد بند"), body, "steps");
}

function patternScene(spec: Extract<SceneSpec, { kind: "pattern" }>, json: string): BuiltScene {
  const values = [spec.a, spec.b, spec.a, spec.b, spec.a];
  const frames = [0, 1, 2, 3].map((i) => ({
    order: [0, 1, 2, 3, 4],
    compare: [i % 2 === 0 ? 0 : 1, i % 2 === 0 ? 2 : 3],
    note: tx(`${spec.a}, ${spec.b} repeats`, `${spec.a}، ${spec.b} يتكرّران`),
  }));
  const dur = durFor(frames.length);
  const line = tx(
    `A pattern is something that repeats. Here ${spec.a} is always followed by ${spec.b}.`,
    `النمط شيء يتكرّر. هنا يأتي ${spec.b} دائمًا بعد ${spec.a}.`,
  );
  const body = {
    id: "arr", x: 48, y: 140, w: 1184, h: 480, type: "array", values, index: true,
    frames, anim: anim(frames.length, dur),
  };
  return built(spec, json, dur, line, tx("Something that repeats", "شيء يتكرّر"), body, "steps");
}

function netScene(spec: Extract<SceneSpec, { kind: "net" }>, json: string): BuiltScene {
  const L = spec.layers;
  const single = L.length === 2 && L[1] === 1;
  if (single) {
    const k = L[0];
    const ws = spec.w && spec.w.length === k ? spec.w : Array.from({ length: k }, (_, i) => (i === 0 ? 7 : i === 1 ? 5 : 4));
    const bias = spec.b ?? -8;
    const patterns: number[][] = [
      Array.from({ length: k }, () => 0),
      Array.from({ length: k }, (_, i) => (i === 0 ? 1 : 0)),
      Array.from({ length: k }, (_, i) => (i === 1 % k ? 1 : 0)),
      Array.from({ length: k }, () => 1),
    ];
    const sig = (z: number) => Math.round((1 / (1 + Math.exp(-z))) * 100) / 100;
    const weights = patterns.map(() => [ws.map((w) => [w / 10])]);
    const acts = patterns.map((inp) => {
      const z = inp.reduce((s, x, i) => s + x * ws[i], bias) / 3;
      return [inp, [sig(z)]];
    });
    const inNames = (spec.in ?? ["x₁", "x₂", "x₃", "x₄", "x₅", "x₆"]).slice(0, k).map((s) => tx(s, s));
    const outName = tx(spec.out ?? "y", spec.out ?? "y");
    const dur = 8;
    const line = tx(
      `A neuron multiplies its ${k} inputs by weights (${ws.join(", ")}), adds a bias (${bias}), and passes the sum through an activation so the output fires from 0 to 1.`,
      `تضرب الخلية العصبية مدخلاتها الـ ${k} في الأوزان (${ws.join("، ")})، وتجمع الانحياز (${bias})، وتحوّل المجموع عبر دالة تنشيط ليخرج رقم بين 0 و 1.`,
    );
    const body = {
      id: "net", x: 80, y: 110, w: 1120, h: 540, type: "net", layers: L, weights, acts, values: true,
      labels: { in: inNames, out: [outName], layers: [tx("Inputs", "المدخلات"), tx("Neuron", "الخلية العصبية")] },
      anim: [
        { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: 1.0, value: 1, ease: "linear" }] },
        { prop: "frame", keys: [{ at: 0.8, value: 0 }, { at: dur - 0.5, value: patterns.length - 1, ease: "linear" }] },
        { prop: "pass", keys: [{ at: 0.8, value: 0 }, { at: 3.8, value: 1, ease: "linear" }, { at: 4.1, value: 0 }, { at: dur - 0.4, value: 1, ease: "linear" }] },
      ],
    };
    return built(spec, json, dur, line, tx("Inside one artificial neuron", "داخل خلية عصبية واحدة"), body, "lesson");
  }
  const framesN = 6;
  const weights: number[][][][] = [];
  const acts: number[][][] = [];
  for (let f = 0; f < framesN; f++) {
    const prog = f / (framesN - 1);
    const wf = L.slice(1).map((n, l) =>
      Array.from({ length: L[l] }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          const base = Math.sin(1.7 * (l + 1) + 2.1 * i + 1.1 * j);
          const learned = Math.cos(0.9 * (l + 1) + 1.4 * i - 0.8 * j);
          return Math.round(((1 - prog) * base * 0.5 + prog * learned * 0.95) * 100) / 100;
        }),
      ),
    );
    const a: number[][] = [Array.from({ length: L[0] }, (_, i) => Math.round((0.4 + 0.5 * Math.sin(f + i * 1.3)) * 100) / 100)];
    for (let l = 0; l < L.length - 1; l++) {
      const next = Array.from({ length: L[l + 1] }, (_, j) => {
        const s = a[l].reduce((acc, v, i) => acc + v * wf[l][i][j], 0);
        return Math.round(Math.tanh(s) * 100) / 100;
      });
      a.push(next);
    }
    weights.push(wf);
    acts.push(a);
  }
  const dur = 9;
  const hidden = L.length - 2;
  const line = tx(
    `A neural network connects layers of neurons (${L.join(" → ")}). A forward pass sends activations through ${hidden} hidden ${hidden === 1 ? "layer" : "layers"} to make a guess, and a backward pass sends the error back to adjust every weight.`,
    `تربط الشبكة العصبية طبقات من الخلايا (${L.join(" ← ")}). تمرّر التمريرة الأمامية الإشارات عبر ${hidden === 1 ? "طبقة مخفية" : "طبقات مخفية"} للتخمين، وتعيد التمريرة الخلفية الخطأ لتعديل الأوزان.`,
  );
  const body = {
    id: "net", x: 64, y: 108, w: 1152, h: 548, type: "net", layers: L, weights, acts, values: Math.max(...L) <= 4,
    labels: {
      layers: L.map((n, i) =>
        i === 0 ? tx(`Input (${n})`, `مدخلات (${n})`) : i === L.length - 1 ? tx(`Output (${n})`, `مخرجات (${n})`) : tx(`Hidden (${n})`, `مخفية (${n})`),
      ),
    },
    anim: [
      { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: 1.2, value: 1, ease: "linear" }] },
      { prop: "frame", keys: [{ at: 0.8, value: 0 }, { at: dur - 0.4, value: framesN - 1, ease: "linear" }] },
      { prop: "pass", keys: [{ at: 1.0, value: 0 }, { at: 4.2, value: 1, ease: "linear" }, { at: 6.8, value: 2, ease: "linear" }, { at: 8.6, value: 1, ease: "linear" }] },
    ],
  };
  return built(spec, json, dur, line, tx("How a neural network learns", "كيف تتعلّم الشبكة العصبية"), body, "lesson");
}

type ArchBlockSpec = [id: string, kind: string, en: string, ar: string, noteEn?: string, noteAr?: string];

const ARCH_INFO: Record<ArchPresetName, { title: { en: string; ar: string }; line: { en: string; ar: string }; blocks: ArchBlockSpec[]; skip?: [string, string][] }> = {
  mlp: {
    title: tx("Multi-layer network", "شبكة متعددة الطبقات"),
    line: tx("Inputs pass through dense hidden layers with ReLU activations, then softmax turns the final scores into probabilities.", "تمرّ المدخلات عبر طبقات مخفية بتفعيل ReLU، ثم يحوّل softmax الدرجات النهائية إلى احتمالات."),
    blocks: [["in", "input", "Input", "المدخلات", "x₁ … xₙ"], ["h1", "dense", "Hidden layer", "طبقة مخفية", "ReLU"], ["h2", "dense", "Hidden layer", "طبقة مخفية", "ReLU"], ["out", "softmax", "Output", "المخرجات", "softmax"]],
  },
  cnn: {
    title: tx("Convolutional network (CNN)", "شبكة التفافية للصور"),
    line: tx("Convolution filters scan small patches for edges and shapes, pooling shrinks the map, and a dense layer names the class.", "تمسح مرشّحات الالتفاف رقعًا صغيرة لالتقاط الحواف والأشكال، ويصغّر التجميع الخريطة، وتسمّي الطبقة الكاملة الفئة."),
    blocks: [["img", "input", "Image", "الصورة", "28×28"], ["c1", "conv", "Convolution", "الالتفاف", "3×3 filters"], ["p1", "pool", "Pooling", "التجميع", "2×2"], ["fc", "dense", "Dense", "طبقة كاملة", "64"], ["out", "softmax", "Class", "الفئة", "softmax"]],
  },
  rnn: {
    title: tx("Recurrent network (RNN)", "شبكة متكررة بالتسلسل"),
    line: tx("Each word updates a hidden memory state that carries context forward to predict the next word.", "تحدّث كل كلمة ذاكرة مخفية تحمل السياق إلى الخطوة التالية لتوقّع الكلمة القادمة."),
    blocks: [["x", "input", "Word now", "الكلمة الآن", "xₜ"], ["h", "rnn", "Recurrent cell", "خلية متكررة", "memory hₜ", "الذاكرة hₜ"], ["y", "softmax", "Next word", "الكلمة التالية", "yₜ"]],
  },
  transformer: {
    title: tx("Inside a Transformer", "داخل المحوّل (Transformer)"),
    line: tx("Words become token embeddings, self-attention links related words across the sentence, and feed-forward layers refine the meaning.", "تتحوّل الكلمات إلى تضمينات، ويربط الانتباه الذاتي الكلمات المتصلة في الجملة، وتصقل الشبكة الأمامية المعنى."),
    blocks: [["tok", "input", "Tokens", "الرموز"], ["emb", "embed", "Embedding", "التضمين"], ["att", "attn", "Self-attention", "الانتباه الذاتي"], ["ff", "ffn", "Feed forward", "الشبكة الأمامية"], ["out", "norm", "Context", "السياق"]],
    skip: [["emb", "out"]],
  },
  gpt: {
    title: tx("How a language model predicts the next token", "كيف يتوقّع النموذج اللغوي الرمز التالي"),
    line: tx("A language model breaks text into tokens, turns them into embeddings, uses masked attention to weigh earlier words, and scores the next token.", "يقسّم النموذج اللغوي النص إلى رموز، ويحوّلها إلى تضمينات، ويزن الكلمات السابقة بالانتباه المقنّع، ثم يختار الرمز التالي."),
    blocks: [["tok", "input", "Tokens so far", "الرموز حتى الآن"], ["emb", "embed", "Embeddings", "التضمينات"], ["att", "attn", "Masked attention", "انتباه مقنّع"], ["ff", "ffn", "Feed forward", "شبكة أمامية"], ["out", "softmax", "Next token", "الرمز التالي"]],
  },
  agent: {
    title: tx("How an AI agent uses tools", "كيف يستخدم وكيل الذكاء الاصطناعي الأدوات"),
    line: tx("An agent reads the request, plans a step with the language model, calls a tool, reads the tool result, and writes the final answer.", "يقرأ الوكيل الطلب، ويضع خطة بالنموذج اللغوي، ويستدعي أداة، ويقرأ نتيجتها، ثم يكتب الجواب النهائي."),
    blocks: [["req", "input", "Request", "الطلب"], ["llm", "model", "Language model", "النموذج اللغوي", "plans", "يخطّط"], ["tool", "tool", "Tool call", "استدعاء أداة", "search, calc", "بحث، حاسبة"], ["ans", "output", "Answer", "الجواب"]],
    skip: [["tool", "llm"]],
  },
  rag: {
    title: tx("Retrieval-augmented generation (RAG)", "التوليد المعزّز بالاسترجاع (RAG)"),
    line: tx("Instead of guessing from memory, RAG searches trusted documents first and hands the matching passages to the model so it answers with sources.", "بدل التخمين من الذاكرة، يبحث RAG في المستندات الموثوقة أولًا ويعطي الفقرات المطابقة للنموذج ليجيب بالمصادر."),
    blocks: [["q", "input", "Question", "السؤال"], ["search", "tool", "Search", "البحث"], ["docs", "store", "Documents", "المستندات"], ["llm", "model", "Language model", "النموذج اللغوي"], ["ans", "output", "Answer", "الجواب"]],
    skip: [["q", "llm"]],
  },
  autoencoder: {
    title: tx("Autoencoder: compress and rebuild", "المُرمِّز التلقائي: ضغط وإعادة بناء"),
    line: tx("The encoder squeezes the input into a tiny bottleneck code, and the decoder learns to rebuild the original from those few numbers.", "يضغط المُرمِّز المدخل في رمز صغير، ويتعلّم فكّ الترميز إعادة بناء الأصل من تلك الأرقام القليلة."),
    blocks: [["in", "input", "Input", "المدخل"], ["enc", "dense", "Encoder", "المُرمِّز", "shrinks", "يضغط"], ["code", "embed", "Bottleneck", "الرمز المضغوط"], ["dec", "dense", "Decoder", "فكّ الترميز", "rebuilds", "يعيد البناء"], ["out", "output", "Rebuilt", "النسخة"]],
  },
  gan: {
    title: tx("Generator vs discriminator (GAN)", "المولِّد في مواجهة المميِّز (GAN)"),
    line: tx("The generator makes synthetic examples from noise while the discriminator tries to spot fakes, pushing the generator to become more realistic.", "يصنع المولِّد أمثلة من الضوضاء بينما يحاول المميِّز كشف المزيّف، فيدفع المولِّد ليصبح أكثر واقعية."),
    blocks: [["noise", "input", "Noise", "ضوضاء"], ["gen", "model", "Generator", "المولِّد"], ["fake", "box", "Sample", "عيّنة"], ["disc", "model", "Discriminator", "المميِّز"], ["out", "softmax", "Real or fake?", "حقيقي أم مزيّف؟"]],
  },
  resnet: {
    title: tx("Residual connection (shortcut)", "وصلة الاختصار المتبقية (ResNet)"),
    line: tx("A skip connection carries the original signal around the layers so gradients flow cleanly even in a deep network.", "تحمل وصلة الاختصار الإشارة الأصلية حول الطبقات فتتدفّق التدرّجات بوضوح حتى في الشبكات العميقة."),
    blocks: [["in", "input", "Input", "المدخل"], ["c1", "conv", "Layer 1", "طبقة 1"], ["c2", "conv", "Layer 2", "طبقة 2"], ["add", "add", "+", "+"], ["out", "output", "Output", "المخرج"]],
    skip: [["in", "add"]],
  },
};

function archScene(spec: Extract<SceneSpec, { kind: "arch" }>, json: string): BuiltScene {
  const dur = 8;
  const info = spec.preset ? ARCH_INFO[spec.preset] : null;
  const rawSteps = spec.steps ?? ["Input", "Process", "Check", "Output"];
  const blocks = info
    ? info.blocks.map(([id, kind, en, ar, ne, na]) => ({ id, kind, label: tx(en, ar), ...(ne ? { note: tx(ne, na ?? ne) } : {}) }))
    : rawSteps.map((s, i) => ({
      id: `b${i}`,
      kind: i === 0 ? "input" : i === rawSteps.length - 1 ? "output" : i === 1 ? "model" : "tool",
      label: tx(s, s),
    }));
  const edges = [
    ...blocks.slice(1).map((b, i) => ({ from: blocks[i].id, to: b.id })),
    ...(info?.skip?.map(([from, to]) => ({ from, to, skip: true })) ?? []),
  ];
  const focusKeys = blocks.map((_, i) => ({
    at: Math.round((1.6 + (i / Math.max(1, blocks.length - 1)) * (dur - 2.4)) * 100) / 100,
    value: i + 1,
    ease: "step" as const,
  }));
  const title = spec.title ? tx(spec.title, spec.title) : info ? info.title : tx("Step by step through the system", "خطوة بخطوة عبر النظام");
  const line = info
    ? info.line
    : tx(
      `Each stage hands its output to the next: ${rawSteps.join(" → ")}.`,
      `تسلّم كل مرحلة مخرجها إلى المرحلة التالية: ${rawSteps.join(" ← ")}.`,
    );
  const body = {
    id: "arch", x: 48, y: 120, w: 1184, h: 520, type: "arch", blocks, edges,
    anim: [
      { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: 1.6, value: 1, ease: "linear" }] },
      { prop: "focus", keys: focusKeys },
      { prop: "pass", keys: [{ at: 1.6, value: 0 }, { at: dur - 0.5, value: 1, ease: "linear" }] },
    ],
  };
  return built(spec, json, dur, line, title, body, "lesson");
}

function plotScene(spec: Extract<SceneSpec, { kind: "plot" }>, json: string): BuiltScene {
  if (spec.mode === "descent") {
    const x0 = spec.start ?? 1;
    const pts: [number, number][] = [];
    let x = x0;
    for (let i = 0; i < 8; i++) {
      const y = Math.round((0.18 * (x - 4) * (x - 4) + 0.6) * 100) / 100;
      pts.push([Math.round(x * 100) / 100, y]);
      x = x - 0.85 * (0.36 * (x - 4));
    }
    const dur = durFor(pts.length);
    const line = tx(
      `Gradient descent starts at weight ${x0} and steps downhill along the slope until the error (loss) reaches its lowest point at 4.`,
      `يبدأ الانحدار التدريجي عند الوزن ${x0} وينزل مع الميل خطوة بعد خطوة حتى يصل الخطأ (الخسارة) إلى أدنى نقطة عند 4.`,
    );
    const body = {
      id: "plot", x: 64, y: 110, w: 1152, h: 548, type: "plot", xr: [0, 8], yr: [0, 4], grid: true,
      xLabel: tx("Weight", "الوزن"), yLabel: tx("Error (loss)", "الخطأ (الخسارة)"),
      series: [
        { kind: "fn", fn: "0.18*(x-4)*(x-4)+0.6", tone: "fg", label: tx("Loss curve", "منحنى الخسارة") },
        { kind: "marker", pts, trail: true, tone: "accent", label: tx("Step downhill", "خطوة للأسفل") },
      ],
      anim: anim(pts.length, dur),
    };
    return built(spec, json, dur, line, tx("Gradient descent: stepping downhill", "الانحدار التدريجي: النزول نحو أقل خطأ"), body, "steps");
  }
  if (spec.mode === "loss") {
    const pts: [number, number][] = Array.from({ length: 8 }, (_, i) => [i + 1, Math.round((0.12 + 0.82 * Math.exp(-0.42 * i)) * 100) / 100]);
    const dur = durFor(pts.length);
    const line = tx(
      "Each training epoch compares predictions against the true labels and nudges the weights, so the loss drops from 0.94 down to 0.16.",
      "تقارن كل جولة تدريب التوقّعات بالإجابات الصحيحة وتعدّل الأوزان، فينخفض الخطأ من 0.94 إلى 0.16.",
    );
    const body = {
      id: "plot", x: 64, y: 110, w: 1152, h: 548, type: "plot", xr: [1, 8], yr: [0, 1], grid: true,
      xLabel: tx("Epoch", "جولة التدريب"), yLabel: tx("Loss", "الخسارة"),
      series: [
        { kind: "line", pts, tone: "accent", label: tx("Training loss", "خسارة التدريب") },
        { kind: "marker", pts, trail: true, tone: "ok" },
      ],
      anim: anim(pts.length, dur),
    };
    return built(spec, json, dur, line, tx("Loss drops as the model trains", "انخفاض الخسارة أثناء التدريب"), body, "steps");
  }
  if (spec.mode === "distribution") {
    const pts: [number, number][] = [[0, 0.1], [1, 0.3], [2, 0.8], [3, 1.8], [4, 3.5], [5, 4.6], [6, 3.5], [7, 1.8], [8, 0.8], [9, 0.3], [10, 0.1]];
    const dur = 8;
    const line = tx(
      "The mean marks the centre at 5. The standard deviation is a typical distance from that centre: about 2 here, so most values lie between 3 and 7.",
      "يحدّد المتوسط المركز عند 5. والانحراف المعياري مسافة معتادة عن المركز: نحو 2 هنا، لذلك تقع أغلب القيم بين 3 و7.",
    );
    const body = {
      id: "plot", x: 64, y: 110, w: 1152, h: 548, type: "plot", xr: [0, 10], yr: [0, 5], grid: true,
      xLabel: tx("Value", "القيمة"), yLabel: tx("How common", "مدى الشيوع"),
      series: [
        { kind: "area", pts, tone: "accent", label: tx("Distribution", "التوزيع") },
        { kind: "vline", at: 5, tone: "ok", label: tx("Mean = 5", "المتوسط = 5") },
        { kind: "vline", at: 3, tone: "accent2", label: tx("−1 standard deviation", "−1 انحراف معياري") },
        { kind: "vline", at: 7, tone: "accent2", label: tx("+1 standard deviation", "+1 انحراف معياري") },
      ],
      anim: [
        { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: 2.0, value: 1, ease: "linear" }] },
        { prop: "focus", keys: [{ at: 2.0, value: 1 }, { at: 4.0, value: 2 }, { at: 5.5, value: 3 }, { at: 7.0, value: 4 }] },
      ],
    };
    return built(spec, json, dur, line, tx("Mean and standard deviation", "المتوسط والانحراف المعياري"), body, "lesson");
  }
  const dots: [number, number][] = [[1.2, 3.2], [2.0, 3.6], [2.6, 2.9], [1.6, 2.4], [4.2, 1.2], [5.0, 1.8], [5.4, 0.9], [4.6, 2.1]];
  const cls = [0, 0, 0, 0, 1, 1, 1, 1];
  const params = [[0.1, 2.2], [-0.1, 2.6], [-0.3, 3.1], [-0.5, 3.7], [-0.65, 4.2], [-0.75, 4.5]];
  const dur = durFor(params.length);
  const line = tx(
    "A classifier learns a boundary line that separates the two groups of points, tilting the line each round to fix mistakes.",
    "يتعلّم المصنِّف خطًا فاصلًا يفصل بين مجموعتَي النقاط، ويميل الخط في كل جولة لتصحيح الأخطاء.",
  );
  const body = {
    id: "plot", x: 64, y: 110, w: 1152, h: 548, type: "plot", xr: [0, 6], yr: [0, 4.5], grid: true,
    xLabel: tx("Feature 1", "السمة 1"), yLabel: tx("Feature 2", "السمة 2"),
    series: [
      { kind: "dots", pts: dots, cls, label: tx("Examples", "الأمثلة") },
      { kind: "fn", fn: "a*x+b", params, tone: "accent", label: tx("Decision boundary", "الحدّ الفاصل") },
    ],
    anim: anim(params.length, dur),
  };
  return built(spec, json, dur, line, tx("Learning a decision boundary", "تعلّم الحدّ الفاصل"), body, "steps");
}

function gatesScene(spec: Extract<SceneSpec, { kind: "gates" }>, json: string): BuiltScene {
  const g = spec.gate;
  const one = g === "not";
  const frames = one ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  const dur = durFor(frames.length);
  const explain: Record<typeof g, { en: string; ar: string }> = {
    and: tx("An AND gate outputs 1 only when both inputs A and B are 1.", "تُخرج بوابة AND القيمة 1 فقط عندما يكون المدخلان A و B معًا 1."),
    or: tx("An OR gate outputs 1 whenever at least one input is 1.", "تُخرج بوابة OR القيمة 1 متى كان أحد المدخلين على الأقل 1."),
    xor: tx("An XOR gate outputs 1 when the two inputs are different, and 0 when they match.", "تُخرج بوابة XOR القيمة 1 عندما يختلف المدخلان، و 0 عندما يتطابقان."),
    not: tx("A NOT gate flips the bit: 0 becomes 1, and 1 becomes 0.", "تقلب بوابة NOT البت: فيتحوّل 0 إلى 1، ويتحوّل 1 إلى 0."),
  };
  const body = {
    id: "gates", x: 64, y: 116, w: 1152, h: 536, type: "gates",
    inputs: one ? [{ id: "a", label: tx("A", "A") }] : [{ id: "a", label: tx("A", "A") }, { id: "b", label: tx("B", "B") }],
    gates: [{ id: "g1", kind: g, in: one ? ["a"] : ["a", "b"], label: tx(g.toUpperCase(), g.toUpperCase()) }],
    outputs: [{ id: "y", from: "g1", label: tx("Out", "المخرج") }],
    frames, table: true, anim: anim(frames.length, dur),
  };
  return built(spec, json, dur, explain[g], tx(`${g.toUpperCase()} logic gate and truth table`, `بوابة ${g.toUpperCase()} وجدول الحقيقة`), body, "steps");
}

function bitsScene(spec: Extract<SceneSpec, { kind: "bits" }>, json: string): BuiltScene {
  const dur = durFor(spec.values.length);
  const last = spec.values[spec.values.length - 1];
  const places = Array.from({ length: spec.n }, (_, i) => 2 ** (spec.n - 1 - i)).join(", ");
  const line = tx(
    `In binary, each bit doubles the place value (${places}). Adding the lit powers of two gives ${spec.values.join(" → ")} (ending at ${last}).`,
    `في النظام الثنائي، يضاعف كل بت قيمة الخانة (${places}). وجمع القوى المضيئة للعدد 2 يعطي ${spec.values.join(" ← ")} (حتى ${last}).`,
  );
  const body = {
    id: "bits", x: 64, y: 120, w: 1152, h: 520, type: "bits",
    n: spec.n, frames: spec.values, places: true, dec: true, sum: true,
    anim: anim(spec.values.length, dur),
  };
  return built(spec, json, dur, line, tx("Binary: place values in powers of 2", "النظام الثنائي: قوى العدد 2"), body, "steps");
}

function flowScene(spec: Extract<SceneSpec, { kind: "flow" }>, json: string): BuiltScene {
  const dur = 7;
  const line = tx(
    `An if/else branch checks the condition (${spec.ask}): when it is true it takes the Yes path (${spec.yes}), otherwise the No path (${spec.no}).`,
    `يفحص التفرّع الشرط (${spec.ask}): فإن تحقّق سلك مسار نعم (${spec.yes})، وإلا سلك مسار لا (${spec.no}).`,
  );
  const body = {
    id: "flow", x: 80, y: 104, w: 1120, h: 560, type: "flowchart",
    nodes: [
      { id: "start", kind: "start", label: tx("Start", "البداية") },
      { id: "dec", kind: "decision", label: tx(spec.ask, spec.ask), tone: "accent" },
      { id: "yes", kind: "process", label: tx(spec.yes, spec.yes), tone: "ok" },
      { id: "no", kind: "process", label: tx(spec.no, spec.no), tone: "accent2" },
      { id: "end", kind: "end", label: tx("Done", "النهاية") },
    ],
    edges: [
      { from: "start", to: "dec" },
      { from: "dec", to: "yes", label: tx("Yes", "نعم") },
      { from: "dec", to: "no", label: tx("No", "لا") },
      { from: "yes", to: "end" },
      { from: "no", to: "end" },
    ],
    path: ["start", "dec", "yes", "end"],
    anim: [
      { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: 1.6, value: 1, ease: "linear" }] },
      { prop: "pass", keys: [{ at: 1.6, value: 0 }, { at: dur - 0.5, value: 1, ease: "linear" }] },
    ],
  };
  return built(spec, json, dur, line, tx("How a condition branches", "كيف يتفرّع الشرط"), body, "lesson");
}

function seqScene(spec: Extract<SceneSpec, { kind: "seq" }>, json: string): BuiltScene {
  const dur = 8;
  const glyphFor = (name: string) => {
    const s = name.toLowerCase();
    if (/user|you|pupil|teacher|أنت|مستخدم|معلم/.test(s)) return "user";
    if (/guard|shield|filter|حارس|فلتر|حماية/.test(s)) return "shield";
    if (/attack|fake|phish|eye|مهاجم|مزيف/.test(s)) return "eye";
    if (/tool|db|data|أداة|قاعدة/.test(s)) return "tool";
    if (/model|agent|ai|نموذج|وكيل/.test(s)) return "bot";
    return "server";
  };
  const participants = spec.actors.map((a, i) => ({ id: `p${i}`, glyph: glyphFor(a), label: tx(a, a) }));
  const messages = spec.msgs.map(([from, to, label], i) => ({
    from: `p${from}`, to: `p${to}`, label: tx(label, label), reply: from > to, lock: /code|token|https|otp|رمز|مشفر/i.test(label) || i === spec.msgs.length - 1,
  }));
  const focusKeys = messages.map((_, i) => ({
    at: Math.round((1.5 + (i / Math.max(1, messages.length - 1)) * (dur - 2.3)) * 100) / 100,
    value: i + 1,
    ease: "step" as const,
  }));
  const stepsText = spec.msgs.map(([a, b, m]) => `${spec.actors[a]} → ${spec.actors[b]} (${m})`).join(", ");
  const line = tx(
    `Watch the messages in order: ${stepsText}.`,
    `تابع الرسائل بالترتيب: ${stepsText}.`,
  );
  const body = {
    id: "seq", x: 64, y: 110, w: 1152, h: 548, type: "sequence", participants, messages,
    anim: [
      { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: dur - 1.2, value: 1, ease: "linear" }] },
      { prop: "focus", keys: focusKeys },
    ],
  };
  return built(spec, json, dur, line, tx("Step-by-step message flow", "تدفّق الرسائل خطوة بخطوة"), body, "lesson");
}

function searchScene(spec: Extract<SceneSpec, { kind: "search" }>, json: string): BuiltScene {
  const values = spec.values;
  const frames: { lo: number; mid: number; hi: number; found?: number; note: { en: string; ar: string } }[] = [];
  let lo = 0, hi = values.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = values[mid];
    if (v === spec.target) {
      found = mid;
      frames.push({ lo, mid, hi, found: mid, note: tx(`Found ${v}`, `وُجد ${v}`) });
      break;
    }
    if (v < spec.target) {
      frames.push({ lo, mid, hi, note: tx(`${v} < ${spec.target}: go right`, `${v} < ${spec.target}: لليمين`) });
      lo = mid + 1;
    } else {
      frames.push({ lo, mid, hi, note: tx(`${v} > ${spec.target}: go left`, `${v} > ${spec.target}: لليسار`) });
      hi = mid - 1;
    }
  }
  if (!frames.length) frames.push({ lo: 0, mid: 0, hi: values.length - 1, note: tx("Not found", "غير موجود") });
  const dur = durFor(frames.length);
  const line = tx(
    `Binary search checks the middle item of the sorted list and halves the search range each step${found >= 0 ? ` until it finds ${spec.target} at index ${found}` : ""}.`,
    `يفحص البحث الثنائي العنصر الأوسط في القائمة المرتّبة ويقسم النطاق إلى النصف في كل خطوة${found >= 0 ? ` حتى يجد ${spec.target} في الخانة ${found}` : ""}.`,
  );
  const body = {
    id: "arr", x: 48, y: 120, w: 1184, h: 540, type: "array", values, index: true,
    frames, anim: anim(frames.length, dur),
  };
  return built(spec, json, dur, line, tx("Binary search: halve the list", "البحث الثنائي: تقسيم القائمة لنصفين"), body, "steps");
}

const TOPICS: Record<string, string> = {
  "opt-dijkstra": "path", "opt-greedy": "bag", "iot-temperature": "sensor", "iot-adc": "adc",
  "trace-loop": "loop", "array-bubble": "sort", "query-top": "query", "net-https": "packet",
  pattern: "pattern", neuron: "neuron", "model-net": "net", transformer: "transformer",
  descent: "descent", gates: "gates", binary: "bits", branch: "flow", phishing: "phishing", search: "search",
};

function mix(question: string): number {
  let h = 2166136261;
  for (let i = 0; i < question.length; i++) h = Math.imul(h ^ question.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The compact scene for this course idea, built from the question. Numbers in the question are copied.
 * Anything else changes with the wording, so two questions are two pictures. This is the JSON the model writes.
 */
export function specForTopic(topic: string, question: string): SceneSpec | null {
  const kind = TOPICS[topic] ?? topic;
  const h = mix(question);
  const digits = [...question.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n <= 99);
  const n = (lo: number, hi: number, shift: number) => lo + ((h >>> shift) % (hi - lo + 1));
  if (kind === "neuron") {
    const k = digits.find((x) => x >= 2 && x <= 5) ?? 2;
    const w = Array.from({ length: k }, (_, i) => n(4, 9, i * 4));
    const b = -(w[0] + 1);
    return { kind: "net", layers: [k, 1], w, b };
  }
  if (kind === "net") {
    const small = digits.filter((x) => x >= 1 && x <= 6);
    const layers = small.length >= 2 && small.length <= 4 ? small : [n(2, 3, 0), n(3, 5, 4), n(1, 2, 8)];
    return { kind: "net", layers };
  }
  if (kind === "mlp" || kind === "cnn" || kind === "rnn" || kind === "transformer" || kind === "gpt" || kind === "agent" || kind === "rag" || kind === "autoencoder" || kind === "gan" || kind === "resnet") {
    return { kind: "arch", preset: kind };
  }
  if (kind === "descent") return { kind: "plot", mode: "descent", start: digits.find((x) => x <= 7) ?? n(0, 2, 0) };
  if (kind === "loss") return { kind: "plot", mode: "loss" };
  if (kind === "fit") return { kind: "plot", mode: "fit" };
  if (kind === "distribution") return { kind: "plot", mode: "distribution" };
  if (kind === "gates") {
    const q = question.toLowerCase();
    const gate = /\bxor\b/.test(q) ? "xor" : /\bnot\b/.test(q) ? "not" : /\bor\b/.test(q) ? "or" : "and";
    return { kind: "gates", gate };
  }
  if (kind === "bits") {
    const picked = digits.filter((x) => x >= 0 && x < 16);
    const values = picked.length >= 2 ? picked.slice(0, 5) : [1, n(2, 5, 0), n(6, 10, 4), n(11, 15, 8)];
    return { kind: "bits", n: 4, values };
  }
  if (kind === "flow") {
    const cut = digits.find((x) => x >= 10 && x <= 99) ?? 50;
    return { kind: "flow", ask: `mark >= ${cut}?`, yes: "Pass", no: "Review" };
  }
  if (kind === "phishing") {
    return { kind: "seq", actors: ["Attacker", "You", "Real site"], msgs: [[0, 1, "Urgent fake link"], [1, 1, "Check address"], [1, 2, "Open real site"]] };
  }
  if (kind === "auth") {
    return { kind: "seq", actors: ["You", "Phone", "Server"], msgs: [[0, 2, "Passphrase"], [2, 1, "One-time code"], [0, 2, "Code verified"]] };
  }
  if (kind === "guardrail") {
    return { kind: "seq", actors: ["User", "Guardrail", "Agent", "Tool"], msgs: [[0, 1, "Prompt"], [1, 2, "Safe request"], [2, 3, "Allowed call"], [3, 0, "Verified reply"]] };
  }
  if (kind === "search") {
    const base = [2, 5, 9, 14, 21, 30];
    const target = digits.find((x) => x <= 99) ?? base[n(1, 4, 0)];
    const values = base.includes(target) ? base : [...base.slice(0, 5), target].sort((a, b) => a - b);
    return { kind: "search", values, target };
  }
  if (kind === "sort") {
    const values = digits.length >= 3 ? digits.slice(0, 6) : [n(1, 9, 0), n(1, 9, 4), n(1, 9, 8), n(1, 9, 12)];
    return { kind: "sort", values };
  }
  if (kind === "loop") {
    const values = digits.length >= 3 ? digits.slice(0, 4).map((x) => Math.min(20, x)) : [n(1, 9, 0), n(1, 9, 5), n(1, 9, 10)];
    return { kind: "trace", values };
  }
  if (kind === "sensor") {
    const high = digits.find((x) => x >= 20 && x <= 40) ?? n(28, 34, 0);
    return { kind: "signal", high, low: Math.max(0, high - 3) };
  }
  if (kind === "adc") return { kind: "signal", high: 3, low: 1, adc: digits.find((x) => x >= 2 && x <= 8) ?? 3 };
  if (kind === "packet") return { kind: "packet" };
  if (kind === "query") return { kind: "query", min: digits.find((x) => x >= 40 && x <= 80) ?? 50 };
  if (kind === "pattern") {
    let a = n(1, 8, 0), b = n(1, 8, 6);
    if (a === b) b = (b % 8) + 1;
    return { kind: "pattern", a, b };
  }
  if (kind === "bag") {
    const cap = digits.find((x) => x >= 4 && x <= 20) ?? n(6, 12, 0);
    const items: [string, number, number][] = [["books", n(2, 5, 2), n(1, 4, 8)], ["desks", n(2, 6, 4), n(2, 5, 10)], ["chalk", n(1, 3, 6), n(1, 3, 12)]];
    return { kind: "bag", cap, items };
  }
  if (kind === "path") {
    const w1 = n(2, 6, 0), w2 = n(2, 6, 4), w3 = n(3, 8, 8);
    return { kind: "graph", nodes: ["Home", "Tala", "Bora", "School"], edges: [[0, 1, w1], [1, 3, w2], [0, 2, w3], [2, 3, n(2, 5, 12)]], from: 0, to: 3 };
  }
  return null;
}

const OFF_TOPIC = /\b(?:weather|rain tomorrow|rain on friday|forecast|sunny|hot will it be|essay|homework|poem|bedtime story|short story|puppy|dragon|recipe|cook chicken|pancakes|bake bread|football|world cup|basketball|capital of|capital city|continents|first president|movie|famous actor|song about|diet for losing|tallest mountain|love letter|bicycle tyre|bus to downtown|break into|steal a password|hack into|guess someone|fake bank message|bypass two-factor|plant malware|crack a wi-fi|private messages|steal session|impersonate|phishing link that steals|disable the firewall|cheat on my)\b|الطقس|حالة الجو|سيمطر|مشمس|درجة الحرارة غد|مقال|موضوعًا عن موسم|واجب التاريخ|قصيدة|قصة قبل النوم|قصة قصيرة|وصفة لتحضير|حساء الدجاج|الفطائر|أخبز الخبز|كرة القدم|كأس العالم|كرة السلة|عاصمة فرنسا|عاصمة البرازيل|عدد القارات|فيلمًا|أغنية|حمية لإنقاص|أعلى جبل|إطار الدراجة|أخترق حساب|أقتحم حساب|أسرق كلمة|اختراق شبكة|أخمن كلمة|رسالة بنك مزيفة|أتجاوز التحقق|أقتحم قاعدة|أزرع برنامج|أكسر كلمة|الرسائل الخاصة|لسرقة جلسة|أنتحل شخصية|يسرق كلمات المرور|أعطّل الجدار|الغش في الاختبار/i;

/**
 * Picks and parameterizes a Lesson Studio scene for any question about the courses.
 * Returns null for off-topic or harmful requests.
 */
export function specFromQuestion(question: string): SceneSpec | null {
  if (OFF_TOPIC.test(question)) return null;
  const q = question.normalize("NFKC").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  if (/gradient|descent|learning rate|slope|انحدار\s+تدريجي|الانحدار\s+التدريجي|معدل\s+التعلم/.test(q)) return specForTopic("descent", question);
  if (/loss|epoch|training curve|خساره|جوله\s+تدريب/.test(q)) return specForTopic("loss", question);
  if (/\b(?:standard deviation|histogram|distribution|mean|median|mode|range|outlier|iqr|population|sample|margin of error)\b|انحراف\s+معياري|مدرج\s+تكراري|توزيع|متوسط|وسيط|منوال|مدي|قيمه\s+شاذه|مجتمع|عينه|هامش\s+الخطا/.test(q)) return specForTopic("distribution", question);
  if (/cnn|convolut|vision|pixel|filter|pooling|التفاف|تجميع|التفافيه|رؤيه|بكسل|الصور/.test(q)) return specForTopic("cnn", question);
  if (/rnn|recurrent|متكرره/.test(q)) return specForTopic("rnn", question);
  if (/transformer|self-attention|attention|انتباه|محول/.test(q) && !/تناظري/.test(q)) return specForTopic("transformer", question);
  if (/gpt|llm|language model|next word|next token|token|embedding|(?:ال)?نموذج\s+(?:ال)?لغوي|تضمين|رموز/.test(q)) return specForTopic("gpt", question);
  if (/rag|retrieval|استرجاع/.test(q)) return specForTopic("rag", question);
  if (/autoencoder|bottleneck|(?:ال)?ترميز\s+(?:ال)?تلقائي|(?:ال)?مرمز\s+(?:ال)?تلقائي/.test(q)) return specForTopic("autoencoder", question);
  if (/gan|discriminator|adversarial network|deepfake|تزييف|مولد|المميز/.test(q)) return specForTopic("gan", question);
  if (/resnet|residual|skip connection|وصله\s+الاختصار|(?:ال)?شبكه\s+(?:ال)?متبقيه|متبقيه/.test(q)) return specForTopic("resnet", question);
  if (/\bmlp\b|multi-layer|متعدده\s+الطبقات/.test(q) || (/الطبقات\s+المخفيه/.test(q) && !/(?:ال)?تعلم\s+(?:ال)?عميق/.test(q))) return specForTopic("mlp", question);
  if (/neuron|perceptron|activation|weight|bias|(?:ال)?خليه\s+(?:ال)?عصبيه|بيرسبترون|تفعيل|انحياز/.test(q) && !/network|شبكه/.test(q)) {
    return specForTopic("neuron", question);
  }
  if (/neural|model network|network of neurons|deep learning|hidden layer|backprop|(?:ال)?شبكه\s+(?:ال)?عصبيه|طبقات\s+مخفيه|انتشار\s+خلفي|(?:ال)?تعلم\s+(?:ال)?عميق/.test(q)) {
    return specForTopic("net", question);
  }
  if (/prompt injection|guardrail|jailbreak|least privilege|red team|حقن\s+الاوامر|حواجز\s+الحمايه|اقل\s+صلاحيه/.test(q)) return specForTopic("guardrail", question);
  if (/agent|tool call|planner|memory|وكيل|اداه/.test(q)) return specForTopic("agent", question);
  if (/classif|decision boundary|overfit|underfit|regression|k-means|knn|cluster|separate two groups|يفصل.*مجموعتين|مجموعتين|تصنيف|مصنف|فرط\s+التخصيص|الحد\s+الفاصل/.test(q)) return specForTopic("fit", question);
  if (/logic gate|and gate|or gate|xor|not gate|truth table|boolean|بوابه|بوابات|جدول\s+الحقيقه/.test(q)) return specForTopic("gates", question);
  if (/analog to digital|\badc\b|محول\s+تناظري|المجول\s+التناظري|التناظري/.test(q)) return specForTopic("adc", question);
  if (/binary search|search|(?:ال)?بحث\s+(?:ال)?ثنائي|ابحث/.test(q)) return specForTopic("search", question);
  if (/binary|bits|byte|ثنائي|بتات|بايت/.test(q)) return specForTopic("bits", question);
  if (/sensor|threshold|temperature|the fan|flicker|حساس|مستشعر|عتبه|مروحه|تذبذب/.test(q)) return specForTopic("sensor", question);
  if (/sql|query|select|where|database|tidy table|table|join|استعلام|قاعده\s+البيانات|الجدول\s+المرتب|جدول/.test(q)) return specForTopic("query", question);
  if (/bubble sort|sorting|\bsort\b|ترتيب\s+فقاعي|الترتيب\s+الفقاعي|فقاعي|(?:^|\s)رتب(?:\s|$)/.test(q)) return specForTopic("sort", question);
  if (/dijkstra|shortest path|shortest way|اقصر\s+طريق|ديكسترا/.test(q)) return specForTopic("path", question);
  if (/knapsack|greedy|pack the truck|the truck|الحقيبه|الجشعه|الشاحنه/.test(q)) return specForTopic("bag", question);
  if (/\bif\b|else|branch|condition|flowchart|decision tree|algorithm|شرط|تفرع|مخطط\s+انسيابي|المخطط\s+الانسيابي|شجره\s+قرار|خوارزميه/.test(q)) return specForTopic("flow", question);
  if (/loop|\bfor\b|while|variable|python|trace|حلقه|تكرار\s+في\s+البرنامج|متغير|بايثون/.test(q)) return specForTopic("loop", question);
  if (/pattern|repeat|نمط|انماط|تكرار/.test(q)) return specForTopic("pattern", question);
  if (/phish|scam|fake link|pretends.*bank|تتظاهر.*بنك|تصيد|احتيال|رابط\s+مزيف/.test(q)) return specForTopic("phishing", question);
  if (/2fa|two-factor|two factor|passphrase|password|authentication|عباره\s+المرور|كلمه\s+المرور|التحقق\s+بخطوتين|مصادقه/.test(q)) return specForTopic("auth", question);
  if (/https|http|packet|encryption|cipher|wi-fi|wifi|تشفير|حزم|واي\s+فاي/.test(q)) return specForTopic("packet", question);
  if (/pipeline|clean data|csv|schema|spreadsheet|تنظيف البيانات|خط انابيب/.test(q)) {
    return { kind: "arch", title: "Data pipeline: raw to clean", steps: ["Raw CSV", "Clean & check", "Transform", "Table & chart"] };
  }
  if (/schedule|timetable|linear programming|constraint|solver|sudoku|جدول حصص|برمجه خطيه|قيود|سودوكو/.test(q)) {
    return { kind: "arch", title: "Constraint solver", steps: ["Variables", "Constraints", "Objective", "Best schedule"] };
  }
  if (/prompt|context|hallucination|bias|fact|verify|\bai\b|artificial intelligence|machine learning|dataset|data|circuit|microcontroller|pico|firewall|backup|malware|stack|recursion|bug|array|الطلب|الذكاء الاصطناعي|تعلم الاله|انحياز|بيانات|دائره|جدار ناري|نسخ احتياطي|مكدس|عوديه|خطا برمجي/.test(q)) {
    if (/prompt|context|الطلب|سياق/.test(q)) return { kind: "arch", title: "From prompt to answer", steps: ["Role & context", "Clear task", "Language model", "Checked output"] };
    if (/circuit|microcontroller|pico|دائره|متحكم/.test(q)) return { kind: "arch", title: "Input, board, output", steps: ["Sensor input", "Microcontroller", "Code rule", "LED or motor"] };
    if (/firewall|backup|malware|جدار ناري|نسخ احتياطي/.test(q)) return { kind: "arch", title: "Defence in layers", steps: ["Traffic in", "Firewall rules", "Least privilege", "Offline backup"] };
    if (/stack|recursion|bug|array|مكدس|عوديه|خطا/.test(q)) return { kind: "arch", title: "How the program runs it", steps: ["Input values", "Step & check", "Update state", "Return result"] };
    return { kind: "arch", title: "How an AI model works", steps: ["Examples (data)", "Train weights", "Test on new data", "Prediction"] };
  }
  return null;
}

type CourseTerm = [term: string, track: string];
const COURSE_TERMS = courseTerms as CourseTerm[];
const courseNorm = (s: string) =>
  ` ${s.normalize("NFKC").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** A compact, answer-free index of authored course terms. The neural model still gets first chance to write the JSON;
 * this chooses the allowed pack family and supplies the fallback when a 3M model does not recognize a fresh wording. */
export function specFromCourse(question: string): SceneSpec | null {
  const hay = courseNorm(question);
  let found: CourseTerm | null = null;
  for (const row of COURSE_TERMS) {
    if (hay.includes(` ${row[0]} `)) { found = row; break; }
  }
  if (!found) return null;
  // Let a named concept select a precise pack before using its curriculum track's general visual language.
  const precise = specFromQuestion(`${question} ${found[0]}`);
  if (precise) return precise;
  switch (found[1]) {
    case "a": return specForTopic("net", question);
    case "i": return specForTopic("sensor", question);
    case "c": return specForTopic("packet", question);
    case "p": return specForTopic("loop", question);
    case "d": return specForTopic("query", question);
    case "o": return specForTopic("path", question);
    case "g": return specForTopic("agent", question);
    case "s": return specForTopic("guardrail", question);
    case "x": return specForTopic("distribution", question);
    default: return null;
  }
}
