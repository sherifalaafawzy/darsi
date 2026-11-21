# A lesson before and after: `agents-1-1-1`, "From chatbot to agent"

The first lesson of the Beginner course of the AI agents track, rewritten with this skill on 2026-11-13. It was a
good lesson already: a real hook, a real worked case, a lab that matches. It still broke the rules a beginner feels
most. Use it as the model for a rewrite.

Files: `H:\htdocs\lessonstudio\content\darsi\source\AGENTS-1-1-1.json`, `…\agents-1-1-1\ar-EG.json`,
`…\agents-1-1-1\design.json`, and lesson 1 of `content/units/agents-1-1.json`. `git diff` on those shows every word.

## What was wrong

| Rule | Before |
|---|---|
| Start from zero | Scene 3 opened with "A chatbot is a language model…" and scene 4 with "An agent is a language model in a loop with tools". A beginner has met none of *language model*, *loop* or *tool*. |
| Example before the name | Three scenes of definitions (chatbot, agent, AI agent) came before the first example. |
| Promise | "Today: from a chatbot that talks to an agent that acts." A topic, not something the learner can do. |
| Check 1 uses the idea | "Who actually runs the weather tool?" asked about the case the video had answered seconds before. |
| Options don't give it away | In check 2 the right option was the longest and the only one that mentioned a tool. |
| Name the next lesson | The video ended on the class activity. |
| The reading | Titled "A language model in a loop with tools", and opened with that definition. |

`check-lesson.mjs` before: 3 problems (no teaching block, no promise, no next lesson). After: 0 problems, 0 notes.

## The video, part by part

| Part | Before | After |
|---|---|---|
| Hook (Ms Amina) | "I asked a chatbot for 6B's timetable for tomorrow. It wrote a lovely, confident timetable, all made up! It never looked at our real one. So what would make it actually check?" | "I asked a chatbot for 6B's timetable for tomorrow. It gave me a neat, confident timetable. Every lesson in it was made up! So why didn't it just look at the real one?" |
| Promise | "Today: from a chatbot that talks to an agent that acts." | "By the end, you'll be able to tell a chatbot that only talks from an agent that can check and act." |
| Show it | (none) | Two helpers in the school office: one answers from memory, right or wrong; the other walks to the board, reads the timetable, then answers. Then: "A chatbot is the first helper. Inside it is a language model: a program that writes by guessing likely words…" |
| Name it | "An agent is a language model in a loop with tools." | "Now give that chatbot tools. A tool is a small program it can ask for… A chatbot that can use tools is called an AI agent: the second helper." |
| Work it | The weather request, shown as one line of code; then "that's the loop". | The same request in three plain rows as Mr Joseph says them (request, plan, tool call), then a diagram of the five steps between You, The model and The app. |
| Check 1 | "In an agent, who actually runs the weather tool?" | A new case: "An agent is asked to set a reminder for 7:30. The model writes a tool call. What happens next?" One wrong option is the misconception: "The model sets the reminder itself". |
| Reveal | "The app. The model only writes text…" | "The app runs it. The model only writes: a plan, a tool call, an answer. So the app is where a call can be checked, before anything happens." |
| Widen it | Three examples of agents. | Two agents, and one thing that is not: "A chatbot that writes a poem is not: it only talks." |
| Lab | Three things to do. | What to press, and one thing to watch: "Watch who writes each step: Darsi Tiny, or the app." |
| Check 2 | Options: "A friendlier, more confident voice" / "A timetable tool it can call, run by the app" / "Longer, more detailed answers" | The hook's question, with three options of the same length that beginners really believe: "Telling it to be more careful" / "A timetable tool it can call" / "Asking the same question again" |
| Recap | "…The loop is request, plan, call, result, answer. The model writes, and the app runs the tools." | The same three points in plainer words, and the line "An agent is a chatbot that can use tools." |
| Try it, and next | The class game. | The class game, then "Next lesson: what an agent's tools allow, and what they don't." |

Same length (14 scenes, 450 words against 449). New terms, in the order they arrive: language model (show), tool and
AI agent (name), tool call (work). None is said before it is shown.

## The lesson around it

- **Reading:** now "A chatbot that can use tools". Its first paragraph is the made-up timetable and why it happens;
  then the two helpers, the weather request with the same numbers, and who does what. Key terms are the video's four
  plus "the agent loop".
- **First practice question:** the video's second check, word for word.
- **Slides:** the title slide asks the hook's question; "Today we will" is the outcome; the activity's warm-up tells
  the made-up timetable and collects guesses; the wrap-up goes back to them.
- **Unchanged:** the other practice questions, the lab step, the reflection and the project already fitted.

## What the checks printed

```
check-lesson.mjs agents-1-1-1     14 scenes, 450 words, 0 problem(s), 0 note(s)
convert-fresh.mjs AGENTS-1-1-1    14 scenes, 0 errors, 0 warnings
layout-check agents-1-1-1         en and ar-EG: 2 font errors each, both from the shared templates (title card
                                  course line, quiz title), as in every lesson; no overflow, overlap or bidi errors
vitest units.test.ts "course agents-1-1"    7 passed
kits                              slides 6 pages, lesson plan 2 pages, English and Arabic
narrate --estimate                77 of 92 sentences to voice, about $0.02 per language
```

## What the pilot taught

- The first design used `compare`, `steps` and a `code` caption. All three draw text under 32 px, so the layout check
  refused them: the scenes became a `list`, a `list` and a `sequence`.
- A list row of 34 characters beside a cast member wrapped and crowded the next row. Thirty is the limit.
- Longer activity notes pushed the Arabic lesson plan to a third page while the English still fitted. One Arabic
  line was the difference.
- Until it is narrated again, the unit's video step still points at the old recording.
