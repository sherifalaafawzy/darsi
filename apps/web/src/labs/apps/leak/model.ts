/**
 * Memorisation and privacy on a tiny word model. A trigram model (each word predicted from the two before it) is
 * trained on a few made-up school sentences, one of which is a private record. With no privacy, the model has simply
 * memorised the secret and repeats it when prompted. "Privacy" here drops anything it saw too few times and flattens
 * the rest, so the secret stops coming out — at the cost of some ordinary usefulness. A membership-inference guess
 * then shows an attacker can still often tell which sentences were in the training set. Pure and deterministic.
 *
 * Everything is invented and harmless: a made-up pupil and a made-up card number, never a real person or number.
 */
export type Lang = "en" | "ar";

/** The private line the model should not leak (made up). Its tail words are unique in the corpus. */
export const SECRET: Record<Lang, { prompt: string; answer: string }> = {
  en: { prompt: "amina bello library card number is", answer: "4471 9032" },
  ar: { prompt: "رقم بطاقة مكتبة أمينة بيلو هو", answer: "4471 9032" },
};

/** The training corpus: ordinary school sentences plus one private record. */
export const CORPUS: Record<Lang, string[]> = {
  en: [
    "the library opens at eight in the morning",
    "the library opens every school day",
    "please return your book on time",
    "please return the book to the shelf",
    "the science club meets on monday",
    "the science club meets after lunch",
    "reading helps you learn new words",
    "reading a book every week is a good habit",
    "amina bello library card number is 4471 9032",
  ],
  ar: [
    "تفتح المكتبة في الثامنة صباحا",
    "تفتح المكتبة كل يوم دراسي",
    "من فضلك أعد كتابك في الوقت",
    "من فضلك أعد الكتاب إلى الرف",
    "يجتمع نادي العلوم يوم الاثنين",
    "يجتمع نادي العلوم بعد الغداء",
    "القراءة تساعدك على تعلم كلمات جديدة",
    "قراءة كتاب كل أسبوع عادة جيدة",
    "رقم بطاقة مكتبة أمينة بيلو هو 4471 9032",
  ],
};

/** Ordinary sentences the model never trained on, for membership inference and for measuring usefulness. */
export const HELDOUT: Record<Lang, string[]> = {
  en: ["the library opens every morning", "please return the book on monday", "the science club meets on time", "reading a new book is a good habit"],
  ar: ["تفتح المكتبة كل صباح", "من فضلك أعد الكتاب يوم الاثنين", "يجتمع نادي العلوم في الوقت", "قراءة كتاب جديد عادة جيدة"],
};

export const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export interface Model { ctx: Map<string, Map<string, number>>; vocab: Set<string> }
const key = (a: string, b: string) => `${a}\u0001${b}`;

/** Count every trigram in the corpus (the two previous words → the next word). */
export function train(corpus: string[]): Model {
  const ctx = new Map<string, Map<string, number>>(), vocab = new Set<string>();
  for (const line of corpus) {
    const t = ["<s>", "<s>", ...tokens(line), "</s>"];
    for (const w of t) vocab.add(w);
    for (let i = 2; i < t.length; i++) {
      const c = key(t[i - 2], t[i - 1]);
      const m = ctx.get(c) ?? new Map<string, number>();
      m.set(t[i], (m.get(t[i]) ?? 0) + 1);
      ctx.set(c, m);
    }
  }
  return { ctx, vocab };
}

/**
 * The next-word probability, with privacy applied: continuations seen `drop` times or fewer are removed (so a one-off
 * secret disappears at drop ≥ 1), and `smooth` spreads a little probability over the whole vocabulary (flattening what
 * is left). privacy 0 = pure memorisation.
 */
export function nextDist(model: Model, a: string, b: string, privacy: number): Map<string, number> {
  const drop = privacy, smooth = privacy * 0.4;
  const raw = model.ctx.get(key(a, b)) ?? new Map();
  const kept = new Map<string, number>();
  for (const [w, n] of raw) if (n > drop) kept.set(w, n);
  const V = model.vocab.size;
  const total = [...kept.values()].reduce((s, n) => s + n, 0) + smooth * V;
  const out = new Map<string, number>();
  if (total <= 0) return out;
  for (const [w, n] of kept) out.set(w, (n + smooth) / total);
  return out;
}

/** Greedy completion of a prompt: keep taking the most likely next word until </s> or `max` words. */
export function complete(model: Model, prompt: string, privacy: number, max = 6): string {
  let a = "<s>", b = "<s>";
  for (const w of tokens(prompt)) { a = b; b = w; }
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const dist = nextDist(model, a, b, privacy);
    let best = "", p = 0;
    for (const [w, q] of dist) if (q > p) { p = q; best = w; }
    if (!best || best === "</s>") break;
    out.push(best); a = b; b = best;
  }
  return out.join(" ");
}

/** Does the model still reproduce the secret's answer when prompted? */
export function leaks(model: Model, secret: { prompt: string; answer: string }, privacy: number): boolean {
  return complete(model, secret.prompt, privacy, tokens(secret.answer).length + 1).startsWith(secret.answer);
}

/** Average log-probability per word of a sentence under the model (higher = the model finds it more familiar). */
export function logProb(model: Model, line: string, privacy: number): number {
  const t = ["<s>", "<s>", ...tokens(line), "</s>"];
  let sum = 0, n = 0;
  for (let i = 2; i < t.length; i++) {
    const p = nextDist(model, t[i - 2], t[i - 1], privacy).get(t[i]) ?? 1e-6;
    sum += Math.log(Math.max(p, 1e-6)); n++;
  }
  return n ? sum / n : -99;
}

/** Usefulness: how often the model's greedy next word matches the real next word on held-out ordinary sentences. */
export function usefulness(model: Model, lines: string[], privacy: number): number {
  let right = 0, n = 0;
  for (const line of lines) {
    const t = ["<s>", "<s>", ...tokens(line)];
    for (let i = 2; i < t.length; i++) {
      const dist = nextDist(model, t[i - 2], t[i - 1], privacy);
      let best = "", p = 0; for (const [w, q] of dist) if (q > p) { p = q; best = w; }
      if (best === t[i]) right++;
      n++;
    }
  }
  return n ? right / n : 0;
}

/**
 * Membership inference: an attacker guesses a sentence was in the training set when the model finds it unusually
 * familiar (log-prob above the midpoint between members and non-members). Returns the share guessed correctly over the
 * members and the held-out non-members — 0.5 means the attacker learns nothing.
 */
export function membershipAccuracy(model: Model, members: string[], nonMembers: string[], privacy: number): number {
  const mp = members.map((l) => logProb(model, l, privacy)), np = nonMembers.map((l) => logProb(model, l, privacy));
  const mid = (Math.max(...np) + Math.min(...mp)) / 2;
  const right = mp.filter((x) => x > mid).length + np.filter((x) => x <= mid).length;
  return (right) / (members.length + nonMembers.length);
}
