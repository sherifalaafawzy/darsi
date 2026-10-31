// @vitest-environment node
// Gate 4: the tokenizer round-trips English and Arabic text and gives exactly bpe.py's ids.
import { chunks, MARK } from "../../src/tinylm/tokenizer";
import { fixture, loadTokenizer, type Seg } from "./load";

const tok = loadTokenizer();
const conversations = fixture<{ segs: Seg[] }[]>("conversations.json");

describe("Darsi Tiny tokenizer", () => {
  it("has about 3,000 tokens", () => {
    expect(tok.vocab).toBe(3000);
  });

  it("gives the same ids as bpe.py", () => {
    for (const c of fixture<{ text: string; ids: number[] }[]>("tokenizer.json")) expect(tok.encode(c.text), c.text).toEqual(c.ids);
  });

  const english = ["What's the weather in Palm Hill tomorrow?", "Remind me on Monday at 3:30 pm to collect the homework.", "Sorry, I can't do that: none of my tools can help with it.",
    "Send a message to the parents' committee: Well done on the reading competition!", 'convert{"value":12.5,"from":"km","to":"mi"}'];
  const arabic = ["ما حالة الطقس في تل النخيل غدًا؟", "ذكّرني يوم الاثنين الساعة ٣:٣٠ مساءً: جمع الواجبات.", "عذرًا، لا أستطيع ذلك: لا توجد لدي أداة تساعد في هذا.",
    "هل أرسل هذه الرسالة إلى الأستاذة حداد: «يُقدَّم الغداء الساعة 12:30.»؟ أجب بنعم أو لا.", '{"books":[{"title":"طاقة من الشمس","shelf":"C2"}]}'];

  it.each([["English", english], ["Arabic", arabic]])("round-trips %s text", (_, texts) => {
    for (const s of texts) expect(tok.decode(tok.encode(s))).toBe(s);
  });

  it("round-trips every segment of the fixture conversations, in both languages", () => {
    let n = 0;
    for (const c of conversations) for (const [, text] of c.segs) { expect(tok.decode(tok.encode(text))).toBe(text); n++; }
    expect(n).toBeGreaterThan(300);
  });

  it("round-trips text it never saw: other scripts, emoji, diacritics, odd spacing", () => {
    const odd = ["Ünïcödé ñ ß Ω", "Привет, мир", "你好，世界", "👩🏽‍🏫🚌🌧️", "مَرْحَبًا ـــ", "a\tb\r\nc  d", "۱۲۳٫۵ ٪", "‏‎‏", ""];
    for (const s of odd) expect(tok.decode(tok.encode(s)), JSON.stringify(s)).toBe(s);
    // Random code points from the scripts a teacher might type.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ranges = [[0x20, 0x7e], [0xa0, 0x17f], [0x600, 0x6ff], [0x750, 0x77f], [0x2000, 0x206f], [0x1f300, 0x1f64f]];
    for (let k = 0; k < 200; k++) {
      let s = "";
      for (let i = 0; i < 1 + Math.floor(rnd() * 30); i++) { const [a, b] = ranges[Math.floor(rnd() * ranges.length)]; s += String.fromCodePoint(a + Math.floor(rnd() * (b - a))); }
      expect(tok.decode(tok.encode(s)), JSON.stringify(s)).toBe(s);
    }
  });

  it("keeps a name the same tokens in a sentence and in a tool call", () => {
    for (const name of ["Palm Hill", "Zawadi Phiri", "تل النخيل", "زوادي فيري"]) {
      const inSentence = tok.encode(`from ${name}?`).slice(2, -1);
      const inJson = tok.encode(`{"from":"${name}"}`).slice(3, -1);
      expect(inJson).toEqual(inSentence);
    }
  });

  it("never turns typed marker text into a marker", () => {
    const ids = tok.encode("<|call|>send_message{} <|end|>");
    expect(ids.some((i) => i < 8)).toBe(false);
    expect(ids).not.toContain(MARK.call);
  });

  it("splits spaces, digits and punctuation from words", () => {
    expect(chunks("Kafi 12km؟ «نعم»")).toEqual(["Kafi", " ", "1", "2", "km", "؟", " ", "«", "نعم", "»"]);
  });
});
