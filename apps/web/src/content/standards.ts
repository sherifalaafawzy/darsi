import type { LocalText } from "./types";
import { COMPETENCIES } from "./competencies";

/**
 * The standards an organization can report against (TECHNICAL.md "Organization analytics"). Lessons are tagged with
 * competency codes (competencies.ts); each standard item lists the codes that give evidence for it.
 * - UNESCO for teachers and for students, and DigComp 2.2: the lessons' own codes, item by item.
 * - ISTE Standards and the CSTA K–12 CS Standards: Darsi's crosswalk, at the level of their standards (ISTE) and
 *   core concepts (CSTA). It shows where lessons give evidence; it is not an official alignment by ISTE or CSTA.
 * - Darsi strands: IoT and the newer tracks, which no international school framework covers yet.
 */
export interface StandardItem { id: string; label: LocalText; group?: LocalText; level?: LocalText; codes: string[] }
export interface Framework { id: string; name: LocalText; source: string; crosswalk?: boolean; items: StandardItem[] }

const codesOf = (fw: string) => COMPETENCIES.filter((c) => c.framework === fw);
const own = (fw: string): StandardItem[] => codesOf(fw).map((c) => ({ id: c.code, label: c.label, group: c.area, level: c.level, codes: [c.code] }));
const T = (dim: string) => ["A", "D", "C"].map((l) => `T.${dim}.${l}`);
const S = (dim: string) => ["U", "A", "C"].map((l) => `S.${dim}.${l}`);

export const FRAMEWORKS: Framework[] = [
  { id: "unesco-s", name: { en: "UNESCO AI competency framework for students", ar: "إطار اليونسكو لكفايات الذكاء الاصطناعي للطلاب" }, source: "UNESCO 2024", items: own("UNESCO-S") },
  { id: "unesco-t", name: { en: "UNESCO AI competency framework for teachers", ar: "إطار اليونسكو لكفايات الذكاء الاصطناعي للمعلمين" }, source: "UNESCO 2024", items: own("UNESCO-T") },
  { id: "digcomp", name: { en: "DigComp 2.2 (European Commission)", ar: "إطار DigComp 2.2 (المفوضية الأوروبية)" }, source: "EC JRC 2022", items: own("DigComp") },
  {
    id: "iste-s", crosswalk: true, source: "ISTE 2016",
    name: { en: "ISTE Standards for Students", ar: "معايير ISTE للطلاب" },
    items: [
      { id: "1.1", label: { en: "Empowered learner", ar: "متعلّم متمكّن" }, codes: ["DC.5.2"] },
      { id: "1.2", label: { en: "Digital citizen", ar: "مواطن رقمي" }, codes: [...S("ET"), "DC.2.6", "DC.4.1", "DC.4.2", "DC.4.3", "AGT.2"] },
      { id: "1.3", label: { en: "Knowledge constructor", ar: "باني المعرفة" }, codes: ["DC.1.1", "DC.1.2", "DC.1.3", "DATA.1"] },
      { id: "1.4", label: { en: "Innovative designer", ar: "مصمّم مبتكر" }, codes: [...S("SD"), "IOT.3", "DC.5.3", "CODE.4", "AGT.3"] },
      { id: "1.5", label: { en: "Computational thinker", ar: "مفكّر حاسوبي" }, codes: [...S("TA"), "CODE.1", "CODE.2", "CODE.3", "DATA.2", "DATA.3", "DS.1", "DS.2", "DS.3", "OPT.1", "OPT.2", "OPT.3", "IOT.1", "DC.3.4"] },
      { id: "1.6", label: { en: "Creative communicator", ar: "متواصل مبدع" }, codes: ["DS.4"] },
      { id: "1.7", label: { en: "Global collaborator", ar: "متعاون عالمي" }, codes: [...S("HM")] },
    ],
  },
  {
    id: "iste-e", crosswalk: true, source: "ISTE 2017",
    name: { en: "ISTE Standards for Educators", ar: "معايير ISTE للمعلمين" },
    items: [
      { id: "2.1", label: { en: "Learner", ar: "متعلّم" }, codes: [...T("PL"), ...T("AF")] },
      { id: "2.2", label: { en: "Leader", ar: "قائد" }, codes: ["T.HM.C", "T.PL.C"] },
      { id: "2.3", label: { en: "Citizen", ar: "مواطن" }, codes: [...T("ET"), ...T("HM")] },
      { id: "2.4", label: { en: "Collaborator", ar: "متعاون" }, codes: ["T.PL.D"] },
      { id: "2.5", label: { en: "Designer", ar: "مصمّم" }, codes: [...T("PE")] },
      { id: "2.6", label: { en: "Facilitator", ar: "ميسّر" }, codes: ["T.PE.D", "T.PE.C"] },
      { id: "2.7", label: { en: "Analyst", ar: "محلّل" }, codes: ["T.PE.C", "DS.4"] },
    ],
  },
  {
    id: "csta", crosswalk: true, source: "CSTA 2017",
    name: { en: "CSTA K–12 Computer Science Standards", ar: "معايير CSTA لعلوم الحاسب (من الروضة حتى الصف ١٢)" },
    items: [
      { id: "CS", label: { en: "Computing systems", ar: "أنظمة الحوسبة" }, codes: ["IOT.1", "IOT.3", "DC.5.1"] },
      { id: "NI", label: { en: "Networks and the Internet (with cybersecurity)", ar: "الشبكات والإنترنت (ومعها الأمن السيبراني)" }, codes: ["IOT.2", "IOT.4", "DC.4.1", "DC.4.2", "AIS.1", "AIS.2"] },
      { id: "DA", label: { en: "Data and analysis", ar: "البيانات والتحليل" }, codes: ["DATA.1", "DATA.2", "DATA.3", "DATA.4", "DS.1", "DS.2", "DS.3", "DC.1.3", ...S("TA")] },
      { id: "AP", label: { en: "Algorithms and programming", ar: "الخوارزميات والبرمجة" }, codes: ["CODE.1", "CODE.2", "CODE.3", "CODE.4", "DC.3.4", "OPT.1", "OPT.2", "OPT.3", "AGT.1", "AGT.3", ...S("SD")] },
      { id: "IC", label: { en: "Impacts of computing", ar: "آثار الحوسبة" }, codes: [...S("ET"), ...S("HM"), ...T("ET"), "OPT.4", "AGT.2", "DC.4.3", "DS.4", "AIS.3"] },
    ],
  },
  { id: "darsi", name: { en: "Darsi strands (IoT, programming, data, agents, optimization, AI security)", ar: "محاور درسي (إنترنت الأشياء، البرمجة، البيانات، الوكلاء، الحلول المثلى، أمن الذكاء الاصطناعي)" }, source: "Darsi", items: own("Darsi") },
];
export const framework = (id: string) => FRAMEWORKS.find((f) => f.id === id);
