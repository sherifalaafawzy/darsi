# Writing in English and Arabic

Every lesson exists in three voices: English, Egyptian Arabic (what the video says and shows), and friendly Modern
Standard Arabic (the course text). Write each as its own text for its own reader. A translated sentence that keeps
English word order is a bug.

## English

- Plain words, short sentences, active verbs. "The app runs the tool", not "the tool is executed by the app".
- British spelling, as the existing courses use (colour, organise, programme for a plan; "program" for code).
- "You" and "we". A colleague talking, never a textbook and never childish.
- Narration is written to be **heard**: no brackets, no slashes, no symbols the voice can't say. Numbers as words
  ("thirty-five"), one number per sentence. Code is described, not read out ("it wrote a tool call: the tool's name,
  the place and the day").
- No absolutes you can't defend ("never", "always", "100% safe"). Security lessons teach defence only.
- Local, made-up, respectful: schools in developing countries, markets, buses, farms, floods, school WhatsApp groups.
  Names of people and villages are made up; links use `.example`.

## Arabic: two registers, one vocabulary

| | Egyptian Arabic (`ar-EG`) | Modern Standard Arabic, friendly (`ar`) |
|---|---|---|
| Where | Lesson Studio: narration, on-screen text, checkpoints, design.json | The unit file: reading, questions, slides, the video step's checkpoint and chapter labels |
| Sounds like | An Egyptian teacher explaining to colleagues (or to pupils, in students' videos) | A warm, clear written voice: "you", "we", short sentences |
| Never | Written-Arabic words in a spoken sentence | Dialect words; stiff textbook phrasing |

**The glossary is `docs/curriculum/ar-lingo.md`. Read it before writing any Arabic.** Both registers use the same
word for the same concept: a learner who hears «الفصل» in the video reads «الفصل» in the course. A term that is not
in the glossary is added there first, with the reason, and then used.

### Egyptian narration

- **Spoken forms:** لو، ممكن، مش، عشان، إزاي، فيه، بتاع، أوي، أكتر، وبعدين، بس. Not إذا، يمكن، لا، لأن، كيف،
  يوجد، الخاص بـ، أكثر، ثم، لكن. A sentence that starts Egyptian stays Egyptian.
- **Every adjective has its noun.** Never a bare «قوي!». Say «ده باسورد قوي». Gender and number agree with the
  noun (ده، دي، دول).
- **Numbers the Egyptian way**, as words: خمسة وتلاتين، حداشر، ميت. Keep «و» between tens and units. The number is
  the one the English and the screen show.
- **Names** as Arabic names: أمينة، أوكافور، سلمى، جوزيف، فرح. Titles: «أ. سلمى».
- **Same sentence breaks as the English**, scene by scene. `.`, `!`, `?`, `؟` and `…` end a sentence; `:` and `،`
  do not. So an English colon can stay a colon.
- **Idiom, not word for word.** "He answers from memory" is «هيجاوبك من دماغه», not a literal rendering.

### Course text

- Standard Arabic words, short and warm. Technical English terms stay in English when the Arabic would be a mouthful
  (token, prompt, API), with the meaning given the first time.
- Feminine and masculine agree with the Arabic noun, not with the English.
- Quotes are « ». Digits in the unit file follow the existing course (Arabic-Indic in running text, as the other
  lessons of that course do); digits on the video's screen are Western (0–9).

### Rules for both

- **Never "·"** in Arabic: it reads as an Arabic zero. Separate with «،» or ":". The recap's on-screen points are
  split with «،» in Arabic.
- **Code is always English and left to right.** Inside Arabic course text, code and formulas (`[14, 74]`, `check()`,
  `V = I × R`, `2-opt`) must sit in invisible left-to-right isolates. Don't type them by hand; run:

  ```bash
  node scripts/isolate-code.mjs --fix <course id>      # Darsi repository root; the last step on a unit file
  ```

  `tests/units.test.ts` fails on a piece of code without them. In videos, `layout-check` reports text that would
  read in the wrong order (`bidi`).
- **One word per concept, everywhere**: narration, screen, course text, the lab's labels and buttons. Before you
  name a lab's button in a video, read the lab's own Arabic string.

## How to check Arabic you wrote

1. Read it aloud. If a sentence sounds like a news bulletin, it is Standard Arabic in the wrong place.
2. `node scripts/darsi/sentences.ts <ID>` (Lesson Studio): English and Arabic side by side, with the sentence
   counts. Each pair must say the same thing, with the same numbers.
3. Search your text for the glossary's "do not use" column.
4. Search for "·".
5. Say honestly in your report that the Arabic was written by a model, and list any line you are unsure of. A native
   speaker's read is still the real check.
