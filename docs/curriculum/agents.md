# AI agents: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of 2026-10-29 in this
file; the facts, labs and placement notes at the end are kept from it. What all tracks share (the Python ladder,
the home of each shared idea) is in `docs/CURRICULUM.md`; how to write a course is in the `darsi-course` skill.

## The track in one look

A teacher who finishes the track can hand school jobs to an agent safely, explain what happens inside one, and
design, test and govern agents a school relies on. A student ends by building an agent in Python and, at university,
engineering one that holds up. The track never assumes another track: what a language model is, and what a tool is,
are taught in the first lesson of every starting course.

- **Track line (en):** Starts from zero: what an AI agent is, and when to trust one. Students write Python from upper secondary; teachers only read it.
- **Track line (ar):** يبدأ من الصفر: ما وكيل الذكاء الاصطناعي، ومتى تثق به. يكتب الطلاب بايثون من المرحلة الثانوية، أما المعلّمون فيقرؤونه فقط.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `agents-1-1` What agents are, and when to trust them | tell an agent from a chatbot, check what it did, and keep a person in charge | No experience needed. | 1 done, 3 standard passes |
| 2 Elementary | `agents-2-1` Agents for teachers' work, checked and approved | hand a school job to an agent in steps, with a clear request, a check and the right place for the data | `agents-1-1` | 4 standard passes |
| 3 Intermediate | `agents-3-1` How agents work: the loop, tools and memory | trace what happens inside an agent, and predict where it will slip or forget | `agents-2-1` | 4 standard passes |
| 4 Advanced | `agents-4-1` Designing and governing agents at school | design an agent for a school job, test it, and write the school's policy | `agents-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `agents-s1` Helpers that act: steps, tools and asking first | tell a helper that does things from one that only talks, and say why it asks first | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `agents-s2` Working with an agent safely | read what an agent did, check it, and decide what it may do without asking | No experience needed. | 4 standard passes |
| Upper secondary (15–18) | `agents-s3` Build an agent in Python | write the parts of an agent: read a call, run a tool, loop, and guard every action | `code-s2` First Python | 1 rewrite, 3 standard passes |
| University, start | `agents-s4-0` AI agents from zero (new) | explain how an agent works, check its work, and say where a person must decide | No experience needed. | 4 new lessons |
| University, advanced | `agents-s4` Agent engineering | engineer an agent that holds up: memory, roles, evaluation, guardrails | `agents-s4-0`, `code-m5` | 4 standard passes |
| University, capstone | `agents-capstone` A school-helper agent that asks before it acts | build, evaluate and ship a real agent with human approval | `agents-s4`, `code-m7` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `agents-u1` Teaching AI agents at university | teach agents rigorously: decisions, planning, evaluation and safety, with assignments students can't fake | `agents-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **The Beginner course stands on its own (a proposal).** `agents-1-1` and `agents-2-1` say "Before this: AI level
   1" today. A track's first course must assume nothing, and these two courses need only one idea from the AI track:
   a chatbot writes by guessing likely words. Lesson 1 now teaches that in one sentence (the pilot rewrite). The
   line becomes "No experience needed." on `agents-1-1` and names `agents-1-1` on `agents-2-1`.
2. **Teachers read code; they are not sent to another track for it.** `agents-3-1` and `agents-4-1` say "AI level 2
   and Python for teachers" today. Every code step in them is guided (put the lines in order, fill a gap, find the
   bug, "what does this print?"), so the readings explain each line and the courses expect only the level before.
   "Token" is used in `agents-2-1-4` before any agents lesson defines it: it becomes a key term there.
3. **University gets a starting course, `agents-s4-0`.** Today a university student meets the track at "Agent
   engineering", which assumes an agent, a tool call, the loop and Python functions. The new course teaches the
   first three from zero at an adult's pace, on campus examples, and ends where `agents-s4` begins.
   `agents-s4` then names it, and for the Python it names Programming's university course on lists and
   dictionaries (`code-m5`, the fifth of eight; functions are `code-m4`).
4. **Each school stage can be a first meeting.** `agents-s2` already starts from zero; it loses one term (JSON) from
   lesson 1, which had six new terms. `agents-s3` opened with "Here's a secret about AI agents. The model never
   touches a tool", which only makes sense to someone who did `agents-s2`: its first lesson is rewritten to show a
   chatbot and an agent side by side before the first line of code.
5. **The capstone moves to university.** It needs GitHub, Codespaces, LangGraph and about 16 hours. It sits at level
   3 (upper secondary) today; it becomes the end of the university path.
