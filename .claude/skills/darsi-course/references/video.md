# Writing a lesson video

A Darsi video is a Lesson Studio storyboard: three files that the converter turns into a lesson the phone draws
itself, plus a 240p MP4. This page is how to write the three files so the video teaches. The mechanics of
`design.json` (every body, its fields and limits) are in `H:\htdocs\lessonstudio\content\darsi\README.md` and
`docs/packs/*.md`: read them, don't guess.

## The three files

| File | What it holds |
|---|---|
| `content/darsi/source/<ID>.json` | The storyboard in English: the `teaching` block, chapters, scenes (beat, part, voice, narration, on-screen text), two checkpoints. `<ID>` is the lesson id in capitals (`AGENTS-1-1-1`). |
| `content/darsi/<id>/ar-EG.json` | The Egyptian Arabic: title, subtitle, `unit` (the course title), every scene's narration and on-screen text, both checkpoints. |
| `content/darsi/<id>/design.json` | What each scene shows, in both languages. |

`content/darsi/lessons/<id>/` is generated. Never edit it.

## Start with the teaching block

Before any scene, write the lesson's contract at the top of `source/<ID>.json`. It is what the structure check reads,
and what the unit file must agree with.

```json
"teaching": {
  "assumes": [],
  "outcome": "tell a chatbot that only talks from an agent that can check and act",
  "hook": { "kind": "problem", "question": "Why didn't the chatbot look at the real timetable?" },
  "terms": ["language model", "tool", "AI agent", "tool call"],
  "misconception": "The AI itself runs the tools.",
  "next": "What an agent's tools allow, and what they don't"
}
```

- `assumes`: what the learner must already know, in plain words, each item taught by an earlier lesson in the same
  path. `[]` for the first lesson of a track's first course.
- `outcome`: one thing the learner can do afterwards, starting with a verb from the course's level
  (`teaching-model.md`). It completes the sentence "By the end, you'll be able to…".
- `hook.kind`: `question`, `surprise` or `problem`. `hook.question`: the question the hook leaves open, in one line.
- `terms`: the new terms this video introduces, one to four, spelled as they are said.
- `misconception`: the wrong idea a beginner is most likely to hold. Check 1 or its reveal must meet it head on.
- `next`: the next lesson's promise in a few words (for the last lesson of a course: the unit check).

If you can't fill this block in a minute, the lesson isn't planned yet. Go back to the track plan.

## The eleven parts

Every scene has a `beat` (what the converter draws) and a `part` (its job). The parts come in this order, always.

| # | `part` | `beat` | Scenes | Words | What it must do |
|---|---|---|---|---|---|
| 1 | `hook` | `Hook` | 1 | ≤ 40 | A cast member tells a question, surprise or problem from the learner's day. No new term. Ends open. |
| 2 | `promise` | `Title` | 1 | ≤ 25 | Narrator: "By the end, you'll be able to …" and the outcome. One sentence. |
| 3 | `show` | `Analogy`, `Examples` or `Concept` | 1–2 | ≤ 45 each | The idea in something the learner already knows. Still no definition. |
| 4 | `name` | `Definition` | 1 | ≤ 45 | The term and one plain sentence that defines it, pointing back at the example. |
| 5 | `work` | `Examples` or `Concept` | 1–3 | ≤ 50 each | One real case, step by step. The same case, with the same numbers, as the lab. |
| 6 | `check` | `Checkpoint ◆` | 1 | ≤ 25 | "Quick check!" and a new case to decide. Asked by a cast member. |
| 7 | `reveal` | `Reveal` | 1 | ≤ 45 | The answer in the first two or three words, then why, then the misconception put right. |
| 8 | `widen` | `Examples`, `Non-examples` | 1–2 | ≤ 45 each | Where else it shows up in a school or a home, and one thing that looks like it but isn't. |
| 9 | `lab` | `Lab preview` | 1 | ≤ 45 | What to do in the Labs app (the real button names) and the one thing to watch for. |
| 10 | `check`, `recap` | `Checkpoint ◆`, `Recap` | 2 | ≤ 25, ≤ 45 | "Your turn." and the hook's question. The recap answers it, then gives three points. |
| 11 | `try` | `Try it tomorrow` | 1 | ≤ 45 | One action for tomorrow, then one sentence that names the next lesson. |

That is 12 to 15 scenes. New terms may first be said only in `show`, `name` or `work` scenes. A video with no Labs app
(rare) uses its `lab` scene for a second worked case.

### Length

| Audience | Words (English) | Length | Sentences |
|---|---|---|---|
| Students, primary (`-s1`) | 280–370 | 2:15–2:45 | ≤ 14 words each |
| Students, lower secondary to university; teachers | 380–450 | 2:45–3:30 | ≤ 22 words each |

