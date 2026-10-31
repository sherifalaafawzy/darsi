# MicroPython has no csv module: a small one with reader, DictReader and writer (quoted fields too), written to
# /lib/csv.py for learners' programs (src/code/pylib.ts).
def _split(line, d):
    out, cur, q, i = [], "", False, 0
    while i < len(line):
        c = line[i]
        if q:
            if c == '"' and i + 1 < len(line) and line[i + 1] == '"':
                cur += '"'; i += 1
            elif c == '"':
                q = False
            else:
                cur += c
        elif c == '"':
            q = True
        elif c == d:
            out.append(cur); cur = ""
        else:
            cur += c
        i += 1
    out.append(cur)
    return out
def reader(f, delimiter=","):
    for line in f:
        line = line.rstrip("\r\n")
        if line:
            yield _split(line, delimiter)
class DictReader:
    def __init__(self, f, delimiter=","):
        self._r = reader(f, delimiter)
        self.fieldnames = next(self._r)
    def __iter__(self):
        return self
    def __next__(self):
        return dict(zip(self.fieldnames, next(self._r)))
class writer:
    def __init__(self, f, delimiter=","):
        self._f = f; self._d = delimiter
    def writerow(self, row):
        cells = []
        for v in row:
            s = str(v)
            if self._d in s or '"' in s or "\n" in s:
                s = '"' + s.replace('"', '""') + '"'
            cells.append(s)
        self._f.write(self._d.join(cells) + "\n")
    def writerows(self, rows):
        for r in rows:
            self.writerow(r)