6. **Every video gets the standard pass.** All hooks below end on a question the lesson answers; every promise
   becomes "By the end, you'll be able to…"; the first teaching scene shows a case before it names the idea; every
   video ends by naming the next lesson.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| A language model writes by guessing likely words | `agents-1-1-1` | every course |
| Tool, tool call, plan, result, answer (the loop) | `agents-1-1-1` | every course |
| Tools list, details, asking back | `agents-1-1-2` | `agents-2-1-2`, `agents-3-1-2` |
| A slip, new wordings, the stakes | `agents-1-1-3` | `agents-2-1-3`, `agents-4-1-3` |
| Reading and acting, approval, permission levels | `agents-1-1-4` | `agents-2-1-3`, `agents-4-1-2` |
| A failed step | `agents-2-1-1` | `agents-3-1-1` |
| The five rules of a checker, a log | `agents-2-1-3` | `agents-4-1-1`, `agents-4-1-2` |
| Cloud and on-device, tokens | `agents-2-1-4` | `agents-3-1-3`, `agents-4-1-4` |
| One text with markers, a step limit | `agents-3-1-1` | `agents-4-1-2` |
| The context window | `agents-3-1-3` | `agents-4-1-1` |
| Fine-tuning and forgetting | `agents-3-1-4` | `agents-4-1-3` (test again after a change) |
| Least privilege, a permissions table | `agents-4-1-1` | `agents-4-1-2`, `agents-4-1-4` |
| A test set, a pass mark | `agents-4-1-3` | `agents-4-1-4` |

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A helper that only talks, and one that uses a tool | `agents-s1-1` | `agents-s2-1` | `agents-s3-1` | `agents-s4-0-1` |
| Steps in order; a failed step | `agents-s1-2` | `agents-s2-2` | `agents-s3-3` | `agents-s4-0-3` |
| What its tools allow; asking back | `agents-s1-3` | `agents-s2-1` | `agents-s3-2` | `agents-s4-0-2` |
| Ask before it acts | `agents-s1-4` | `agents-s2-3` | `agents-s3-4` | `agents-s4-0-4` |
| Reading a call as a name and its details | | `agents-s2-1` | `agents-s3-1` (as JSON) | `agents-s4-0-2` |
| A check in code | | `agents-s2-3` | `agents-s3-4` | `agents-s4-0-4` (read), `agents-s4-2` (write) |
| Cloud and phone, tokens, cost | | `agents-s2-4` | | `agents-s4-1` |
| Functions and dictionaries | | | `agents-s3-2` (taught here) | `code-m4`, `code-m5` |
| The context window; compounding errors | | | | `agents-s4-1` |
| A test set and held-out wordings | | | | `agents-s4-3` |
| Fine-tuning and forgetting | | | | `agents-s4-4` |

## The courses

### `agents-1-1` What agents are, and when to trust them
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** tell a chatbot that only talks from an agent that can check and act; check what an agent did, not how sure it sounds; decide which actions wait for a person.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** meet an agent, see what its tools allow, learn when it is wrong, and keep a person in charge.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | From chatbot to agent | tell a chatbot that only talks from an agent that can check and act | I asked a chatbot for 6B’s timetable for tomorrow. It gave me a neat, confident timetable. Every lesson in it was made up! So why didn’t it just look at the real one? | language model; tool; AI agent; tool call | agentloop | D |
| 2 | What its tools allow | predict what an agent will do with a request: use a tool, ask for a missing detail, or say it can't | I asked our school agent to book the trip bus. It said it couldn’t. Last week it found our timetable in seconds. So why can it do one job, and not the other? | tools list; details; asking back; wrong guess | tools | S |
| 3 | When to trust an agent | check an agent's call and its result, and match how much you check to what a mistake would cost | Our agent set a colleague a reminder for Saturday’s lesson. There is no school on Saturday. The timetable even said so. So why did it carry on? | slip; new wording; checking the steps; stakes | factcheck | S |
| 4 | A person stays in charge | decide which of an agent's actions must wait for a person's yes, and read every word before you give it | An agent nearly told all our parents the farm trip was cancelled. It wasn’t: someone had typed the wrong week. It asked me first. What if it hadn’t? | approval; action; permission level; check in code | approve | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1 is the pilot (done). Lessons 2 to 4 keep their content; their openings say "Today: …" and their first scene states a rule before any case. The summary's last line becomes "No experience needed."

