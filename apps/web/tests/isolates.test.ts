// @vitest-environment node
// The isolate rules for code and formulas in Arabic course text (scripts/lib/isolates.mjs; TECHNICAL.md "Languages and
// right-to-left"). Each case is a string from a course, as `node scripts/isolate-code.mjs --fix` should leave it.
import { describe, expect, it } from "vitest";
import { codePieces, isolatesOverLines, isolatesPair, reisolate } from "../../../scripts/lib/isolates.mjs";

/** ⟦ … ⟧ stand for the left-to-right isolate (U+2066 … U+2069), ⟨ for a first-strong one (U+2068). */
const put = (s: string) => s.replace(/⟦/g, "⁦").replace(/⟨/g, "⁨").replace(/⟧/g, "⁩");
const show = (s: string) => s.replace(/⁦/g, "⟦").replace(/⁨/g, "⟨").replace(/⁩/g, "⟧");
const plain = (s: string) => put(s).replace(/[⁦⁩]/g, "");
/** `want` is stable: --fix leaves it as it is, and its isolates pair up. */
const stable = (want: string) => { expect(show(reisolate(put(want)))).toBe(want); expect(isolatesPair(put(want))).toBe(true); };
/** The shipped (half-isolated) texts are mended to `want`, which is stable. */
const mend = (want: string, ...shipped: string[]) => { for (const s of shipped) expect(show(reisolate(put(s)))).toBe(want); stable(want); };
/** The plain text isolated gives `want`, and so does mending the shipped texts. */
const check = (want: string, ...shipped: string[]) => { expect(show(reisolate(plain(want)))).toBe(want); mend(want, ...shipped); };

describe("formulas with Greek letters, maths symbols and sub- and superscripts", () => {
  it("isolates the whole formula, not half of it", () => {
    check("الخسارة θ²، و⟦θ = 3⟧، و⟦η = 0.1⟧. أين تصبح θ بعد خطوة واحدة؟", "الخسارة θ²، وθ ⟦= 3⟧، وη ⟦= 0.1⟧. أين تصبح θ بعد خطوة واحدة؟");
    check("التدرّج ⟦2θ = 6⟧، فتصبح ⟦θ = 3 − 0.1 × 6 = 2.4⟧.", "التدرّج 2θ ⟦= 6⟧، فتصبح θ = ⟦3 − 0.1 × 6 = 2.4⟧.");
    check("⟦∂L/∂a = 2⟧ و⟦∂a/∂w = 3⟧. كم تساوي ⟦∂L/∂w⟧؟", "∂⟦L/⟧∂⟦a = 2⟧ و∂⟦a/⟧∂⟦w = 3⟧. كم تساوي ∂⟦L/⟧∂w؟");
    check("اكتب ⟦softmax(QKᵀ/√d)V⟧ وبيّن معنى كل حرف.", "اكتب ⟦softmax(QK⟧ᵀ/√⟦d)V⟧ وبيّن معنى كل حرف.");
    check("القسمة على ⟦√d⟧ موجودة أساسًا لتسريع الحساب.");
    check("يكون الثنائي min bᵀy بحيث ⟦Aᵀy ≥ c⟧ و⟦y ≥ 0⟧.", "يكون الثنائي min bᵀy بحيث Aᵀ⟦y ≥ c⟧ و⟦y ≥ 0⟧.");
    check("نقلة أسوأ بمقدار Δ باحتمال ⟦e^(−Δ/T)⟧، حيث", "نقلة أسوأ بمقدار Δ باحتمال ⟦e^(−⟧Δ/T)، حيث");
    check("تعني أن ⟦P(60 < μ < 68) = 0.95⟧.", "تعني أن ⟦P(60⟧ < μ < ⟦68) = 0.95⟧.");
    check("يكون ⟦SE = σ/√n⟧، وتعطي", "يكون ⟦SE =⟧ σ/√n، وتعطي");
    check("اشتقّ ⟦Var(x̄) = σ²/n⟧ على السبّورة", "اشتقّ ⟦Var(x⟧̄) = σ²/n على السبّورة");
    check("إذا كان الاستخدام ⟦U = Σ Cᵢ/Tᵢ ≤ n(2^(1/n) − 1)⟧، الذي", "إذا كان الاستخدام ⟦U =⟧ Σ Cᵢ/Tᵢ ≤ ⟦n(2^(1/n) − 1)⟧، الذي");
    check("⟦U = Σ Cᵢ/Tᵢ⟧، حصة وقت المعالج", "⟦U =⟧ Σ Cᵢ/Tᵢ، حصة وقت المعالج");
    check("احتمالات انتقال ⟦P(s′ | s, a)⟧ ومكافآت R", "احتمالات انتقال ⟦P(s⟧′ | s, a) ومكافآت R");
    check("ترسل أليس ⟦A = gᵃ mod p⟧، ويحقق d العلاقة ⟦e × d ≡ 1 mod φ(n)⟧.");
    check("بمقدار ⟦ε‖w‖₁ = 6.5ε⟧.");
  });

  it("joins ← only between letters, and never across a sentence's end", () => {
    check("يتباعد ⟦θ ← (1 − 2η)θ⟧ حين ⟦|1 − 2η| > 1⟧، أي ⟦η > 1⟧.", "يتباعد θ ← (⟦1 − 2⟧η)θ حين ⟦|1 − 2⟧η| ⟦> 1⟧، أي η ⟦> 1⟧.");
    check("التحديث ⟦θ ← (1 − 2 × 0.25)θ = 0.5θ⟧، فتصبح 8 ← 4 ← 2.");
    check("2. إيميل ← Continue");
    check("المقياس: ⟦1/0.1 = 10⟧ و⟦1/1 = 1⟧. ε الأصغر يعني ضجيجًا أكبر.");
  });

  it("isolates a signed number, but leaves Arabic maths right to left", () => {
    check("أوزان نموذج خطي 2 و⟦−1⟧ و3.");
    check("فقط عند ⟦k = ١⟧", "فقط عند ⟦k =⟧ ١");
    check("r = ١٧ ÷ √(١٠ × ٣٠) ≈ ٠٫٩٨: علاقة قوية.", "⟦r =⟧ ١٧ ÷ √(١٠ × ٣٠) ≈ ٠٫٩٨: علاقة قوية.");
    check("الانحراف = √(١٠ × ٣٠) تقريبًا.");
  });
});

