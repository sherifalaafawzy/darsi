# Darsi Tiny

The smallest language model that's useful for Darsi's AI-agent lessons: 2.94 M parameters, int8, 2.75 MB gzipped, run
in plain TypeScript on old phones. It reads a request in English or Arabic, writes a short plan, calls one of ten
simulated school tools, reads the result and answers. It asks when something is missing, asks for approval before
sending a message, refuses harmful requests, and says "I can't" for anything its tools don't cover. Its job is to make
an agent loop visible and to show, by contrast, why large models are large. It is not generally smart; see
[MODEL_CARD.md](MODEL_CARD.md).

| Here | What |
|---|---|
| [FORMAT.md](FORMAT.md) | the conversation and tool-call format |
| [MODEL_CARD.md](MODEL_CARD.md) | data, size, training, evaluation, limits, safety |
| `world.py`, `tools.py` | the simulated school and its ten tools (mirrored in `apps/web/src/tinylm/tools.ts`) |
| `gen_data.py`, `synth.py` | synthetic bilingual episodes, with held-out templates and names for testing; made-up entities for training |
| `wordings.py` | the v4 experiment's extra training wordings, and the fresh wordings of `test_fresh` (never trained on), with the check that keeps them apart |
| `phrases.py`, `phrases.json` | 3,000 course sentences per language for the made-up entities (committed, so the data stays reproducible) |
| `bpe.py`, `tokenizer.json` | the byte-level BPE tokenizer (mirrored in `tokenizer.ts`), and the shipped one (committed: the v4 copy drills are made of its pieces) |
| `model.py`, `train.py` | the transformer (mirrored in `model.ts`) and its training |
| `evaluate.py` | gate 1: right tool and arguments, English and Arabic separately, on four test sets |
| `export.py` | `model.bin`, `tokenizer.json`, `world.json`, `replay.json`, `manifest.json` and the test fixtures |
| `finetune.py` | fine-tuning the top blocks: the reference for `finetune.ts`, its fixture, and a demo |
| `web/` | gate 2: a test page and `speed.mjs`, which times it in Chromium with the CPU throttled 6× |

## Commands

One per stage (`python run.py` lists them); each is reproducible from `--seed` (default 1).

```bash
pip install -r tools/tinylm/requirements.txt
```

```bash
python tools/tinylm/run.py all
```

Or stage by stage: `data`, `tokenizer`, `train`, `eval`, `export`, `finetune`, `speed` (and `phrases`, only to rebuild
the phrase bank on purpose). Outputs go to
`tools/tinylm/out/` (ignored by git) except the shipped files and the fixtures, which `export` and `finetune` write
into `apps/web`. After an export, run the web checks:

```bash
cd apps/web && npx vitest run tests/tinylm && npx tsc --noEmit
```

The speed check needs Playwright's Chromium, or `CHROMIUM_PATH` pointing at a `chrome.exe`.

`data` writes the data the shipped model was trained on (`gen_data.py --round 3`, byte for byte). `--round 4` is the
v4 experiment, which wasn't shipped (MODEL_CARD.md, "v4").

## Trying a new model without replacing the shipped one

Train into its own checkpoint, export into a folder of its own, and point the checks at it. Nothing under `apps/web`
changes until you export there. From `tools/tinylm`:

```bash
python export.py --ckpt out/cmp/v4.pt --tok tokenizer.json --data out/data4 --public out/v4lib/tinylm/v1 --fixtures out/v4fix
```

```bash
python finetune.py fixture --ckpt out/cmp/v4.pt --tok tokenizer.json --data out/data4 --fixtures out/v4fix
```

Then, in `apps/web`, run the tests with `TINYLM_LIB` and `TINYLM_FIXTURES` set to those two folders (the Labs tests in
`tests/labs/agents.test.ts` and `aisec.test.ts` read the model the same way), and `node web/speed.mjs --lib out/v4lib
--fixtures out/v4fix`. Compare reports with `evaluate.py --report` on the same test files for both models.

## On the phone

`apps/web/src/tinylm/` (only a Lab chunk may import it; it imports no libraries and no Firebase):

- `TinyLM` (`index.ts`): `load()`, `generate(conversation, { onToken })`, `stop()`,
  `finetune(examples, { steps, blocks, replay })`, `useFineTune(saved)`, `tokenize(text)`; also `fetchManifest()` (sizes
  before downloading), `fetchWorld()` and `isDownloaded()`. The model runs in a Web Worker that starts on the first call
  and ends after 5 s without work.
- `format.ts`: `TOOLS`, `buildPrompt`, `renderPrompt`, `parseCall`, `readStep`.
- `tools.ts`: `runTool(world, tool, args, lang)` over `world.json` (`fetchWorld()`).
- The files are in `apps/web/public/lib/tinylm/v1/`. `lib/**` is already left out of the precache, and the `darsi-lib`
  runtime cache keeps them once used. A new model must go in a new folder (`v2`): Hosting serves `/lib/**` as
  immutable for a year.

## Fine-tuning in the browser

`TinyLM.finetune()` trains only the top block(s) and the final norm. Everything else stays frozen at int8: the
embedding (which is also the output head) and the bottom blocks. Each example runs once through the frozen blocks;
each Adam step then runs only the top blocks, forward and backward, written out by hand in `finetune.ts`. The result is
a buffer (~1.6 MB for one block) to keep in IndexedDB and pass to `useFineTune()` later. Its gradients match PyTorch
(`tests/tinylm/finetune.test.ts`). Mix in ordinary conversations (`replay`) or the model forgets what it knew; the
model card has the numbers.