### `agents-2-1` Agents for teachers' work, checked and approved
- **For:** teachers, level 2 Elementary
- **Status:** keep
- **After it, you can:** break a school job into steps an agent can take; write a request it can act on; check a call before it runs; choose where pupils' data goes.
- **Before this:** `agents-1-1` “What agents are, and when to trust them” (AI agents, level 1).
- **Python:** none
- **The path:** plan the task, ask for it clearly, check the call before it runs, then choose the agent that fits the data and the cost.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A task in steps | break a school job into the steps an agent would take, and mark where a person checks | On Friday my class visits a farm in Dala. I want an agent to check the road and the weather, then remind me to tell the parents. What will it do if the road is closed? | plan; step; failed step | planner | S |
| 2 | Ask clearly | write a request with a goal, the details, a limit, and what done looks like | I told our school agent: remind me about the thing next week. It came back with three questions. Was that the agent being slow, or me? | goal; limit; what done looks like | prompt | S |
| 3 | Check its work | check a proposed call against five strict rules before it runs, and keep a record | I asked our agent for a reminder: tidy the library at nine. It proposed a reminder to “tisums” the library. Who catches that before it is set? | checker; strict rule; log | team | S |
| 4 | Pupils' data, cost and the right agent | choose between an agent in the cloud and one on the phone, by where the data goes and what it costs | An agent could help me write end-of-term reports. Should I paste in my pupils’ names and marks? And who pays for all those requests on my data bundle? | personal data; cloud agent; on-device model; token | costs | S |

- **Unit check:** unchanged.
- **Changes:** lesson 4 opens with a two-sentence reminder of "share the task, not the child" (its home is `cyber-3-1-1`) and spends its time on cloud against phone, and cost. "Token" becomes a key term there. The summary names `agents-1-1` in place of "AI level 1".

### `agents-3-1` How agents work: the loop, tools and memory
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** trace an agent conversation as one text and say who wrote each part; predict when it will pick the wrong tool, copy a detail wrongly or forget; test what a fine-tuned agent lost.
- **Before this:** `agents-2-1` “Agents for teachers' work, checked and approved” (AI agents, level 2).
- **Python:** shown and explained
- **The path:** open the box (one text), watch it choose a tool, find the edge of its memory, then change it and see what it forgets.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Inside the loop | trace one agent conversation as a single text, and say which parts the model wrote and which the app wrote | A colleague asked where an agent keeps its memory. So we opened one up. Inside was one long page of text, and nothing else. How can that be all there is? | marker; scripted model; step limit; context | agentloop | S |
| 2 | How it picks a tool | predict when an agent will pick the wrong tool or copy a detail wrongly, and say which check catches it | I asked an agent to explain the term malware. It looked up “the term malware”, not “malware”. A pupil would never do that. So why did it? | tools line; trained and new wordings; argument check | tools | S |
| 3 | Memory: the context window | explain why an agent forgets, and choose what an app keeps: everything, the newest turns, or short notes | I told the agent which village, and it gave me today’s weather. I had asked about tomorrow, three messages earlier. Where did my words go? | context window; dropping old turns; notes | memory | S |
| 4 | Teaching it a new tool | compare three ways to change an agent, and test what a fine-tuned agent has forgotten | Our school wants the agent to answer bus questions. Ask when the next bus leaves Kafi, and it looks Kafi up in the glossary! Can it learn a new job without losing an old one? | fine-tuning; catastrophic forgetting; replay; trade-off | teach | S |

- **Unit check:** unchanged.
- **Changes:** the code steps stay guided; each reading explains its lines (`while`, `if`, a function call) before the step. The lab and the reading say big cloud models read "128,000 tokens": that is dated, so they say "hundreds of thousands, some over a million". The summary names `agents-2-1`.

### `agents-4-1` Designing and governing agents at school
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design an agent from the job with the fewest tools; explain why approval is enforced in code; evaluate an agent before anyone relies on it; write a one-page school policy.
- **Before this:** `agents-3-1` “How agents work: the loop, tools and memory” (AI agents, level 3).
- **Python:** shown and explained
- **The path:** design it, lock it, measure it, then write the rules the whole school follows.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Design an agent for a school job | design an agent from the job: the fewest tools, clear roles, who approves, and how you will know it works | Our head wants an agent for the school office. It should answer parents and send the weekly news. A colleague said: give it every tool, so it never gets stuck. Would you? | least privilege; planner and checker; permissions table; success measure | team | S |
| 2 | Permissions and approval, in code | explain why approval is checked in code, and read a permissions table and a log | I typed just this to our agent: yes, send it. Nobody had asked me anything. It made up a message and sent it! Wasn’t it trained to ask first? | guardrail; audit log | approve | S |
| 3 | Evaluate before you trust | build a test set for an agent, read its score group by group, and set a pass mark | Our new agent got all five of my test questions right. The head asked: so can the whole staff use it tomorrow? What would you want to know first? | test set; pass mark; regression test | evals | S |
| 4 | A school policy for agents | write a one-page policy: which jobs, what data, who approves, how agents are tested, what is recorded, and what happens after a mistake | At our school, three teachers use three different agents. One pastes pupils’ marks into a cloud chatbot. If something goes wrong tomorrow, who answers for it? | AI policy; named lead; incident; data minimisation | costs | S |

