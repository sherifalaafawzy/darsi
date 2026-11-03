import { describe, expect, it } from "vitest";
import { LIVE_PRICES, TEXT_PRICES, audioCost, buildIndex, down3, instructions, lessonMaterial, outside, pcmToUlaw, search, sections, tokens, ulawToPcm, usageCost, type TutorUnit } from "../src/tutorCore";

const unit: TutorUnit = {
  id: "ai-1-1", track: "ai", level: 1, title: { en: "AI basics", ar: "أساسيات الذكاء الاصطناعي" },
  lessons: [
    { id: "ai-1-1-1", title: { en: "What is AI?", ar: "ما الذكاء الاصطناعي؟" }, steps: [
      { id: "v", type: "video", title: { en: "Intro", ar: "مقدمة" }, transcript: { en: "AI learns patterns from examples called training data.", ar: "الذكاء الاصطناعي يتعلّم الأنماط من أمثلة اسمها بيانات التدريب." } },
      { id: "r", type: "read", title: { en: "Patterns", ar: "الأنماط" }, body: { en: "A model is what the computer learned.", ar: "النموذج هو ما تعلّمه الكمبيوتر." }, keyTerms: [{ term: { en: "Training data", ar: "بيانات التدريب" }, def: { en: "The examples a model learns from.", ar: "الأمثلة التي يتعلّم منها النموذج." } }] },
      { id: "q1", type: "choice", prompt: { en: "Where does AI learn from?", ar: "من أين يتعلّم الذكاء الاصطناعي؟" }, explain: { en: "From examples.", ar: "من الأمثلة." } },
    ] },
    { id: "ai-1-1-2", title: { en: "Bias", ar: "التحيّز" }, steps: [
      { id: "r", type: "read", title: { en: "Fairness", ar: "العدالة" }, body: { en: "Biased data makes biased models. Check who is missing from the examples.", ar: "البيانات المتحيّزة تصنع نماذج متحيّزة. تأكّد من الغائبين عن الأمثلة." } },
      { id: "p", type: "project", task: { en: "Audit a dataset in your class.", ar: "راجع مجموعة بيانات في فصلك." } },
    ] },
  ],
};

describe("course sections", () => {
  it("splits each lesson into video, reading (with key terms), practice and project, in the learner's language", () => {
    const en = sections(unit, "en");
    expect(en.map((s) => s.id)).toEqual(["ai-1-1-1/v", "ai-1-1-1/r", "ai-1-1-1/practice", "ai-1-1-2/r", "ai-1-1-2/p"]);
    expect(en[1].text).toContain("Training data: The examples a model learns from.");
    expect(sections(unit, "ar")[0].text).toContain("بيانات التدريب");
    expect(sections(unit, "fr")[0].text).toContain("training data"); // English where a language is missing
  });
  it("gives the tutor the current lesson, with section ids", () => {
    const m = lessonMaterial(unit, "ai-1-1-2", "en");
    expect(m).toContain("[ai-1-1-2/r]");
    expect(m).not.toContain("ai-1-1-1/");
    expect(lessonMaterial(unit, null, "en")).toContain("[ai-1-1-1/r]");
  });
});

