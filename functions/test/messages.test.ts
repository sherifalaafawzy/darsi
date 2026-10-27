import { describe, expect, it } from "vitest";
import {
  CATALOGUE, KINDS, broadcastCondition, catOf, formatNumber, isolate, linkFor, message, tagFor, topicsFor, trimFeedback, webpush, wordingFor,
  type Kind, type Lang,
} from "../src/messages";

const LANGS: Lang[] = ["en", "ar"];
const VARS = { n: 3, name: "Amina Bello", org: "Hope School", feedback: "Clear plan.", uid: "u1" };
const ARABIC_INDIC = /[٠-٩]/;
const ASCII_DIGIT = /[0-9]/;

describe("message catalogue", () => {
  it("has exactly the contract's kinds, each with a category and a link", () => {
    expect([...KINDS].sort()).toEqual([
      "comeback21", "comeback7", "daily0", "daily1", "daily2", "reviewApproved", "reviewRevise",
      "staffOrgRequest", "staffSubmission", "streak", "weekGoal",
    ]);
    const cats: Record<Kind, string> = {
      daily0: "reminders", daily1: "reminders", daily2: "reminders", weekGoal: "reminders", streak: "reminders",
      comeback7: "reminders", comeback21: "reminders", reviewApproved: "reviews", reviewRevise: "reviews",
      staffSubmission: "staff", staffOrgRequest: "staff",
    };
    for (const k of KINDS) expect(catOf(k)).toBe(cats[k]);
  });

  it("every kind has an English and an Arabic title and body, with every var filled", () => {
    for (const k of KINDS) for (const lang of LANGS) {
      const m = message(k, lang, VARS);
      expect(m.title.trim(), `${k} ${lang} title`).not.toBe("");
      expect(m.body.trim(), `${k} ${lang} body`).not.toBe("");
      expect(`${m.title} ${m.body}`, `${k} ${lang}`).not.toMatch(/[{}]|undefined|NaN/);
    }
  });

  it("Arabic never uses the · separator, and nothing uses emoji", () => {
    for (const k of KINDS) for (const lang of LANGS) {
      const { title, body } = message(k, lang, VARS);
      expect(`${title}${body}`).not.toContain("·");
      expect(`${title}${body}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("has the contract's exact wording", () => {
    const en = (k: Kind) => message(k, "en", VARS), ar = (k: Kind) => message(k, "ar", VARS);
    expect(en("daily0")).toEqual({ title: "Your 5-minute lesson is ready", body: "One short lesson today, one new idea for your class tomorrow." });
    expect(ar("daily0")).toEqual({ title: "درسك ذو الدقائق الخمس جاهز", body: "درس قصير اليوم، وفكرة جديدة لصفّك غدًا." });
    expect(en("daily1")).toEqual({ title: "Five minutes for you?", body: "Pick up where you left off. It only takes five minutes." });
    expect(ar("daily1")).toEqual({ title: "خمس دقائق لك اليوم؟", body: "تابع من حيث توقفت، فالأمر لا يستغرق سوى خمس دقائق." });
    expect(en("daily2")).toEqual({ title: "Something new for your class", body: "Today's lesson ends with an idea you can try tomorrow." });
    expect(ar("daily2")).toEqual({ title: "شيء جديد لصفّك", body: "ينتهي درس اليوم بفكرة يمكنك تجربتها غدًا." });
    expect(en("weekGoal")).toEqual({ title: "3 lessons left for this week's goal", body: "You're close. A short lesson now keeps you on track." });
    expect(ar("weekGoal")).toEqual({ title: "دروس متبقية لهدف هذا الأسبوع: ٣", body: "أنت قريب. درس قصير الآن يُبقيك على المسار." });
    expect(en("streak")).toEqual({ title: "Your streak: 3 weeks", body: "You've learned every week lately. One lesson keeps it going." });
    expect(ar("streak")).toEqual({ title: "سلسلة الأسابيع: ٣", body: "تعلّمت في كل أسبوع مؤخرًا. درس واحد يُبقي السلسلة مستمرة." });
    expect(en("comeback7")).toEqual({ title: "We saved your place", body: "Your next lesson is waiting, and it takes five minutes." });
    expect(ar("comeback7")).toEqual({ title: "حفظنا مكانك", body: "درسك التالي بانتظارك، ولا يستغرق سوى خمس دقائق." });
    expect(en("comeback21")).toEqual({ title: "New ideas for your classroom", body: "Come back for a 5-minute lesson whenever you're ready." });
    expect(ar("comeback21")).toEqual({ title: "أفكار جديدة لصفّك", body: "عُد لدرس من خمس دقائق متى كنت مستعدًا." });
    expect(en("reviewApproved")).toEqual({ title: "Your project was approved", body: "Clear plan." });
    expect(ar("reviewApproved")).toEqual({ title: "تمت الموافقة على مشروعك", body: "Clear plan." });
    expect(en("reviewRevise")).toEqual({ title: "Feedback on your project", body: "Clear plan." });
    expect(ar("reviewRevise")).toEqual({ title: "ملاحظات على مشروعك", body: "Clear plan." });
    expect(en("staffSubmission")).toEqual({ title: "New project to review", body: "⁨Amina Bello⁩ sent a project for review." });
    expect(ar("staffSubmission")).toEqual({ title: "مشروع جديد للمراجعة", body: "وصل مشروع جديد من ⁨Amina Bello⁩ للمراجعة." });
    expect(en("staffOrgRequest")).toEqual({ title: "New organization request", body: "⁨Hope School⁩ asked to join Darsi." });
    expect(ar("staffOrgRequest")).toEqual({ title: "طلب مؤسسة جديد", body: "طلبت ⁨Hope School⁩ الانضمام إلى «درسي»." });
  });

  it("weekGoal says 1 lesson / n lessons in English", () => {
    expect(message("weekGoal", "en", { n: 1 }).title).toBe("1 lesson left for this week's goal");
    expect(message("weekGoal", "en", { n: 2 }).title).toBe("2 lessons left for this week's goal");
    expect(message("weekGoal", "en", { n: 12 }).title).toBe("12 lessons left for this week's goal");
  });

  it("numbers are Arabic-Indic in Arabic and Western in English", () => {
    for (const k of ["weekGoal", "streak"] as Kind[]) {
      const ar = message(k, "ar", { n: 12 }).title, en = message(k, "en", { n: 12 }).title;
      expect(ar).toMatch(ARABIC_INDIC); expect(ar).not.toMatch(ASCII_DIGIT); expect(ar).toContain("١٢");
      expect(en).toContain("12"); expect(en).not.toMatch(ARABIC_INDIC);
    }
    expect(formatNumber(1234, "ar")).toBe("١٬٢٣٤");
    expect(formatNumber(1234, "en")).toBe("1,234");
  });

  it("wraps names in Unicode isolates so they cannot reorder the sentence", () => {
    expect(isolate("x")).toBe("⁨x⁩");
    const ar = message("staffSubmission", "ar", { name: "منى عبد الرحمن" }).body;
    expect(ar).toBe("وصل مشروع جديد من ⁨منى عبد الرحمن⁩ للمراجعة.");
    expect(message("staffOrgRequest", "en", { org: "مدرسة الأمل" }).body).toBe("⁨مدرسة الأمل⁩ asked to join Darsi.");
    // A missing name still gives a readable sentence.
    expect(message("staffSubmission", "en", {}).body).toBe("⁨—⁩ sent a project for review.");
  });
});

describe("review feedback", () => {
  it("uses the default text when there is no feedback", () => {
    for (const feedback of [undefined, "", "   \n ", 42 as unknown as string]) {
      expect(message("reviewApproved", "en", { feedback }).body).toBe("Well done, your project was approved.");
      expect(message("reviewApproved", "ar", { feedback }).body).toBe("أحسنت، تمت الموافقة على مشروعك.");
      expect(message("reviewRevise", "en", { feedback }).body).toBe("Your reviewer suggested a few changes.");
      expect(message("reviewRevise", "ar", { feedback }).body).toBe("اقترح المراجِع بعض التعديلات.");
    }
  });

  it("is trimmed to 140 characters with an ellipsis", () => {
    const long = "word ".repeat(60);
    const body = message("reviewRevise", "en", { feedback: long }).body;
    expect(Array.from(body).length).toBeLessThanOrEqual(140);
    expect(body.endsWith("…")).toBe(true);
    expect(body.startsWith("word word")).toBe(true);
    const ar = trimFeedback("أحسنت ".repeat(40));
    expect(Array.from(ar).length).toBeLessThanOrEqual(140);
    expect(ar.endsWith("…")).toBe(true);
  });

  it("keeps short feedback as written, with whitespace collapsed", () => {
    expect(trimFeedback("  Good work.\n\nAdd a photo.  ")).toBe("Good work. Add a photo.");
    const exact = "a".repeat(140);
    expect(trimFeedback(exact)).toBe(exact);
    expect(trimFeedback(`${exact}b`)).toBe(`${"a".repeat(139)}…`);
  });

  it("never cuts a character in half", () => {
    const s = "𝐀".repeat(200); // astral characters: two UTF-16 units each
    const t = trimFeedback(s);
    expect(Array.from(t)).toHaveLength(140);
    expect(t).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("links, tags and payload", () => {
  it("links are app paths from the contract", () => {
    for (const k of ["daily0", "daily1", "daily2", "weekGoal", "streak", "comeback7", "comeback21", "reviewApproved", "reviewRevise"] as Kind[]) {
      expect(linkFor(k)).toBe("/learn");
    }
    expect(linkFor("staffSubmission", { uid: "abc123" })).toBe("/teach/abc123");
    expect(linkFor("staffOrgRequest")).toBe("/super");
    for (const k of KINDS) expect(CATALOGUE[k].link.startsWith("/")).toBe(true);
  });

  it("tags: one shared tag for nudges, one per item otherwise", () => {
    for (const k of ["daily0", "daily1", "daily2", "weekGoal", "streak", "comeback7", "comeback21"] as Kind[]) expect(tagFor(k)).toBe("darsi-nudge");
    expect(tagFor("reviewApproved", "s1")).toBe("darsi-review-s1");
    expect(tagFor("reviewRevise", "s2")).toBe("darsi-review-s2");
    expect(tagFor("staffSubmission", "s3")).toBe("darsi-staff-s3");
    expect(tagFor("staffOrgRequest", "o1")).toBe("darsi-staff-o1");
  });

  it("builds a small data-only web push", () => {
    const ar = webpush(message("daily0", "ar"), "ar", "/learn", "darsi-nudge");
    expect(ar.headers).toEqual({ TTL: "86400", Urgency: "normal" });
    expect(ar.data).toEqual({ title: "درسك ذو الدقائق الخمس جاهز", body: "درس قصير اليوم، وفكرة جديدة لصفّك غدًا.", link: "/learn", tag: "darsi-nudge", lang: "ar", dir: "rtl" });
    const en = webpush(message("daily0", "en"), "en", "/learn", "darsi-nudge");
    expect(en.data.dir).toBe("ltr");
    expect(en.data.lang).toBe("en");
    for (const v of Object.values(ar.data)) expect(typeof v).toBe("string");
    expect(new TextEncoder().encode(JSON.stringify(ar)).length).toBeLessThan(1024);
  });
});

describe("announcement topics", () => {
  it("lists all, language, role and organization topics while news is on", () => {
    expect(topicsFor("ar", "teacher", "org1", true)).toEqual(["all", "lang-ar", "role-teacher", "org-org1"]);
    expect(topicsFor("en", "learner", null, true)).toEqual(["all", "lang-en", "role-learner"]);
    expect(topicsFor("en", "hacker", "bad id!", true)).toEqual(["all", "lang-en", "role-learner"]);
    expect(topicsFor("en", "teacher", "org1", false)).toEqual([]);
  });

  it("gives languages platform admins added their own topic, and anything else counts as English", () => {
    expect(topicsFor("fr", "student", null, true)).toEqual(["all", "lang-fr", "role-student"]);
    expect(topicsFor("pt-br", "student", null, true)).toContain("lang-pt-br");
    expect(topicsFor("../x", "student", null, true)).toContain("lang-en");
  });

  it("sends the Arabic text to Arabic phones and the English text to every other phone", () => {
    expect(broadcastCondition("en", { type: "all" })).toBe("'all' in topics && !('lang-ar' in topics)");
    expect(broadcastCondition("ar", { type: "org", orgId: "o1" })).toBe("'lang-ar' in topics && 'org-o1' in topics");
    expect(broadcastCondition("en", { type: "role", role: "teacher" })).toBe("'all' in topics && !('lang-ar' in topics) && 'role-teacher' in topics");
  });

  it("words a phone in an added language in English", () => {
    expect(wordingFor("fr")).toBe("en");
    expect(wordingFor("ar")).toBe("ar");
    expect(message("daily0", "fr")).toEqual(message("daily0", "en"));
  });
});
