import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "kali", category: "cyber-privacy", level: 3, minutes: 15, order: 4,
  title: { en: "Kali Linux terminal", ar: "طرفية كالي لينكس" },
  summary: {
    en: "A safe, offline Kali terminal. Run real pentest tools — nmap, dig, gobuster, sqlmap, hydra, john — against one fictional practice target and learn recon → scanning → enumeration → the weak login → the fix.",
    ar: "طرفية كالي آمنة تعمل دون إنترنت. شغّل أدوات اختبار اختراق حقيقية — nmap وdig وgobuster وsqlmap وhydra وjohn — على هدف تدريبي خيالي وتعلّم: الاستطلاع ثم الفحص ثم التعداد ثم تسجيل الدخول الضعيف ثم الإصلاح.",
  },
};
