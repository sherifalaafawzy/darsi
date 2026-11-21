# What the phone's Python runs

Tried on 2026-11-15, step 1 of the work order in `docs/CURRICULUM.md`. The phone runs MicroPython 1.29 (the PyScript
`settrace-ulab` build in `apps/web/public/lib/python/v1`) inside Darsi's harness (`src/code/harness.ts`). About 180
probes of our own were run through the same harness in Node (`tests/code/node.ts`), each compared with what desktop
Python 3.13 prints. The Darsi University drafts' code was **read, not run**: it is downloaded material, so each
draft file was scanned as text for the gaps below.

Write every code step, "what does this print?" question and worked example to this page. A course that needs
something marked "missing" either avoids it, teaches the phone's way, or waits for the app addition at the end.

## The same as on a computer

Python 3 syntax, including f-strings with format specs (`{x:.2f}`, `{n:,}`, `{x:>6}`, `{0.25:.1%}`, `{x=}`),
`str.format`, `%` formatting, the walrus operator, `nonlocal`, generators and type hints with `list[int]`. Integer
and float arithmetic, `//`, `%`, `divmod`, big integers, and float display (`0.1 + 0.2` shows
`0.30000000000000004`, `200 / 60` shows `3.3333333333333335`). `round(2.5)` is 2 and `round(3.5)` is 4. `input()`
with a prompt (the prompt and the answer show on one line), `print(sep=, end=)`, `while`, `for`, `range`, `break`,
`for … else`, `enumerate`, `zip`, `reversed`, `sorted(key=, reverse=)`, `min`, `max`, `sum`, `any`, `all`, `map`,
`filter`, lambdas, closures. Every method of lists, dictionaries and sets. Strings: `upper`, `lower`, `strip`,
`replace`, `split`, `join`, `find`, `index`, `count`, `startswith`, `endswith`, `isdigit`, `isalpha`, `isspace`,
`isupper`, `islower`, `partition`, `rsplit`, `splitlines`, `center(width)`, slices with step 1. Classes with
`__init__`, `__repr__`, `__str__`, `__eq__`, `@property`, `@classmethod`, `@staticmethod`, inheritance and `super()`;
custom exceptions; `try`/`except`/`else`/`finally`; `raise`; `assert` with a message. The `__main__` guard runs
(`__name__` is `"__main__"`). Files: `open` with `encoding="utf-8"`, modes `w`, `a`, `r`, `x`, `r+`, `wb`, `rb`,
`with`, reading line by line, Arabic text. A program can write a second `.py` file and import it. `json.dumps`,
`json.loads`, `json.dump`, `json.load`. Darsi's `csv`: `reader`, `DictReader`, `writer`, quoted fields.
`random.seed`, `randint`, `randrange`, `choice`, `random`, `uniform`. `datetime.date`, `timedelta`,
`date.fromisoformat`, `date.today`. `math.sqrt`, `ceil`, `floor`, `pi`, `isclose`, `inf`. `os.path.exists` and
`os.path.join`. `collections.defaultdict`, `namedtuple`, `OrderedDict`. `heapq` (not `nsmallest`), `functools.reduce`
and `partial`, `copy.deepcopy`, `string`, `struct`, `zlib`, `base64`, `binascii`, `html`, `hmac`, and `ulab.numpy`
(`mean`, `median`, `std`). A loop of 200,000 additions takes well under a second.

## Different on the phone