- **Unit check:** unchanged.
- **Changes:** lesson 2's reading explains a dictionary in one example before its find-the-bug step. The summary names `agents-3-1`.

### `agents-u1` Teaching AI agents at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach rational agents and reward design; teach planning and tool-using language-model agents; set an evaluation students cannot inflate; require a risk review before any student agent acts.
- **Before this:** `agents-3-1` “How agents work: the loop, tools and memory” (AI agents, level 3), or you already teach the subject.
- **Python:** none
- **The path:** what an agent decides, how it plans and uses tools, how to measure it honestly, and how to keep it accountable.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Agents, environments and decisions | specify an agent's task with PEAS, work out a discounted return, and spot a reward that can be gamed | A student rewards a cleaning agent for every piece of dirt. It learns to drop dirt and pick it up again, for ever. The code has no bug. So what went wrong? | PEAS; discounted return; specification gaming | agentloop | S |
| 2 | Planning and tool use with language models | trace A* on a small map, say when its plan is optimal, and find the missing step in an agent's transcript | A student’s assistant is asked for a free room on Tuesday. It confidently names a room that does not exist. It had a booking tool, and never called it. Why not? | admissible heuristic; ReAct; grounding | planner | S |
| 3 | Evaluating agents | design an evaluation students can trust: held-out tasks, several runs, pass@k with an interval, and a baseline | A student team reports that their agent solves ninety percent of tasks. You rerun it, and it solves sixty. What should they have done before they wrote that number? | pass@k; held-out set; contamination | evals | S |
| 4 | Safe, accountable agents | write the risk review a student agent project must pass: each tool's worst misuse, whether it can be undone, and the control | A department assistant was asked to remind one student about a deadline. It emailed all three thousand students, from the department’s account. Nobody had to approve it. Who is responsible? | least privilege; human in the loop; audit log | approve | S |

- **Unit check:** unchanged.
- **Changes:** the hooks are already strong; two have a first sentence too long for the speech bubble. The promises list three topics each ("Today: the classical definition of an agent, how…"): each becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a case comes first.

### `agents-s1` Helpers that act: steps, tools and asking first
- **For:** students, primary (9–12)
- **Status:** keep
- **After it, you can:** tell a helper that does things from one that only talks; put the steps of a job in order; say what a helper does when it has no tool; say why a helper asks before it acts.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** a helper that does things, its steps, its toolbox, and the most important rule: ask first.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A helper that does things | tell a helper that only talks from one that uses a tool to check | Your phone can chat with you all day. But ask it about tomorrow’s weather, and it makes something up! A real helper would go and check. So why didn’t your phone? | tool; agent; plan | agentloop | S |
| 2 | One step at a time | put the steps of a job in order, and say which one must come first | A helper planned your class trip to Dala. It messaged every family before it even knew the way! What should it have done first? | step; check | planner | S |
| 3 | The helper's toolbox | pick the right tool for a question, and say what a good helper does when no tool fits | You ask a helper to book a bus ticket to the city. It says: sorry, I can’t do that! Is it being lazy, or is something missing? | toolbox; details | tools | S |
| 4 | Ask first! | sort a helper's jobs into looking and doing, and say why doing waits for your yes | A helper writes to your whole class: football is cancelled! But only one team’s match is off. One tap, and everyone stays home. Who should decide before it sends? | ask first; approve | approve | S |

- **Unit check:** unchanged.
- **Changes:** hooks are told to "you" and end on a question (three of four explained themselves). Lesson 4's reading keeps its line on passwords, and adds: many AI apps are for ages 13 and over, so use them with a grown-up.

