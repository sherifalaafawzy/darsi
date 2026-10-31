/**
 * The Python modules learners' programs can import, written to MicroPython's /lib when it starts (the sandbox, and
 * tests/code/node.ts): csv (MicroPython has none), machine (the virtual IoT board) and Darsi's small OR-Tools,
 * `from ortools.sat.python import cp_model` and `from ortools.linear_solver import pywraplp`, so the same programs also
 * run on the real OR-Tools.
 */
import csv from "./pylib/csv.py?raw";
import cpModel from "./pylib/cp_model.py?raw";
import pywraplp from "./pylib/pywraplp.py?raw";
import machine from "./pylib/machine.py?raw";

export const PY_LIB: Record<string, string> = {
  "/lib/csv.py": csv,
  "/lib/machine.py": machine,
  "/lib/ortools/__init__.py": "",
  "/lib/ortools/sat/__init__.py": "",
  "/lib/ortools/sat/python/__init__.py": "",
  "/lib/ortools/sat/python/cp_model.py": cpModel,
  "/lib/ortools/linear_solver/__init__.py": "",
  "/lib/ortools/linear_solver/pywraplp.py": pywraplp,
};