| What | On the phone | On a computer | In a lesson |
|---|---|---|---|
| **Order of a dictionary** | Not kept, even with two keys: `{'Omar': 72, 'Sara': 64, 'Amina': 85}` after adding Omar, Amina, Sara, and `{'projector': 3, 'laptop': 12}` after adding laptop first. The order depends on the keys | Kept in the order keys were added (since Python 3.7) | Never print a whole dictionary or loop over one where the order shows. Loop over `sorted(d)`, or keep a list of the keys. Say it once in the dictionaries lesson: "On a computer the order is kept; here, sort when order matters." |
| **Sorting with a key** | Not stable: equal keys come out in any order (`sorted(["bb", "a", "cc", "d", "ee"], key=len)` gives `['a', 'd', 'ee', 'cc', 'bb']`) | Stable: equal keys keep their order | Give every sort a key with no ties, or a tie-breaker: `key=lambda t: (t[1], t[0])` |
| **`round(x, 1)` and `:.0f` at a half** | `round(2.675, 2)` is 2.68, `round(7.45, 1)` 7.4, `round(7.55, 1)` 7.6, `f"{2.5:.0f}"` 3 | 2.67, 7.5, 7.5 and 2 | Choose values that are not on a half, and don't make a test depend on one |
| **Error messages** | `NameError: name 'scor' isn't defined`; `ValueError: invalid syntax for integer with base 10: 'twenty'`; `TypeError: unsupported types for __add__: 'str', 'int'`; `ZeroDivisionError: divide by zero`; `KeyError: x`; `SyntaxError: invalid syntax` (no "expected ':'", and an indentation mistake is a `SyntaxError`) | `name 'scor' is not defined`; `invalid literal for int() with base 10: 'twenty'`; `can only concatenate str (not "int") to str`; `division by zero`; `KeyError: 'x'`; `expected ':'`, `IndentationError` | Teach the error's **type** and what it means, and show the phone's wording, since that is what the learner sees. The reading may add "On a computer the message reads: …". The type, the line number and the traceback's shape are the same |
| **A missing file** | `OSError`, and `str(e)` is just `44`. `FileNotFoundError` doesn't exist: `except FileNotFoundError` is itself a `NameError` | `FileNotFoundError: [Errno 2] No such file or directory: 'x.csv'` | Until the app addition: `except OSError`, and print your own message |
| **Arabic-Indic digits** | `"٢٠".isdigit()` is False and `int("٢٠")` fails | Both accept them: `int("٢٠")` is 20 | Worth a sentence in Arabic: a phone keyboard may type ٢٠. A step's test always gives Western digits |
| **`isinstance(True, int)`** | False | True | Don't rely on it |
| **Recursion** | Stops between 150 and 170 calls deep, with `RuntimeError: maximum recursion depth exceeded`; `RecursionError` doesn't exist | About 1,000, `RecursionError` | Keep recursion shallow; catch `RuntimeError` if needed |
| **Upper and lower case** | ASCII only: `"École".lower()` stays `École` | Every alphabet | Arabic has no case, so this rarely matters |
| **CSV written** | Lines end in `\n` | `\r\n` | Tests compare what a program prints, so this only shows if a file's text is printed with `repr` |
| **`print` inside an imported module, and `unittest` output** | Lost: the harness captures only the program's own `print`. `unittest.main()` runs and returns a result, but its report never shows | Shown | Until the app addition: test with `assert` and print your own summary |
| **`sys.exit()`** | Shows as an error, `SystemExit: 0` | Ends quietly | Don't use it in a step |

## Missing on the phone

- **Strings:** `title`, `capitalize`, `ljust`, `rjust`, `zfill`, `swapcase`, `casefold`, `isnumeric`, `isdecimal`,
  `isalnum`, `istitle`, `removeprefix`, `removesuffix`, `expandtabs`, `translate`, `maketrans`; `center` takes no
  fill character; `[::-1]` on a string. F-strings do alignment (`f"{name:<8}{mark:>4}"`), also for Arabic names.
- **Built-ins:** `format()`, `vars()`, `ascii()`; `__doc__` on functions; `__file__`; `sys.argv` is empty.
- **Exceptions:** `FileNotFoundError`, `RecursionError`, `PermissionError`, `FileExistsError`, `IsADirectoryError`,
  `ModuleNotFoundError`, `UnicodeDecodeError`, `json.JSONDecodeError` (a bad JSON text raises `ValueError`).
- **`open(newline="")` and `open(errors=…)`:** both fail with "extra keyword arguments given". The csv module works
  without `newline`.
- **`json.dumps(indent=…, ensure_ascii=…, sort_keys=…)`:** fail. Non-ASCII text is written as it is (a computer
  writes `س…` unless `ensure_ascii=False`).
- **`csv.DictWriter`.**
- **`datetime`:** `date.strftime`, `datetime.strptime`.
- **`pathlib`:** `Path.exists()` raises `OSError` for a missing file instead of returning False (the phone's error
  numbers differ); no `iterdir`, `joinpath`, `glob`. `os.path.exists` works.
- **`os`:** `walk`, `makedirs`; `os.path.splitext`, `getsize`.
- **`random`:** `shuffle`, `sample`, `choices`, `gauss`.
- **`math`:** `fsum`, `prod`, `gcd`, `comb`, `perm`, `hypot`, `dist`.
- **`re`:** only `compile`, `match`, `search` and `sub`; no `findall`, `fullmatch`, `split`, `finditer`, `escape`
  or flags; a match has `group(n)` (write `group(0)`, not `group()`) and no `groups`, `span`, `start`, `end`.
