import type { Profile } from "../src/auth/types";
import { COMPETENCIES } from "../src/content/competencies";
import { FRAMEWORKS, framework } from "../src/content/standards";
import { byCourse, byGroup, byTeacher, byTrack, filterPeople, itemEvidence, standardsReport, statusOf, totals, weekly } from "../src/admin/orgStats";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 864e5).toISOString();
const person = (uid: string, o: Partial<Profile> & { lastActive?: string } = {}, s: Partial<NonNullable<Profile["summary"]>> = {}): Profile & { lastActive?: string } => ({
  uid, name: uid, email: `${uid}@users.darsi.app`, role: "student", orgId: "o1", ...o,
  summary: { lessonsDone: 0, xp: 0, avgAccuracy: 0, lastActive: null, competencies: {}, units: {}, ...s },
});

describe("standards catalogue", () => {
  it("only uses competency codes that exist, and covers every UNESCO, DigComp and Darsi code", () => {
    const known = new Set(COMPETENCIES.map((c) => c.code));
    const used = new Set(FRAMEWORKS.flatMap((f) => f.items.flatMap((i) => i.codes)));
    expect([...used].filter((c) => !known.has(c))).toEqual([]);
    expect([...known].filter((c) => !used.has(c))).toEqual([]);
    for (const f of FRAMEWORKS) expect(new Set(f.items.map((i) => i.id)).size).toBe(f.items.length);
    expect(FRAMEWORKS.filter((f) => f.crosswalk).map((f) => f.id)).toEqual(["iste-s", "iste-e", "csta"]);
  });
});

describe("orgStats", () => {
  const amal = person("amal", { group: "5A", teacherId: "t1", lastActive: daysAgo(1) }, {
    lessonsDone: 6, avgAccuracy: 0.85, seconds: 3600, competencies: { "S.TA.U": 4, "S.HM.U": 1 }, compAcc: { "S.TA.U": 3.4, "S.HM.U": 0.9 },
    units: { "ai-s1": 5, "iot-s1": 1 }, tracks: { ai: { n: 5, acc: 4.2, sec: 3000 }, iot: { n: 1, acc: 0.9, sec: 600 } }, weeks: { "2026-W45": 2, "2026-W44": 4 },
  });
  const bola = person("bola", { group: "5A", teacherId: "t1", lastActive: daysAgo(3) }, { lessonsDone: 4, avgAccuracy: 0.45, seconds: 1200, competencies: { "S.TA.U": 2 }, compAcc: { "S.TA.U": 0.9 }, units: { "ai-s1": 4 }, tracks: { ai: { n: 4, acc: 1.8, sec: 1200 } } });
  const chidi = person("chidi", { group: "5B", teacherId: "t2", lastActive: daysAgo(30) }, { lessonsDone: 2, avgAccuracy: 0.9, units: { "ai-s1": 2 } });
  const dina = person("dina", { group: "5B" });
  const teacher = person("t1", { role: "teacher", lastActive: daysAgo(0) }, { lessonsDone: 3, avgAccuracy: 0.7, competencies: { "T.AF.A": 3 } });
  const all = [amal, bola, chidi, dina, teacher];

  it("says who is on track, needs support, is inactive or has not started", () => {
    expect([amal, bola, chidi, dina].map((p) => statusOf(p, NOW))).toEqual(["onTrack", "support", "inactive", "notStarted"]);
  });
  it("filters by audience, class and teacher", () => {
    expect(filterPeople(all, { audience: "students" }).map((p) => p.uid)).toEqual(["amal", "bola", "chidi", "dina"]);
    expect(filterPeople(all, { audience: "teachers" }).map((p) => p.uid)).toEqual(["t1"]);
    expect(filterPeople(all, { audience: "students", group: "5B" }).map((p) => p.uid)).toEqual(["chidi", "dina"]);
    expect(filterPeople(all, { audience: "all", teacher: "t1" }).map((p) => p.uid)).toEqual(["amal", "bola"]);
  });
  it("adds up people, activity, lessons, scores and time", () => {
    const students = filterPeople(all, { audience: "students" });
    expect(totals(students, NOW)).toEqual({ people: 4, active7: 2, active30: 2, lessons: 12, seconds: 4800, avgAccuracy: (0.85 + 0.45 + 0.9) / 3, status: { onTrack: 1, support: 1, inactive: 1, notStarted: 1 } });
    expect(weekly(students, NOW).slice(-2)).toEqual([{ week: "2026-W44", v: 4 }, { week: "2026-W45", v: 2 }]);
    expect(byTrack(students)).toEqual([{ track: "ai", people: 2, lessons: 9, avgAccuracy: 6 / 9, seconds: 4200 }, { track: "iot", people: 1, lessons: 1, avgAccuracy: 0.9, seconds: 600 }]);
    expect(byCourse(students, [{ id: "ai-s1", lessons: 5 }, { id: "iot-s1", lessons: 5 }, { id: "cyber-s1", lessons: 5 }]))
      .toEqual([{ id: "ai-s1", started: 3, completed: 1 }, { id: "iot-s1", started: 1, completed: 0 }]);
    expect(byGroup(students, NOW).map((g) => [g.group, g.people, g.status.support])).toEqual([["5A", 2, 1], ["5B", 2, 0]]);
  });
  it("measures each standard: who reached it, how strongly, and their score on its lessons", () => {
    const fw = framework("unesco-s")!;
    const ta = fw.items.find((i) => i.id === "S.TA.U")!;
    expect(itemEvidence(amal, ta)).toEqual({ n: 4, level: 3, acc: 0.85 });
    expect(itemEvidence(dina, ta)).toEqual({ n: 0, level: 0, acc: null });
    const row = standardsReport([amal, bola, chidi, dina], fw).find((r) => r.item.id === "S.TA.U")!;
    expect(row.levels).toEqual([2, 0, 1, 1]); // chidi and dina have none, bola 2 lessons, amal 4
    expect(row.reached).toBe(2);
    expect(row.avgAccuracy).toBeCloseTo((0.85 + 0.45) / 2);
    // A crosswalk item counts every code it lists: ISTE 1.5 includes S.TA.*.
    const iste = framework("iste-s")!.items.find((i) => i.id === "1.5")!;
    expect(itemEvidence(amal, iste).n).toBe(4);
  });
});

describe("byTeacher", () => {
  it("puts each teacher's own learning beside their students'", () => {
    const t1 = person("t1", { role: "teacher", name: "Grace", lastActive: daysAgo(1) }, { lessonsDone: 5, avgAccuracy: 0.8, seconds: 3000, competencies: { "T.AF.A": 3, "T.ET.A": 1 } });
    const t2 = person("t2", { role: "teacher", name: "Ahmed" });
    const s1 = person("s1", { teacherId: "t1", lastActive: daysAgo(2) }, { lessonsDone: 4, avgAccuracy: 0.5 });
    const s2 = person("s2", { teacherId: "t1", lastActive: daysAgo(20) }, { lessonsDone: 2, avgAccuracy: 0.9 });
    const rows = byTeacher([t1, t2, s1, s2], framework("unesco-t")!, NOW);
    expect(rows.map((r) => r.teacher.uid)).toEqual(["t2", "t1"]); // by name
    const g = rows[1];
    expect(g.own).toMatchObject({ lessons: 5, avgAccuracy: 0.8, seconds: 3000, secure: 1, reached: 2 });
    expect(g.students).toMatchObject({ people: 2, active7: 1, lessons: 6, status: { support: 1, inactive: 1, onTrack: 0, notStarted: 0 } });
    expect(rows[0].students.people).toBe(0);
  });
});