describe("code", () => {
  it("keeps single & and |, an operator that opens a run, and a Python header's colon", () => {
    check("البت i من mask (أي ⟦mask >> i & 1⟧) يقول هل الشيء موجود.", "البت i من mask (أي ⟦mask >> i⟧ & 1) يقول هل الشيء موجود.");
    check("داخل حلقة mask: ⟦for i in range(6):⟧", "داخل حلقة ⟦mask: for i in range(6)⟧:");
    check("⟦if mask >> i & 1:⟧ ثم ⟦kg += w[i]⟧", "⟦if mask >> i⟧ & 1: ثم ⟦kg += w[i]⟧");
    check("يجعل ⟦% len(route)⟧ المكانَ التالي", "يجعل % ⟦len(route)⟧ المكانَ التالي");
    check("ومن دون ⟦& 1⟧ سيحسب الاختبار البتات الأبعد.");
    check("⟦for p in pupils:⟧", "⟦for p in pupils⟧:");
    check("ثم ⟦elif mark >= 50:⟧ للتقدير B، و⟦else:⟧ للتقدير C.");
    check("تحقّق أولًا: ⟦if name not in ALLOWED: return \"block\"⟧.");
    check("ثم لأداة send_message: ⟦if approved != args: return \"ask\"⟧.");
    check("استعمل if: تعني «إذا».");
  });

  it("keeps a glued ! and an ellipsis, slices, numbers apart and string literals whole", () => {
    check("رتّب برهان ⟦fact(n) = n!⟧.", "رتّب برهان ⟦fact(n) = n⟧!.");
    check("كما في ⟦P@ssw0rd!⟧، تحوّل كلمة مرور شائعة إلى قوية.");
    check("تعبير شرطي: ⟦k = 0 if ... else 1⟧", "تعبير شرطي: ⟦k = 0 if⟧ ... else 1");
    check("⟦UPDATE … SET seats = seats − 1 WHERE seats > 0⟧ مع فحص عدد الصفوف", "UPDATE … ⟦SET seats = seats − 1 WHERE seats > 0⟧ مع فحص عدد الصفوف");
    check("يعكس ⟦[::-1]⟧ الجزء");
    check("أجاب طالب ⟦7 7⟧. أيّ تصوّر خاطئ تكشفه؟");
    check("فتغيير a لاحقًا لا يغيّر ⟦b: 5 3⟧.");
    check("تقطع ⟦split(\"{\")⟧ الاستدعاء عند القوس المعقوف.");
    check("فعّل ⟦.venv⟧، وبعدين: ⟦python check.py --milestone <mN>⟧");
    expect(show(reisolate("5 7"))).toBe("⟦5 7⟧");
    expect(show(reisolate("P@ssw0rd!"))).toBe("⟦P@ssw0rd!⟧");
  });

  it("leaves a citation's bracket with the sentence", () => {
    check("ويصنّف تقرير NIST AI 100-2 (Vassilev وآخرون، ٢٠٢٤) هذه الهجمات.");
    mend("ويصنّف تقرير ⟦NIST AI 100-2⟧ (Vassilev وآخرون، ٢٠٢٤) هذه الهجمات.", "ويصنّف تقرير ⟦NIST AI 100-2 (Vassilev⟧ وآخرون، ٢٠٢٤) هذه الهجمات.");
    mend("ويقص ⟦DP-SGD⟧ (Abadi وآخرون، ٢٠١٦) التدرّجات", "ويقص ⟦DP-SGD (Abadi⟧ وآخرون، ٢٠١٦) التدرّجات");
    check("مثل Python Tutor (Guo، ٢٠١٣)، وصمّم");
    check("المهام (C، T) = (1، 5) و(2، 10) مللي ثانية.");
  });

  it("keeps hand-placed isolates: an operator on its own, SELECT *, a whole sentence, a first-strong one", () => {
    for (const s of ["تشمل ⟦>=⟧ العدد 10.", "تعني ⟦SELECT *⟧ كل الأعمدة.", "اكتب ⟦What is your PIN?⟧ هنا.", "تكون ⟨pass@k = 1 − (1 − p)ᵏ⟧، ويقدّم"]) stable(s);
  });
});