- **`hashlib`:** only `sha256`, and no `hexdigest()` (write `binascii.hexlify(h.digest()).decode()`).
- **`collections.Counter`, `ChainMap`; `deque` needs a `maxlen`; `itertools.combinations`, `permutations`,
  `product`, `groupby`, `zip_longest`; `heapq.nsmallest`, `nlargest`; `functools.lru_cache`, `cmp_to_key`.**
- **`unittest`:** no `assertGreater`, `assertLess`, `assertNotIn`, `assertCountEqual`, `assertRaisesRegex`,
  `setUp`, `tearDown` or `TestLoader`; a test can't be built by name (`T("test_add")`).
- **Modules:** `statistics`, `typing`, `dataclasses`, `enum`, `decimal`, `fractions`, `bisect`, `secrets`, `uuid`,
  `textwrap`, `pprint`, `glob`, `shutil`, `tempfile`, `configparser`, `ipaddress`, `unicodedata`, `urllib`,
  `sqlite3` (SQL steps use their own engine), `subprocess`, `socket`, `numpy` (use `ulab.numpy`), `pandas`.
- **The `match` statement.**

## What the drafts use that the phone lacks

Counted in the drafts' examples, solutions and projects (tests and tooling left out), on 2026-11-15.

| Track | Mostly fine | Needs a change before it runs on the phone |
|---|---|---|
| Programming | Modules 1 to 5 (one `title()` in module 1; dictionaries printed in module 5; `round` at halves in module 4) | Modules 6 to 8: `open(newline="")` (6 files), `FileNotFoundError` (7), `csv.DictWriter` (2), `json` with `indent` or `ensure_ascii` (4), `unittest` output (9 files in module 7), `random.sample` and `__file__` (module 8) |
| IoT | Modules 1 and 3, and the sensor maths | `open(newline="")` (11), `sqlite3` in module 5, `secrets` and `hashlib` in module 7, `itertools` (2), `statistics` (1), dictionaries printed (15) |
| Cyber security | The ideas; `json`, `re.search`, `hmac` | `urllib.parse` in modules 3 and 6, `hashlib` with `hexdigest` (13 files), `shutil`, `sqlite3` and `secrets`, sorting with ties (9), dictionaries printed (17) |
| Data science | | `statistics` (51 files) and `open(newline="")` (54): nearly every file. Also `Counter`, `re.findall`, `itertools` |
| Data engineering | `json`, `csv`, `hashlib` | Python's `sqlite3` (35 files): on Darsi, SQL is a `code` step with `lang: "sql"`, so those examples become SQL steps. Also `pathlib`, `strptime`, `open(newline="")` (10) |
| Optimization | Darsi's small OR-Tools | `itertools.combinations` and `product` (26 files), `fractions` (18), `pathlib` (9), dictionaries printed (45) |

## App additions that would close most of the gap

Small, each in the harness or the Python library (`src/code/harness.ts`, `src/code/pylib/`), each to be built and
tested in `tests/code/` before a course relies on it. None is built yet.

1. **Capture `print` everywhere** during a run, so that `unittest` reports and prints inside imported modules
   show. Programming module 7 needs it. The phone's Python allows assigning `builtins.print` (tried); that this
   catches `unittest`'s report is not yet tried.
2. **`open` that accepts and ignores `newline` and `errors`**, and raises a missing file as
   `FileNotFoundError` with the computer's message; the other missing exception names as aliases
   (`FileNotFoundError`, `RecursionError`, `PermissionError`, `FileExistsError`, `JSONDecodeError` in `json`).
   Programming 6 and 8, Data science, IoT, Data engineering.
3. **`csv.DictWriter`** in Darsi's `csv`. Programming 6, Data science 2.
4. **A small `statistics`** (`mean`, `median`, `mode`, `stdev`, `pstdev`, `variance`, `quantiles`), pure Python.
   Data science, nearly every module.
5. **A stable `sorted`** in the program's globals (a key with the item's position). `list.sort` stays unstable,
   so lessons still avoid ties.
6. **Missing modules a track needs**, as small pure-Python files in the library, where the name isn't already a
   built-in module: for example `secrets` (Cyber security) or a few `itertools` functions under another name
   (Optimization). Decide when the track is written.

Methods of built-in types (`str.title`, `str.zfill`, a hash's `hexdigest`), dictionary order and `round` at halves
can't be changed by the harness; they would need another MicroPython build. The lessons use the phone's way instead
(f-string alignment, `binascii.hexlify(h.digest())`, sorted keys, values that aren't on a half).