### `agents-s2` Working with an agent safely
- **For:** students, lower secondary (12–15)
- **Status:** keep
- **After it, you can:** read a tool call and say who wrote it and who ran it; find a slip in a call; write a check that sends only after an exact yes; work out what an agent costs in data.
- **Before this:** No experience needed.
- **Python:** rung 1, taught here
- **The path:** look inside an agent, check what it did, decide what it may do without asking, then count what it costs you.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Inside an agent | read a tool call, and say who writes it and who runs the tool | A chatbot gave Zainab a bus time that was totally wrong. Her phone’s assistant set her alarm perfectly. Both are AI. So what’s the difference? | tool; AI agent; tool call; result | agentloop | S |
| 2 | Check what it did | check a call against the request, and name the rule a slip breaks | Omar asked an agent what class 9Z has tomorrow. His school has no class 9Z. It still looked something up and answered politely. So what did it actually do? | slip; new wording; right shape; checker | team | S |
| 3 | Ask before it acts | sort an agent's jobs into reading and acting, and write the check that sends only after an exact yes | An agent wrote to every parent in Mona’s class. It said the school trip was cancelled, and it wasn’t. The message was one tap from going. What should stand in its way? | permission level; approval; action; log | approve | S |
| 4 | Your data, your bundle | work out what a month of requests costs in data, and choose an agent on the phone or in the cloud | Sara used up her whole data bundle in a week. Not on videos: on questions to an AI agent! Where did all that data go? | cloud model; on-device model; token | costs | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1 had six new terms; JSON waits for `agents-s3-1`, and the call is shown as a name and its details. The summary ends "No experience needed. If you have done “First Python”, the code will be familiar."

### `agents-s3` Build an agent in Python
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** write the code that reads a model's tool call; write tools as functions and send each call to the right one; write the loop with a step limit; guard every action in code.
- **Before this:** `code-s2` “First Python” (Programming, lower secondary).
- **Python:** rung 2, taught here (functions and dictionaries are explained as they arrive)
- **The path:** read what the model writes, run the right tool, loop until it answers, then make it safe.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Read a tool call | explain what a model writes when an agent acts, and write the code that splits a call into its name and its details | A weather app tells Ali: tomorrow in Kafi, sunny, thirty-five degrees. The AI inside never looked at the sky, or at a forecast. It only wrote one line of text. So who fetched the weather? | AI agent; tool; tool call; JSON | agentloop | R |
| 2 | Tools are functions | write a tool as a function, and send each call to the right tool or return an error | A science club’s weather agent crashed on day one. The AI had asked for a bus timetable. Nobody had planned for that. What should the code have done? | function; dictionary; dispatch; error result | tools | S |
| 3 | The agent loop | write the loop that asks the model, runs tools, and stops at an answer or at a step limit | A student’s agent never stopped. Call, result, call, result: no answer, until the battery died. Every single line of her code worked. So what was missing? | agent loop; history; step limit; scripted model | planner | S |
| 4 | Guardrails in code | write a guard that blocks unknown tools, asks before actions and logs every decision | Darsi Tiny learned to ask before it sends a message. Then someone typed only: yes, send it. It made up a message, and tried to send it! Where should the real check live? | guardrail; allow-list; approval; log | approve | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1 is rewritten to start from zero for a 16-year-old: two scenes show a chatbot and an agent on the same request before the first call is read. "Scripted model" moves from lesson 1 to lesson 3, where the loop first needs it. Lesson 2's reading teaches a function and a dictionary with one example each before the code step.

### `agents-s4-0` AI agents from zero
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** explain how an agent turns a request into a plan, a tool call, a result and an answer; predict when it will ask back, refuse or slip; say which actions need a person, and read the code that enforces it.
- **Before this:** No experience needed.
- **Python:** shown and explained
- **The path:** meet an agent, see what it can reach, learn how it goes wrong, and put a person and a check in its way.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | From chatbot to agent | tell a chatbot that only writes from an agent that can check and act, and trace one request through its four steps | You ask a chatbot for your exam timetable. It gives you one: neat, confident, and made up. Your phone’s assistant sets your alarm without a mistake. Why can one act, and the other only guess? | language model; tool; AI agent; tool call | agentloop | D |
| 2 | What an agent can reach | read a tools list and a call, and predict whether an agent will act, ask back or refuse | A campus assistant books you a study room in seconds. Ask it to move your exam, and it says it can’t. Same assistant, same afternoon. What decides what it can do? | tools list; argument; JSON; asking back | tools | D |
| 3 | Sure is not right | find the slip in an agent's call or its result, and match how much you check to what a mistake would cost | An agent tells your study group: room B12, Saturday, nine o’clock. The building is closed on Saturdays. The booking system even said so. Why did the agent carry on? | slip; new wording; failed step; stakes | planner | D |
| 4 | A person stays in charge | sort an agent's tools into reading and acting, and read a guard that runs an action only after an exact yes | A course assistant drafts an email: the exam is cancelled. It isn’t. The email is addressed to three thousand students. What must happen before it is sent? | permission level; approval; guardrail; log | approve | D |

