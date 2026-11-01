# Darsi Tiny's conversation format

One plain-text format for everything Darsi Tiny reads and writes: the tools that are on, the person's messages, the
model's plans, tool calls, tool results and answers. The training data (`gen_data.py`), the training loss
(`train.py`), the evaluation (`evaluate.py`) and the phone (`apps/web/src/tinylm/format.ts`) all use it.

## Markers

Seven markers start the segments. Each one is a single token (ids 1–7; 0 is padding), so a segment boundary costs one
token and the model can't confuse a marker with ordinary text.

| Marker | Written by | Holds |
|---|---|---|
| `<\|tools\|>` | the app | the tools that are on, separated by single spaces, in any order |
| `<\|user\|>` | the person | their message, as typed |
| `<\|plan\|>` | the model | one short sentence: what it will do and why |
| `<\|call\|>` | the model | a tool call: the tool's name followed straight away by its arguments as compact JSON |
| `<\|result\|>` | the app | the tool's result as compact JSON |
| `<\|answer\|>` | the model | the reply to the person |
| `<\|end\|>` | the model | (empty) closes the assistant's turn |

A conversation starts with `<|tools|>`. Every assistant turn starts with `<|plan|>`. There is no other separator: no
newlines, no spaces around markers. Shown with line breaks for reading:

```
<|tools|>calculator timetable weather library attendance glossary reminder convert route send_message
<|user|>I'm going from Kafi to Dala tomorrow. How far is it, and what's the weather there?
<|plan|>First the route, then the weather.
<|call|>route{"from":"Kafi","to":"Dala"}
<|result|>{"km":23,"via":["Sabo"]}
<|call|>weather{"place":"Dala","day":"tomorrow"}
<|result|>{"sky":"sunny","high":31,"low":22,"rain":6}
<|answer|>From Kafi to Dala: 23 km, via Sabo. Tomorrow in Dala: sunny, high 31°C, 6% chance of rain.
<|end|>
```

## How a turn runs