The voices speak about two words a second. Over 470 words is a second lesson trying to get in. A scene has at most
four sentences (a list of examples may have five).

### Chapters

Four or five, each named for what the learner sees, not for the part ("A timetable, made up", not "Hook"). A chapter's
`at` must equal the `start` of the scene it begins on, or the import cannot time it. The unit's video step needs the
same number of chapter labels, in English and Arabic. The usual five: the hook; show and name; the worked case and
check 1; widen and the lab; "Remember and try it".

## The hook

The hook decides whether the learner watches the rest. Write it last, when you know exactly what the lesson answers.

**Three kinds.** Pick the one the topic gives you for free.

| Kind | Shape | Example |
|---|---|---|
| `question` | Something everyday that nobody can quite explain | "Wait… how did my phone know I was going to type 'ready'?" |
| `surprise` | A result that goes against what a sensible person expects | "My class voted the zoo their favourite outing. The plan that won the most votes didn't include the zoo. How?" |
| `problem` | A job the learner really has, going wrong | "I asked a chatbot for 6B's timetable for tomorrow. It gave me a neat, confident timetable. Every lesson in it was made up! So why didn't it just look at the real one?" |

**The seven tests.** A hook passes all of them.

1. **Their world, not ours.** It happens in a classroom, a staffroom, a market, a bus, a home, on a phone. For
   students, it happens to someone their age. It is never about the subject ("Agents are everywhere these days").
2. **It leaves a gap.** It ends on a question the learner can't answer yet. It does not answer itself. "They laughed,
   but they had just found out what a computer needs" closes the gap: cut it and ask "So what did I leave out?".
3. **No new word.** Every word is one a beginner already uses. The first new term comes in `show`, `name` or `work`.
4. **It is specific.** A class (6B), a number (thirty minutes), a place (Kafi), a thing you can picture.
5. **It is short.** At most four sentences and 40 words, about 15 seconds. The first sentence is at most 12 words:
   the screen shows it in a speech bubble.
6. **The lesson pays it off.** Check 2 asks the hook's question, and the recap's first sentence answers it. If you
   can't write check 2 from the hook, the hook belongs to another lesson.
7. **It is honest.** No invented statistics, no fear, no promise the lesson doesn't keep. In security lessons the
   hook is a near miss the teacher caught, never an attack to copy.

**Who tells it.** In teachers' videos a cast member tells it in the first person ("I asked a chatbot…"). In students'
videos the cast are the students' teachers: the hook is about a pupil, told to "you" ("Your friend sends you a
link…"). The narrator never tells the hook.

**Weak hooks, and the fix.**

| Weak | Why | Stronger |
|---|---|---|
| "Today we look at algorithms." | A topic, not a hook | "I told my class: draw a square. Thirty pupils drew thirty different squares. What did I forget to say?" |
| "AI is changing education everywhere." | About the subject, no gap, not specific | "A parent showed me an essay and asked: did my son write this, or a machine? I couldn't tell. Could you?" |
| "Did you know that 80% of breaches start with a password?" | An invented or unsourced number, and it scares | "My password was my daughter's name and her birth year. A colleague guessed it in three tries. How?" |
| A hook that explains the idea in its last sentence | Closes the gap | End on the question instead |

## The promise

One sentence from the narrator on the title card: "By the end, you'll be able to" plus `teaching.outcome`. Not "Today:
X, and Y". The outcome is something a person can be seen doing: tell apart, spot, explain to a colleague, trace, fix,
choose. Not "understand" or "know about".

## Show it, name it, work it

- **Show it** uses something the learner has handled: a register, a seating plan, a recipe, a market stall, two
  helpers in the school office. It may be an analogy or a first plain example. One or two scenes.
- **Name it** comes only after that. Say the term, then one sentence a twelve-year-old could repeat, then tie it to
  the example ("…that is the second helper"). The term appears on screen, spelled as it is said. Don't define a term
  with another new term.
- **Work it** follows one case from start to finish, each step arriving on screen as it is said. Use the case the lab
  will show, with the lab's real numbers and the real names of its buttons and labels, so the lab feels like the
  video continuing. One new idea per scene: if a scene needs "and also", split it.
- **Every term** in `teaching.terms` is said, shown on screen in a design item or headline, and used once more before
  the recap. A term the video doesn't need is not in the video.
- **Numbers** are small, round and real. One number per sentence.

## The two checks

Both are single-choice, with two or three options (three is the norm).

- **Check 1** (after `work`) asks the learner to use the idea on a case the video has **not** just answered. If the
  worked case was the weather, the check is about the timetable. It should catch `teaching.misconception`: one wrong
  option is what a person holding that wrong idea would pick.