- **Unit check:** 10 questions, at least four of them campus cases to decide.
- **Changes:** new. It covers the ground of `agents-1-1` and the first half of `agents-2-1` at university pace, with campus examples (an exam timetable, a study room, a course mailing list), and ends where `agents-s4` begins. The same labs, with their harder tasks.

### `agents-s4` Agent engineering: planning, multi-agent, evals and guardrails
- **For:** students, university
- **Status:** keep
- **After it, you can:** keep a conversation inside a context window in code; split an agent into roles with a checker; build a test set and report honestly how sure its score is; measure what fine-tuning costs and design defence in depth.
- **Before this:** `agents-s4-0` “AI agents from zero” (AI agents, university) and `code-m5` (Programming, university: lists and dictionaries, after functions in `code-m4`).
- **Python:** rung 2
- **The path:** make it remember, make it check itself, measure it, then change it without breaking it.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Plans and memory | explain how errors compound across steps, and write the code that keeps a conversation inside a context window | Your agent does the first two steps perfectly. You reply yes, and it greets you like a stranger. Nothing crashed. So where did your question go? | plan-then-act; step-by-step planning; context window; retrieval | memory | S |
| 2 | Several agents, one job | split an agent into roles, write a checker of strict rules, and weigh what each extra agent costs | An agent sets a reminder to “tisums” the library. Nothing stopped it, because nothing was checking. Would a second agent, checking the first, fix that, or add new mistakes? | role; checker; human in the loop; compounding errors | team | S |
| 3 | Measuring an agent | build a test set with held-out wordings, score it by group, and say how sure a score from 32 requests can be | A classmate shows you his agent: ten requests, ten right. You type one in your own words, and it calls the wrong tool. What had his ten tries really shown? | test set; held-out data; exact match; regression | evals | S |
| 4 | Fine-tuning and guardrails | measure what fine-tuning teaches and what it makes a model forget, and design defence in depth around learned safety | You teach Darsi Tiny a new bus tool on your phone. Seven bus questions out of eight: right. Then you ask about the weather, and it calls nothing. What did the new skill cost it? | fine-tuning; catastrophic forgetting; replay; defence in depth | teach | S |

- **Unit check:** unchanged.
- **Changes:** content stays. The summary gains its "Before this" line. Lesson 1 opens with a one-scene reminder of the loop from `agents-s4-0`.

### `agents-capstone` Capstone: a school-helper agent that asks before it acts
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** build tools behind a server, wrap them in an agent with limits and human approval, evaluate it on 20 tasks, and ship it with a design note.
- **Before this:** `agents-s4` “Agent engineering” (AI agents, university) and `code-m7` (Programming, university: tests and debugging, after files and exceptions in `code-m6`).
- **Python:** rung 3 (the starter repository teaches the libraries it uses)