describe("a comparison operator named on its own", () => {
  // Between Arabic words it is mirrored (≥ shows as ≤, >= as =<): the shipped strings code-4-1, opt-s4 and code-s2 had.
  it("isolates it between Arabic words, after a proclitic, and beside another named one", () => {
    check("تشمل ⟦>=⟧ العدد 10، وتضيف ⟦passed + 1⟧ واحدًا.", "تشمل >= العدد 10، وتضيف ⟦passed + 1⟧ واحدًا.");
    check("ثلاثة قيود من نوع ⟦≥⟧ وكلفة تُصغَّر.", "ثلاثة قيود من نوع ≥ وكلفة تُصغَّر.");
    check("يعكس ⟦[::-1]⟧ الجزء، و⟦<⟧ لا يُبقي إلا المسارات الأقصر.", "يعكس [::-1] الجزء، و< لا يُبقي إلا المسارات الأقصر.");
    check("وفي Python ست مقارنات: == (يساوي)، و⟦!=⟧ (لا يساوي)، و⟦<⟧ و⟦>⟧، و⟦<=⟧ و⟦>=⟧.");
    check("قارن بـ = (يساوي)، و⟦<>⟧ (لا يساوي).");
    check("العمر 12 ليس دون 12: استعمل ⟦<⟧ لا ⟦<=⟧.");
    check("التشفير ⟦≠⟧ التحقق من الهوية.");
  });

  it("leaves Arabic maths with an operand, code it belongs to, and an operator among other symbols", () => {
    for (const s of ["إذا كانت س ≥ ٥ فاكتب نعم.", "كل مشتقة محلية ≤ 0.25 وتُضرب معًا.", "وتغطية ≥٨٠٪.", "حتى ٢ × ٢ × … ≥ ١٠٠.",
      "ثم ⟦elif mark >= 50:⟧ للتقدير B.", "أكمل ⟦escape_html(t)⟧ لتتحوّل المحارف ⟦& < > \" '⟧ إلى رموزها.", "تبقى ⟦x < y⟧ هنا."]) stable(s);
    expect(codePieces(plain("بين & < > وغيرها"))).toEqual([]);
  });
});

describe("line breaks", () => {
  const body = [
    "الضغطات بالظبط:",
    "1. افتح ⟦https://github.com/signup⟧",
    "4. ⟦Verify → Create account⟧",
    "",
    "Windows:",
    "python -m venv .venv",
    "⟦.venv\\Scripts\\activate⟧",
    "⟦Mac / Codespaces⟧:",
    "⟦source .venv/bin/activate⟧",
    "⟦python check.py --milestone <mN>⟧",
  ].join("\n");

  it("never lets a run or an isolate cross a line break, and leaves a list's number outside", () => {
    check(body);
    const shipped = "1. افتح ⟦https://github.com/signup\n2⟧. إيميل → Continue\n⟦4. Public → Create repository\n5⟧. دلوقتي\nsource .venv/bin/⟦activate\npython check.py --milestone <mN>⟧";
    const fixed = reisolate(put(shipped));
    expect(isolatesOverLines(put(shipped)).length).toBeGreaterThan(0);
    expect(isolatesOverLines(fixed)).toEqual([]);
    expect(show(fixed)).toBe("1. افتح ⟦https://github.com/signup⟧\n2. إيميل → Continue\n4. ⟦Public → Create repository⟧\n5. دلوقتي\n⟦source .venv/bin/activate⟧\n⟦python check.py --milestone <mN>⟧");
    for (const [s, e] of codePieces(plain(body))) expect(plain(body).slice(s, e)).not.toContain("\n");
  });
});

describe("a line of code inside Arabic text", () => {
  it("isolates a command line as a whole, so the symbols at its ends stay in place", () => {
    check("Codespaces (لسه مفيهوش Ollama):\n⟦curl -fsSL https://ollama.com/install.sh | sh⟧\n⟦ollama serve > /tmp/ollama.log 2>&1 &⟧\nollama pull qwen2.5:1.5b",
      "Codespaces (لسه مفيهوش Ollama):\n⟦curl -fsSL https://ollama.com/install.sh | sh⟧\nollama serve > /⟦tmp/ollama.log 2>&1⟧ &\nollama pull qwen2.5:1.5b");
  });
});