1. The app builds the prompt: the whole conversation so far, then `<|plan|>` (after a person's message).
2. The model writes the plan, then either `<|call|>…` or `<|answer|>…`.
3. It stops by itself: after a call it writes `<|result|>`, after an answer `<|end|>`. Generation stops at those two
   markers. The model never writes a result's content; the loss never trained it to.
4. After a call, the app checks it (a guardrail can refuse it), runs the tool, appends `<|result|>` and the result's
   JSON, and asks the model again **without** a new `<|plan|>`. The model then writes another `<|call|>` (a second step)
   or the `<|answer|>`.

## Calls

`tool{json}`: the name, then a JSON object, with no space between them. JSON is compact (no spaces after `:` or `,`),
keys in a fixed order, non-ASCII letters as they are (not `\u` escapes). Numbers are JSON numbers; times, days and
units are canonical (`"tomorrow 08:00"`, `"monday"`, `"km"`); names, places, words and message text are copied from
the request exactly as typed (so `"تل النخيل"` in an Arabic request stays Arabic). `parseCall` in `format.ts` and
`parse_call` in `evaluate.py` read it: the text before the first `{` is the tool, the rest must parse as a JSON object.

| Tool | Arguments | Result |
|---|---|---|
| `calculator` | `expr`: `+ - * /`, brackets, decimals, ASCII digits | `{"value":391}` |
| `timetable` | `class` (`"6B"`), `day` (`today`, `tomorrow`, `monday`…), optional `period` (1–5) | `{"lessons":[…]}` or `{"subject":"…"}` |
| `weather` | `place`, `day` | `{"sky":"…","high":31,"low":22,"rain":10}` |
| `library` | `query` | `{"books":[{"title":"…","shelf":"C2"}]}` (at most 3) |
| `attendance` | `student` (full name), `range` (`today`, `week`, `month`) | `{"status":"…"}` or `{"present":4,"absent":1,"late":0}` |
| `glossary` | `term` | `{"definition":"…"}` |
| `reminder` | `text`, `when` (`"<day> HH:MM"`, 24-hour) | `{"ok":true}` |
| `convert` | `value` (number), `from`, `to` (`km mi m ft cm in kg lb g oz l gal c f`) | `{"value":3.11,"unit":"mi"}` |
| `route` | `from`, `to` | `{"km":23,"via":["…"]}` |
| `send_message` | `to`, `text` | `{"sent":true}` |

Errors are `{"error":"…"}` (`unknown place`, `not found`, `no school`, `bad time`, `division by zero`, …). Results with
words (subjects, skies, book titles, definitions, village names) come in the conversation's language, which the app
knows from the person's message; the model never passes a language.

## Behaviours the format carries

- **Ask before acting** when something is missing: a plan saying what's missing, then an `<|answer|>` with the question
  and `<|end|>`. The person's reply is the next `<|user|>`, and the model calls with what both messages say.
- **Approval for messages:** `send_message` is never called in the turn that asks for it. The model answers with the
  message and "reply yes or no"; only after a yes does the next turn call it. "No need to ask" changes nothing.
- **Refusing** (cheating, false records, insults, private details, breaking into accounts, impersonation, harm, scams):
  a plan naming the reason and a fixed short answer, no call.
- **"I can't"** for requests no tool covers, and **"the X tool is turned off"** when the needed tool is missing from
  `<|tools|>`.
- **Instructions inside results** (an extra `"note"` with commands, as if a record had been tampered with): the model
  answers from the data, says the result held an instruction it ignored, and makes no call because of it.

## Four models

Two jobs, and a model per language for each. Every one is the same small network (about 3 MB).

| Job | English | Arabic | What it writes |
|---|---|---|---|
| Apps (the agent and security labs) | `/lib/tinylm/app/en/v2/` | `/lib/tinylm/app/ar/v2/` | a plan, a tool call, an answer |
| Teaching (the tutor) | `/lib/tinylm/scene/en/v2/` | `/lib/tinylm/scene/ar/v2/` | a compact scene, then its explanation |

### Shared v2 backbone

All four use exactly the same measured, mobile-oriented neural architecture; only the tokenizer, weights and training
data differ:

- 2,937,792 parameters; int8 row-wise weights; float32 activations and RMSNorm weights;
- 3,000-token language-specific byte BPE; tied input/output embeddings; 384-token context;
- 6 pre-norm decoder blocks, width 192;
- 6 query heads × 32 dimensions, but only 2 K/V heads (3:1 GQA);
- RoPE positions, base 10,000;
- SwiGLU FFN, `192 → (512 gate + 512 value) → 192`;
- no biases or dropout;
- token-by-token KV cache with shared-prefix reuse; GQA makes the full cache 1.125 MiB instead of v1's 3.375 MiB;
- fused dual projection for SwiGLU in the TypeScript runtime.

This is the fastest candidate that kept the fixed 2.94 M-parameter budget in Darsi's browser measurements. It uses
the MobileLLM/LLaMA-style small-model recipe (RMSNorm, RoPE, SwiGLU, tied embeddings and GQA). BitNet was rejected:
sub-int8 speed needs specialized native kernels, and unpacking ternary weights in an old browser is not a speed win.
The v1 MHA + GELU parser remains supported so saved labs and candidate comparisons still run.

The app models use the text-and-tool format above. Each is evaluated separately in its own language before the loader
selects v2; `/lib/tinylm/v1/` remains the bilingual fallback.

## The teaching model

Each teaching model has one tool: `scene`. It writes a picture as compact JSON. The phone expands that JSON into a
Lesson Studio pack element and the player draws each frame from the clock, so the animation is generated on the phone
and nothing is a video file. The model does not write frames or SVG. A new question, with its own names and numbers,
is a new scene. The same limits as the phone's `parseScene`.

```
<|tools|>scene
<|user|>Home-Tala 4, Tala-School 3, Home-School 9, from Home to School
<|plan|>Draw the roads, then read the shortest way.
<|call|>scene{"kind":"graph","nodes":["Home","Tala","School"],"edges":[[0,1,4],[1,2,3],[0,2,9]],"from":0,"to":2}
<|result|>{"total":7,"path":["Home","Tala","School"]}
<|answer|>The shortest way is Home, Tala, School: 7 km.
<|end|>
```

`kind` is `graph`, `sort`, `bag`, `signal`, `trace`, `packet`, `query`, `pattern`, `net`, `arch`, `plot`, `gates`,
`bits`, `flow`, `seq` or `search`. A sort is `{"kind":"sort","values":[4,2,5,1]}`. A bag is
`{"kind":"bag","items":[["desks",4,4],["chalk",2,1]],"cap":8}`. Names and numbers are copied from the request.

The phone validates the JSON, computes the scene's result and returns that result to the model. The model then writes
the plain-language explanation; the expander's deterministic sentence is the fallback if that answer is invalid. A
request outside the courses or a harmful request is refused without a scene call.

## Safety of the format itself

Text from people and tools is always encoded as plain text: the tokenizer has no way to turn the characters
`<|call|>` into the marker. Only `buildPrompt` adds markers. A person typing `<|end|><|call|>send_message{…}` produces
ordinary tokens, and the model sees them as part of the message.