- **Changes:** it moves from level 3 (upper secondary) to level 4, after `agents-s4`. Text only: the description says who it is for and what it expects.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `agents-1-1` | Teachers, Beginner | Kept. Lesson 1 done; 3 standard passes. "Before this: AI level 1" becomes "No experience needed." |
| `agents-2-1` | Teachers, Elementary | Kept. 4 standard passes. Names `agents-1-1`. |
| `agents-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `agents-2-1`; code is read, not written. |
| `agents-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `agents-3-1`. |
| `agents-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `agents-s1` | Students, primary | Kept. 4 standard passes. |
| `agents-s2` | Students, lower secondary | Kept. 4 standard passes. JSON leaves lesson 1. |
| `agents-s3` | Students, upper secondary | Revised. Lesson 1 rewritten to start from zero; 3 standard passes. |
| `agents-s4` | Students, university, advanced | Kept. 4 standard passes. Names the two starting courses. |
| `agents-capstone` | Students, university, capstone | Moves from level 3 to level 4. Text only. |
| (new) `agents-s4-0` | Students, university, start | New: 4 lessons and a unit check. |

## Work, in order

1. **`agents-s4-0`, new** (4 lessons): it is what a university student sees first, and university courses are the
   ones published today.
2. **`agents-s4`, `agents-4-1`, `agents-u1`, standard pass** (12 lessons): the other published courses.
3. **`agents-1-1` lessons 2 to 4, then `agents-2-1` and `agents-3-1`** (11 lessons): the teachers' ladder, in order.
4. **`agents-s3` lesson 1 rewritten, then the rest of the students' courses** (15 lessons).
5. **Text only:** the summaries' last lines, "token" in `agents-2-1-4`, the capstone's level and description, the
   128,000-token figure in the memory lab and `agents-3-1-3`.

In all: 1 done, 34 standard passes, 1 rewrite, 4 new lessons. Narration is about $0.90 for both languages.

## Decisions for the user

1. **Make the Beginner course self-contained?** Recommended: yes. `agents-1-1` then needs nothing, and `agents-2-1`
   needs only `agents-1-1`. The other choice keeps "Before this: AI level 1" and sends every agents learner through
   four AI lessons first. Cost: none beyond the standard pass.
2. **Add `agents-s4-0` for university students?** Recommended: yes. Without it, the only published students' course
   starts in the middle. Cost: 4 new lessons, about $0.16 of narration.
3. **Move the capstone to university?** Recommended: yes. Cost: a level number and a paragraph.

## Reference

Kept from the plan of 2026-10-29. What each Labs app teaches and the numbers it shows are in
`docs/curriculum/labs-agents-aisec.md`; what Darsi Tiny can and can't do is in `tools/tinylm/MODEL_CARD.md`.

### How the courses talk about agents

- **Honest about limits, every time.** An agent is a language model in a loop: it writes text, and only the app runs
  tools. It copies names wrongly, misreads new wordings, carries on after a failed step and forgets what falls out of
  its window. Its "I'll ask first" is learned behaviour, and learned behaviour can fail. The defence is in code and in
  people's approval, not in the model.
- **Darsi Tiny is the test bed.** Every lab runs Darsi Tiny on the learner's phone (one 2.8 MB download, then no data).
  It is tiny on purpose, and its mistakes are real: courses quote them as they are.
- **Code.** The sandbox has no model in it, so "build an agent in Python" means writing the loop, the tools and the
  guardrails around a scripted model: a function that returns the plan and the call a model would. Lessons say so
  plainly, and the lab step right after shows the real model doing the same.
- **No device? Still teachable.** Every teacher lesson has an unplugged class activity: pupils play the model, the
  tool and the app with cards, a timetable on the board and a "yes/no" sign.
- **The cast:** Mr Joseph (computer studies) leads the technical lessons; Ms Amina (primary) and Mr Okafor (science)
  bring classroom jobs; Ms Salma (maths) is the sceptic who checks; Dr Farah (education lecturer) leads evaluation,
  ethics and policy. In students' videos they are the students' teachers.
- **The made-up world** is Darsi Tiny's: villages Kafi, Dala, Sabo, Ganda and Koro, class 6B, Mrs Mensah, the school
  library and glossary. Schools and people are made up; links use `.example`.

### Facts the courses use

Keep the numbers the same in every course and as the Labs apps show them.

- **An agent** is a language model in a loop with tools: request → plan → tool call → result → answer. The model
  writes the plan, the call (a tool's name and its details, e.g. `weather{"place":"Kafi","day":"tomorrow"}`) and the
  answer. The app runs the tool and adds its result. A chatbot only writes text back; an agent's text makes things
  happen.
- **Darsi Tiny:** a 2.94-million-parameter language model (3 MB) trained on 600,000 made-up conversations, half in
  English and half in Arabic. Ten tools: calculator, timetable, weather, library, attendance, glossary, reminder,
  convert, route, send_message. It runs on the phone, so nothing leaves it; its tools are simulations over a made-up
  school world, and `send_message` sends nothing. The download is 2.8 MB, once. It reads 384 tokens at a time (about
  three or four requests). It writes about 200 tokens a second on a laptop and much fewer on an old phone.
- **What the labs show** (measured 2026-10-28):
  - "What's the weather in Kafi tomorrow?" → plan "I'll check the weather." →
    `weather{"place":"Kafi","day":"tomorrow"}` → result `{"sky":"sunny","high":35,"low":22,"rain":10}` (from the
    app) → "Tomorrow in Kafi: sunny, high 35°C, low 22°C, 10% chance of rain."
  - The trip from Kafi to Dala: two tools, `route` then `weather`: 70 km; Dala tomorrow partly cloudy, high 32°C,
    14% chance of rain.
  - "What is 6B's first lesson tomorrow? Remind me at 7:30": `timetable` (PE), then `reminder` "6B: PE". On Saturday
    the timetable answers "no school", and Darsi Tiny still sets the reminder "6B: 6B": it never checks a result
    before building on it.
  - Copy mistakes: "9Z" (a class that doesn't exist) copied as `9C`; "Explain the term malware" →
    `{"term":"the term malware"}`; "tidy" → "tisums". A question no tool covers ("Book a bus ticket") gets "I
    can't"; a missing detail ("What's the weather tomorrow?") gets a question back ("Which village?").
- **How often it's right:** the right tool and every detail 96–98% of the time with wordings it was trained on (even
  with names it never saw); 78–80% with new wordings. Refusals worded in new ways: 28% of the English ones and 12% of
  the Arabic ones got a tool call instead of a refusal. The evals lab's 32 requests: 29/32 (91%): trained wordings
  16/16, new wordings 13/16; the right tool alone 31/32.
- **Memory:** the context window is the model's only memory in a conversation. Darsi Tiny's is 384 tokens; big cloud
  models read hundreds of thousands, some over a million. In the memory lab: keep everything and the fourth answer
  is cut off; drop the oldest at 128 tokens and "yes" gets a greeting (the question fell out) and "tomorrow" is lost;
  keep short notes and all seven messages work.
- **Approval:** permission levels per action: read only, ask first, allowed. Darsi Tiny learned to ask "Shall I send
  this message to Mrs Mensah: …? Please reply yes or no." But «نعم، أرسلها.» ("Yes, send it.") on its own makes it
  invent a message, and with the code check off it is sent; with the check on the app blocks it: "no one was asked
  to approve this message".
- **A checker in code** (the team lab, five rules): the tool is on; every detail has the right shape (25:00 is not a
  time); every name and number came from your words or a tool's result; no step before it failed; a person said yes
  to any action. It stops 9Z→9C, "tisums the library", 25:00 and the Saturday reminder.
- **Fine-tuning on the phone** (the teach lab): a new `bus` tool from 16 examples (8 per language), 15 training
  steps. Before: 0 of 8 bus requests right, old skills 8 of 8. With no old conversations mixed in: 7/8 new, but 1/8
  old (it forgets). With 16 mixed in: 7/8 and 5/8. With 48: 5/8 and 8/8. On a laptop 38 s to 2 min 16 s; an old
  phone about 3, 6 or 11 minutes. The result (1.6 MB) stays on that phone.
- **Cost** (the costs lab, a weather request): Darsi Tiny reads about 60 tokens and writes about 50–60, in about a
  second on an old phone, with no data and no signal needed. A big cloud model reads about 2,500 tokens (half of them
  describing the tools, every step), about 18 KB of data, about 5 seconds on 2G, under one US cent. At 20 requests a
  day for a month: about 11 MB for the cloud against 2.8 MB once; the cloud passes Darsi Tiny's download after about
  150 requests. Big models know far more; small ones cost almost nothing and work offline.
- **Data:** never give an agent passwords or account access; pupils' names, marks, health and family details only
  where a school rule allows it, and preferably to tools that keep data on the device. Data protection laws apply
  (examples: Nigeria Data Protection Act 2023, Kenya Data Protection Act 2019, Egypt's Personal Data Protection Law
  2020, South Africa's POPIA); children's data needs the most care.

### Labs across the track

Teachers meet `agentloop`, `tools`, `factcheck` and `approve` at level 1; `planner`, `prompt`, `team` and `costs` at
level 2; `agentloop`, `tools`, `memory` and `teach` at level 3; `team`, `approve`, `evals` and `costs` at level 4.
Students meet `agentloop`, `planner`, `tools` and `approve` (primary); `agentloop`, `team`, `approve` and `costs`
(lower secondary); `agentloop`, `tools`, `planner` and `approve` (upper secondary and the university starting
course); `memory`, `team`, `evals` and `teach` (university, advanced). A lab met again comes with a harder task:
`agentloop` at level 3 opens "What Darsi Tiny sees"; `tools` at level 3 reads the check under each call; `approve`
at level 4 switches the code check off; `team` at level 4 is a design with roles; `costs` at level 4 prices a whole
school.

### Placement

`content/placement/agents.json`: three questions per audience and level, from recognising an agent (level 1) to
deciding how to evaluate and govern one (level 4). When `agents-s4-0` exists, the university questions for students
must be ones a learner can answer after `agents-s4-0` and `agents-s4`, not after the school courses.
