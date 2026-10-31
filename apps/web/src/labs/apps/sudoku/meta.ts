import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "sudoku", category: "opt-search", level: 2, minutes: 7, order: 2,
  title: { en: "Sudoku by the rules", ar: "السودوكو بالقواعد" },
  summary: { en: "Solve 4×4 and 9×9 sudokus the way constraint solvers do: candidates crossed out by propagation, guesses only when stuck, and the guess counts against plain backtracking.", ar: "حُلّ ألغاز سودوكو ٤×٤ و٩×٩ كما تفعل برامج حلّ القيود: يشطب الانتشار المرشّحين، ولا تخمين إلا عند التوقف، مع عدد التخمينات مقارنةً بالتراجع البسيط." },
};