describe("search", () => {
  it("folds Arabic spelling and drops 'al-' and small words", () => {
    expect(tokens("ما هي البيانات المتحيّزة؟")).toEqual(["بيانات", "متحيزه"]);
    expect(tokens("إأآا مدرسة مستشفى")).toEqual(["اااا", "مدرسه", "مستشفي"]);
    expect(tokens("What is TRAINING data")).toEqual(["training", "data"]);
  });
  it("finds the right section in both languages", () => {
    const en = buildIndex(sections(unit, "en")), ar = buildIndex(sections(unit, "ar"));
    expect(search(en, "why are models biased?")[0].s.id).toBe("ai-1-1-2/r");
    expect(search(en, "what is training data")[0].s.id).toMatch(/^ai-1-1-1\//);
    expect(search(ar, "ليه النماذج بتبقى متحيزة؟")[0].s.id).toBe("ai-1-1-2/r");
    expect(search(en, "best football team")).toEqual([]);
  });
  it("puts the section that defines a named key term first, and the learner's own course ahead of the track", () => {
    // The video mentions training data twice; the reading defines it as a key term.
    const en = buildIndex(sections(unit, "en"));
    expect(search(en, 'What does "Training data" mean? Can you give me an example?')[0].s.id).toBe("ai-1-1-1/r");
    expect(search(buildIndex(sections(unit, "ar")), "يعني إيه «بيانات التدريب»؟ ممكن مثال؟")[0].s.id).toBe("ai-1-1-1/r");
    const other: TutorUnit = { ...unit, id: "ai-s1", lessons: [{ ...unit.lessons[1], id: "ai-s1-2" }] };
    const track = buildIndex([...sections(other, "en"), ...sections(unit, "en")]);
    expect(search(track, "biased models", 4, "ai-1-1")[0].s.unitId).toBe("ai-1-1");
    expect(search(track, "biased models", 4, "ai-s1")[0].s.unitId).toBe("ai-s1");
  });
});

describe("instructions", () => {
  it("keep the tutor to the course, in Egyptian Arabic or English, short and checking understanding", () => {
    const ar = instructions({ lang: "ar", course: "AI basics", lesson: "Bias", material: "[x] text", voice: true, style: "examples" });
    expect(ar).toMatch(/answer only from the COURSE MATERIAL/);
    expect(ar).toContain("Egyptian Arabic");
    expect(ar).toContain("quick question");
    expect(ar).toContain("no markdown");
    expect(ar).toContain("The learner prefers: examples.");
    expect(instructions({ lang: "en", course: "c", lesson: "", material: "", voice: false })).not.toContain("speaking aloud");
    expect(outside("ar")).toMatch(/برّه كورساتك/);
  });
});

describe("cost", () => {
  it("prices audio and text tokens apart, and thinking as output", () => {
    const u = { promptTokenCount: 5000, responseTokenCount: 600, thoughtsTokenCount: 100,
      promptTokensDetails: [{ modality: "TEXT", tokenCount: 4000 }, { modality: "AUDIO", tokenCount: 1000 }],
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 600 }] };
    // 4000×0.75 + 1000×3 + 600×12 + 100×4.5, per million
    expect(usageCost(u, LIVE_PRICES)).toBeCloseTo((3000 + 3000 + 7200 + 450) / 1e6, 10);
    expect(usageCost({ promptTokenCount: 8000, candidatesTokenCount: 300 }, TEXT_PRICES)).toBeCloseTo((8000 * 0.3 + 300 * 2.5) / 1e6, 10);
    expect(usageCost(undefined, LIVE_PRICES)).toBe(0);
  });
  it("has a floor from the audio's minutes", () => {
    expect(audioCost(60, 60, LIVE_PRICES)).toBeCloseTo(0.023, 10);
    expect(audioCost(30, 0, LIVE_PRICES)).toBeCloseTo(0.0025, 10);
  });
});

describe("audio on the wire", () => {
  it("μ-law keeps speech within a few percent, and 24 kHz becomes 8 kHz", () => {
    const pcm = Int16Array.from({ length: 240 }, (_, i) => Math.round(12000 * Math.sin(i / 5)));
    const back = ulawToPcm(pcmToUlaw(pcm));
    for (let i = 0; i < pcm.length; i++) expect(Math.abs(back[i] - pcm[i])).toBeLessThanOrEqual(Math.max(40, Math.abs(pcm[i]) * 0.07));
    expect(pcmToUlaw(new Int16Array([0, 32767, -32768])).length).toBe(3);
    expect(Array.from(down3(new Int16Array([3, 6, 9, 30, 30, 30, 1])))).toEqual([6, 30]);
  });
});