- **Check 2** (before the recap) asks the hook's question, now that the learner can answer it.
- **Options must not give the answer away.** All about the same length (the right one is never the longest by more
  than a third). The same grammar. No "all of the above". The right option does not repeat a word from the question
  that the others lack. Every wrong option is something a real beginner believes, not a joke.
- **Feedback** in both languages: `feedback_correct` starts "Correct — " and says why in one or two sentences;
  `feedback_wrong` starts "Not quite — " and says what to look at, without scolding. Without `feedback_wrong`, a
  learner who answers wrong is told "Correct".
- The **reveal** scene after check 1 starts with the answer itself ("The app."), because it plays for everyone.
  The **recap** starts with check 2's answer for the same reason.
- `after_scene` is the number of the `Checkpoint ◆` scene.

## Widen it, the lab, the recap, try it

- **Widen it:** two or three places the idea shows up in a school or at home, and at least one thing that looks
  similar but is not it, with the reason in a few words.
- **Lab:** name the Labs app as the app names it, say what to press, and give one thing to watch for or count. Check
  the words against the app (`apps/web/src/labs/apps/<id>/index.tsx`): a button the video names wrongly breaks trust.
- **Recap:** first sentence, check 2's answer. Then "Remember:" and three points (four at most), each one sentence,
  in the order they were taught. `points` in design.json are ≤ 6 words each; `takeaway` is one line of ≤ 12 words
  that a learner could say to a colleague.
- **Try it, and next:** for teachers, one class activity that needs no devices ("Try it in class tomorrow: …"). For
  students, one thing to do themselves ("Try it yourself: …"). The last sentence names the next lesson: "Next lesson:
  what an agent's tools allow, and what they don't." In a course's fourth lesson: "Next: the unit check."

## Voices

The narrator carries the teaching. The five cast members (Amina, Okafor, Salma, Joseph, Farah) tell the hook, ask the
checks and bring real cases; each track's plan says who leads. Two or three cast members in a video are enough. In
students' videos they are the students' teachers. People, schools and places are made up; links use `.example`.

## What the screen shows (design.json)

The video must work with the sound off, and the narration must work with the screen off (many learners listen while
doing something else). So:

- **Every scene says something on screen**, in a few words. The narration carries the detail. Never put the
  narration's sentences on screen.
- **Items arrive as they are said** (`s`, the sentence number from `sentences.ts`), never all at once.
- **Text is 32 px or more** on the stage (9 px on a 360 px phone): fewer, bigger labels. `layout-check` enforces it.
- **Choose the body that shows the idea**: `sequence` or `flow` for a process between people or parts, `table` for
  who-does-what, `big` for one number, `message` for a phishing example, `trace` or `code` for a program, the
  science and technology packs where they teach better, and `list` for examples, signs and steps. A lesson of
  fourteen lists is a slide deck, so use at least two other bodies. Some bodies draw part of their text too small for
  a phone today (`compare` items, `steps` numbers, `cards` labels, a `code` caption, `chart` values):
  `pipeline.md` has the table. Until the templates are fixed, use them only if the layout check passes.
- **Keep rows short.** A `list` row beside a cast member wraps after about 30 English characters, and a wrapped row
  crowds the next one.
- **Each sentence that brings an item in needs a word of its own.** The converter starts an item on a word that is
  said only once in the scene. If every word of a sentence is repeated elsewhere in the scene, the item arrives late.
- **The hook** shows the speaker and their first sentence in a bubble, plus two or three short items: the surprise,
  and the open question last, in the accent tone.
- **Both languages** in every text (`{"en": …, "ar-EG": …}`), and both contact sheets looked at.

## The Arabic file

`<id>/ar-EG.json` is Egyptian Arabic, written as an Egyptian teacher would say it, not translated word for word.
`references/languages.md` has the rules. Two mechanical ones matter here:

- **The same sentence breaks as the English.** Each scene's Arabic must split into exactly as many sentences as the
  English (`.`, `!`, `?`, `؟`, `…` end a sentence; `:` and `،` do not). The converter refuses the scene otherwise.
  Run `sentences.ts` and read the two side by side.
- **Checkpoints** in the same order, options in the same order, with `feedback_correct` and `feedback_wrong`.

## A scene, written out

```json
{ "n": 5, "start": "0:53", "end": "1:10", "beat": "Definition", "part": "name",
  "on_screen_text": "An agent uses tools",
  "voice": "Narrator",
  "narration": "Now give that chatbot tools. A tool is a small program it can ask for: a timetable, the weather, a calculator, a reminder. A chatbot that can use tools is called an AI agent: the second helper.",
  "visual": "A list of four tools, then the term.", "animation": "Each item arrives as it is said.",
  "icons": ["calendar", "sun", "calculator", "clock"] }
```

`start` and `end` are your estimate at two words a second; narration replaces them with measured times. Keep them in
order and make each chapter's `at` match a scene's `start`.
