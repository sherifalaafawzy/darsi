"""Darsi Tiny, one command per stage. Run from anywhere; everything is reproducible from --seed.

  python tools/tinylm/run.py phrases     course sentences for made-up entities → phrases.json (committed; only rerun on purpose)
  python tools/tinylm/run.py data        synthetic episodes            → out/data/*.jsonl, world.json (--round 4: the v4 experiment)
  python tools/tinylm/run.py tokenizer   byte-level BPE, 3,000 tokens  → out/tokenizer.json
  python tools/tinylm/run.py train       PyTorch, GPU if available     → out/ckpt.pt
  python tools/tinylm/run.py eval        gate 1 and the other test sets → out/eval_names.json, eval_ood.json, eval_fresh.json, eval_iid.json
  python tools/tinylm/run.py export      int8 model and fixtures       → apps/web/public/lib/tinylm/v1/, apps/web/tests/tinylm/fixtures/
  python tools/tinylm/run.py finetune    fine-tuning fixture and demo  → apps/web/tests/tinylm/fixtures/finetune.json
  python tools/tinylm/run.py speed       gate 2 in throttled Chromium  → out/speed.json
  python tools/tinylm/run.py all         every stage in order

Extra arguments after the stage go to its script (python tools/tinylm/run.py train --steps 2000).
"""
from __future__ import annotations

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

STAGES = {
    "phrases": [[PY, "phrases.py"]],
    "data": [[PY, "gen_data.py", "--out", "out/data"]],
    "tokenizer": [[PY, "bpe.py", "--data", "out/data/train.jsonl", "--out", "out/tokenizer.json", "--vocab", "3000"]],
    # --accum/--checkpoint only lower GPU memory; the result is the same batch of 128.
    "train": [[PY, "train.py", "--steps", "32000", "--accum", "2", "--checkpoint"]],
    "eval": [[PY, "evaluate.py", "--data", "out/data/test_names.jsonl", "--report", "out/eval_names.json"],
             [PY, "evaluate.py", "--data", "out/data/test_ood.jsonl", "--report", "out/eval_ood.json"],
             [PY, "evaluate.py", "--data", "out/data/test_fresh.jsonl", "--report", "out/eval_fresh.json"],
             [PY, "evaluate.py", "--data", "out/data/test_iid.jsonl", "--report", "out/eval_iid.json"]],
    "export": [[PY, "export.py"]],
    "finetune": [[PY, "finetune.py", "fixture"], [PY, "finetune.py", "demo", "--blocks", "1", "--n", "24", "--replay", "48", "--steps", "60"]],
    "speed": [["node", "web/speed.mjs"]],
}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2 or sys.argv[1] not in [*STAGES, "all"]:
        print(__doc__)
        sys.exit(2)
    stage, extra = sys.argv[1], sys.argv[2:]
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # "all" leaves phrases.json as committed, so a rerun reproduces the shipped model even if the courses changed.
    for name in [n for n in STAGES if n != "phrases"] if stage == "all" else [stage]:
        for cmd in STAGES[name]:
            cmd = cmd + (extra if stage != "all" else [])
            print(f"== {name}: {' '.join(cmd)}", flush=True)
            subprocess.run(cmd, cwd=HERE, env=env, check=True)


if __name__ == "__main__":
    main()
