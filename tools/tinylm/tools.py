"""The ten school tools Darsi Tiny can call, as deterministic functions of (world, arguments, language).

Results are small JSON objects. Words in results come in the conversation's language (the app knows it; the model never
passes it). src/tinylm/tools.ts implements the same functions over world.json; tests/tinylm/tools.test.ts checks both
give identical results for every call in the test sets. Keep the two in step, down to the JSON key order.
"""
from __future__ import annotations

import json
import math
import re

from world import DAYS, WEATHER_DAYS, WEEKDAYS, normalize

TOOLS = ["calculator", "timetable", "weather", "library", "attendance", "glossary", "reminder", "convert", "route", "send_message"]

WHEN = re.compile(r"^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday) ([01][0-9]|2[0-3]):[0-5][0-9]$")


def dumps(obj) -> str:
    """Compact JSON, non-ASCII kept: the same text as JSON.stringify."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def fmt(v: float):
    """Rounded to 2 decimals (half up), an int when whole: the same as Math.floor(v * 100 + 0.5) / 100 in JS."""
    r = math.floor(v * 100 + 0.5) / 100
    if r == int(r):
        return int(r)
    return r


class _Expr:
    """+ - * / and brackets over decimal numbers; unary minus. Anything else is a bad expression."""

    def __init__(self, s: str):
        self.s = s.replace(" ", "")
        self.i = 0

    def parse(self) -> float:
        if not self.s or len(self.s) > 80:
            raise ValueError("bad expression")
        v = self.expr()
        if self.i != len(self.s):
            raise ValueError("bad expression")
        return v

    def peek(self):
        return self.s[self.i] if self.i < len(self.s) else ""

    def expr(self) -> float:
        v = self.term()
        while self.peek() in ("+", "-") and self.peek():
            op = self.s[self.i]
            self.i += 1
            r = self.term()
            v = v + r if op == "+" else v - r
        return v

    def term(self) -> float:
        v = self.factor()
        while self.peek() in ("*", "/") and self.peek():
            op = self.s[self.i]
            self.i += 1
            r = self.factor()
            if op == "*":
                v = v * r
            else:
                if r == 0:
                    raise ZeroDivisionError
                v = v / r
        return v

    def factor(self) -> float:
        c = self.peek()
        if c == "-":
            self.i += 1
            return -self.factor()
        if c == "(":
            self.i += 1
            v = self.expr()
            if self.peek() != ")":
                raise ValueError("bad expression")
            self.i += 1
            return v
        m = re.match(r"[0-9]+(\.[0-9]+)?", self.s[self.i:])
        if not m:
            raise ValueError("bad expression")
        self.i += m.end()
        return float(m.group(0))


def calc(expr: str) -> float:
    return _Expr(expr).parse()


def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and re.fullmatch(r"-?[0-9]+(\.[0-9]+)?", v.strip()):
        return float(v)
    return None


def find_entity(items, name):
    """The village, pupil or glossary entry whose English or Arabic name matches `name` after normalize()."""
    if not isinstance(name, str):
        return None
    k = normalize(name)
    if not k:
        return None
    for it in items:
        if normalize(it["en"]) == k or normalize(it["ar"]) == k:
            return it
    return None


def _day(world, d: str):
    if d == "today":
        return world["today"]
    if d == "tomorrow":
        return DAYS[(DAYS.index(world["today"]) + 1) % 7]
    return d


def run_tool(world: dict, tool: str, args: dict, lang: str):
    """Runs one call. Unknown tools, missing or wrong arguments give {"error": ...}, never an exception."""
    L = 1 if lang == "ar" else 0
    if not isinstance(args, dict):
        return {"error": "bad arguments"}
    s = lambda k: args.get(k) if isinstance(args.get(k), str) and args.get(k).strip() else None  # noqa: E731

    if tool == "calculator":
        e = s("expr")
        if e is None:
            return {"error": "missing expr"}
        try:
            v = calc(e)
            if abs(v) >= 1e15:
                return {"error": "number too big"}
            return {"value": fmt(v)}
        except ZeroDivisionError:
            return {"error": "division by zero"}
        except ValueError:
            return {"error": "bad expression"}

    if tool == "timetable":
        c, d = s("class"), s("day")
        if c is None:
            return {"error": "missing class"}
        c = c.strip().upper()
        if c not in world["timetable"]:
            return {"error": "unknown class"}
        d = (d or "today").strip().lower()
        if d not in WEATHER_DAYS:
            return {"error": "unknown day"}
        d = _day(world, d)
        if d not in WEEKDAYS:
            return {"error": "no school"}
        lessons = [world["subjects"][x][L] for x in world["timetable"][c][d]]
        if "period" in args:
            p = _num(args["period"])
            if p is None or p != int(p) or not 1 <= p <= len(lessons):
                return {"error": "no such period"}
            return {"subject": lessons[int(p) - 1]}
        return {"lessons": lessons}

    if tool == "weather":
        p, d = s("place"), (s("day") or "today").strip().lower()
        if p is None:
            return {"error": "missing place"}
        v = find_entity(world["villages"], p)
        if v is None:
            return {"error": "unknown place"}
        if d not in WEATHER_DAYS:
            return {"error": "unknown day"}
        w = world["weather"][str(v["id"])][d]
        return {"sky": world["skies"][w["sky"]][L], "high": w["high"], "low": w["low"], "rain": w["rain"]}

    if tool == "library":
        q = s("query")
        if q is None:
            return {"error": "missing query"}
        k = normalize(q)
        found = []
        for t in world["topics"]:
            if k and (normalize(t["en"]) == k or normalize(t["ar"]) == k):
                found += t["books"]
        for b in world["books"]:
            if k and len(k) >= 3 and (k in normalize(b["en"]) or k in normalize(b["ar"])):
                found.append(b["id"])
        ids = sorted(set(found))[:3]
        return {"books": [{"title": world["books"][i]["ar" if L else "en"], "shelf": world["books"][i]["shelf"]} for i in ids]}

    if tool == "attendance":
        n, r = s("student"), (s("range") or "today").strip().lower()
        if n is None:
            return {"error": "missing student"}
        p = find_entity(world["pupils"], n)
        if p is None:
            return {"error": "not found"}
        if r == "today":
            return {"status": world["status"][p["today"]][L]}
        if r in ("week", "month"):
            c = p[r]
            return {"present": c["present"], "absent": c["absent"], "late": c["late"]}
        return {"error": "unknown range"}

    if tool == "glossary":
        t = s("term")
        if t is None:
            return {"error": "missing term"}
        g = find_entity(world["glossary"], t)
        if g is None:
            return {"error": "not found"}
        return {"definition": g["def_ar" if L else "def_en"]}

    if tool == "reminder":
        t, w = s("text"), s("when")
        if t is None:
            return {"error": "missing text"}
        if w is None or not WHEN.match(w.strip()):
            return {"error": "bad time"}
        return {"ok": True}

    if tool == "convert":
        v, a, b = _num(args.get("value")), s("from"), s("to")
        if v is None:
            return {"error": "missing value"}
        units = world["units"]
        if a is None or b is None or a.lower() not in units or b.lower() not in units:
            return {"error": "unknown unit"}
        a, b = a.lower(), b.lower()
        if units[a][0] != units[b][0]:
            return {"error": "cannot convert"}
        if a == b:
            x = v
        elif a == "c":
            x = v * 9 / 5 + 32
        elif a == "f":
            x = (v - 32) * 5 / 9
        else:
            x = v * units[a][1] / units[b][1]
        if abs(x) >= 1e15:
            return {"error": "number too big"}
        return {"value": fmt(x), "unit": b}

    if tool == "route":
        a, b = find_entity(world["villages"], s("from")), find_entity(world["villages"], s("to"))
        if s("from") is None or s("to") is None:
            return {"error": "missing place"}
        if a is None or b is None:
            return {"error": "unknown place"}
        if a["id"] == b["id"]:
            return {"error": "same place"}
        km, path = shortest(world, a["id"], b["id"])
        return {"km": km, "via": [world["villages"][i]["ar" if L else "en"] for i in path[1:-1]]}

    if tool == "send_message":
        to, text = s("to"), s("text")
        if to is None or text is None:
            return {"error": "missing to or text"}
        return {"sent": True}

    return {"error": "unknown tool"}


def shortest(world: dict, src: int, dst: int):
    """Dijkstra over the roads, O(n²), ties broken by the lower village id: tools.ts gets the same path."""
    n = len(world["villages"])
    adj = [[] for _ in range(n)]
    for a, b, km in world["roads"]:
        adj[a].append((b, km))
        adj[b].append((a, km))
    for lst in adj:
        lst.sort()
    INF = float("inf")
    dist, prev, done = [INF] * n, [-1] * n, [False] * n
    dist[src] = 0
    for _ in range(n):
        u, best = -1, INF
        for i in range(n):
            if not done[i] and dist[i] < best:
                u, best = i, dist[i]
        if u < 0 or u == dst:
            break
        done[u] = True
        for v, km in adj[u]:
            if dist[u] + km < dist[v]:
                dist[v], prev[v] = dist[u] + km, u
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    return int(dist[dst]), path[::-1]
