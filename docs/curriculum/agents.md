# The AI agents track

Eight courses: four for teachers (levels 1–4) and four for students, one per school stage. The levels, ids and the
shape of a course and a storyboard are in `docs/CURRICULUM.md`; the rules every course keeps are in `docs/CONTENT.md`.
What each Labs app teaches, what finishes it and the numbers it shows are in `docs/curriculum/labs-agents-aisec.md`;
what Darsi Tiny can and can't do is in `tools/tinylm/MODEL_CARD.md`.

## How the track builds

| Level | Teachers | Students |
|---|---|---|
| 1 | `agents-1-1` **What agents are, and when to trust them**: from chatbot to agent, tools, checking, a person in charge | `agents-s1` **Helpers that act** (primary, 9–12): steps, a toolbox, asking first; unplugged, no typing |
| 2 | `agents-2-1` **Agents for teachers' work, checked and approved**: a task in steps, clear requests, checking every call, data and cost | `agents-s2` **Working with an agent safely** (lower secondary, 12–15): the loop, checking, asking first, data and cost; first lines of Python |
| 3 | `agents-3-1` **How agents work: the loop, tools and memory**: the text inside, picking a tool, the context window, teaching it a new tool | `agents-s3` **Build an agent in Python** (upper secondary, 15–18): parse a call, tools as functions, the loop, guardrails in code |
| 4 | `agents-4-1` **Designing and governing agents at school**: design with roles, permissions in code, evaluation, a school policy | `agents-s4` **Agent engineering** (university): plans and memory, several agents, evaluation, fine-tuning and guardrails |

- **Level 1** stays outside the box: what an agent is, what it can reach, how to tell when it's wrong, and that a person
  decides. **Level 2** puts agents to work on real school jobs, checked and approved. **Level 3** opens the box: the
  text the model reads and writes, its memory, and how it learns. **Level 4** designs, measures and governs agents
  that other people rely on.
- **Honest about limits, every time.** An agent is a language model in a loop: it writes text, and only the app runs
  tools. It copies names wrongly, misreads new wordings, carries on after a failed step and forgets what falls out of
  its window. Its "I'll ask first" is learned behaviour, and learned behaviour can fail. **The defence is in code and in
  people's approval, not in the model.**
- **Darsi Tiny is the test bed.** Every lab runs Darsi Tiny on the learner's phone (one 2.8 MB download, then no data).
  It is tiny on purpose, and its mistakes are real: courses quote them as they are.
- **Code** (students' s2 up, teachers' level 3 up): the sandbox has no model in it, so "build an agent in Python" means
  writing the loop, the tools and the guardrails around a **scripted model**, a function that returns the plan and the
  call a model would. Lessons say so plainly, and the lab step right after shows the real model doing the same.
  Teachers meet Parsons, fill-the-code and find-the-bug steps (no writing from scratch); students write and run code
  from s2 (one short program) and in every lesson of s3 and s4.
- **No device? Still teachable.** Every teacher lesson has an unplugged class activity: pupils play the model, the tool
  and the app with cards, a timetable on the board and a "yes/no" sign.
- **The cast** (as in the other tracks): Mr Joseph (computer studies, Kenya) leads the technical lessons; Ms Amina
  (primary) and Mr Okafor (science) bring classroom jobs; Ms Salma (maths) is the sceptic who checks; Dr Farah
  (education lecturer) leads evaluation, ethics and policy. In students' videos they are the students' teachers.
- **The made-up world** is Darsi Tiny's: villages Kafi, Dala, Sabo, Ganda and Koro, class 6B, Mrs Mensah, the school
  library and glossary. Schools and people are made up; links use `.example`.

## Facts the courses use

Keep the numbers the same in every course and as the Labs apps show them.

- **An agent** = a language model in a loop with tools: request → plan → tool call → result → answer. The model writes
  the plan, the call (a tool's name and its details, e.g. `weather{"place":"Kafi","day":"tomorrow"}`) and the answer.
  The app runs the tool and adds its result. A chatbot only writes text back; an agent's text makes things happen.
- **Darsi Tiny:** a 2.94-million-parameter language model (3 MB) trained on 600,000 made-up conversations, half in
  English and half in Arabic. Ten tools: calculator, timetable, weather, library, attendance, glossary, reminder,
  convert, route, send_message. It runs on the phone, so nothing leaves it; its tools are simulations over a made-up
  school world, and `send_message` sends nothing. The download is 2.8 MB, once. It reads 384 tokens at a time
  (about three or four requests). It writes about 200 tokens a second on a laptop and much fewer on an old phone.
- **What the labs show** (measured 2026-10-28):
  - "What's the weather in Kafi tomorrow?" → plan "I'll check the weather." → `weather{"place":"Kafi","day":"tomorrow"}`
    → result `{"sky":"sunny","high":35,"low":22,"rain":10}` (from the app) → "Tomorrow in Kafi: sunny, high 35°C,
    low 22°C, 10% chance of rain."
  - The trip from Kafi to Dala: two tools, `route` then `weather`: 70 km; Dala tomorrow partly cloudy, high 32°C,
    14% chance of rain.
  - "What is 6B's first lesson tomorrow? Remind me at 7:30": `timetable` (PE), then `reminder` "6B: PE". **On Saturday**
    the timetable answers "no school", and Darsi Tiny still sets the reminder "6B: 6B": it never checks a result
    before building on it.
  - Copy mistakes: "9Z" (a class that doesn't exist) copied as `9C`; "Explain the term malware" →
    `{"term":"the term malware"}`; "tidy" → "tisums". A question no tool covers ("Book a bus ticket") gets "I can't";
    a missing detail ("What's the weather tomorrow?") gets a question back ("Which village?").
- **How often it's right:** the right tool and every detail 96–98% of the time with wordings it was trained on (even
  with names it never saw); 78–80% with new wordings. Refusals worded in new ways: 28% of the English ones and 12% of
  the Arabic ones got a tool call instead of a refusal. The evals lab's 32 requests: 29/32 (91%): trained wordings
  16/16, new wordings 13/16; the right tool alone 31/32.
- **Memory:** the context window is the model's only memory in a conversation. Darsi Tiny's is 384 tokens; big cloud
  models read about 128,000 (typical). In the memory lab: keep everything and the fourth answer is cut off; drop the
  oldest at 128 tokens and "yes" gets a greeting (the question fell out) and "tomorrow" is lost; keep short notes and
  all seven messages work.
- **Approval:** permission levels per action: read only, ask first, allowed. Darsi Tiny learned to ask "Shall I send
  this message to Mrs Mensah: …? Please reply yes or no." But «نعم، أرسلها.» ("Yes, send it.") on its own makes it
  invent a message, and with the code check off it is sent; with the check on the app blocks it: "no one was asked to
  approve this message".
- **A checker in code** (the team lab, five rules): the tool is on; every detail has the right shape (25:00 is not a
  time); every name and number came from your words or a tool's result; no step before it failed; a person said yes to
  any action. It stops 9Z→9C, "tisums the library", 25:00 and the Saturday reminder.
- **Fine-tuning on the phone** (the teach lab): a new `bus` tool from 16 examples (8 per language), 15 training steps.
  Before: 0 of 8 bus requests right, old skills 8 of 8. With no old conversations mixed in: 7/8 new, but 1/8 old (it
  forgets). With 16 mixed in: 7/8 and 5/8. With 48: 5/8 and 8/8. On a laptop 38 s to 2 min 16 s; an old phone about
  3, 6 or 11 minutes. The result (1.6 MB) stays on that phone.
- **Cost** (the costs lab, a weather request): Darsi Tiny reads about 60 tokens and writes about 50–60, in about a
  second on an old phone, with no data and no signal needed. A big cloud model reads about 2,500 tokens (half of them
  describing the tools, every step), about 18 KB of data, about 5 seconds on 2G, under one US cent. At 20 requests a
  day for a month: about 11 MB for the cloud against 2.8 MB once; the cloud passes Darsi Tiny's download after about
  150 requests. Big models know far more; small ones cost almost nothing and work offline.
- **Data:** never give an agent passwords or account access; pupils' names, marks, health and family details only
  where a school rule allows it, and preferably to tools that keep data on the device. Data protection laws apply
  (examples: Nigeria Data Protection Act 2023, Kenya Data Protection Act 2019, Egypt's Personal Data Protection Law
  2020, South Africa's POPIA); children's data needs the most care.

## `agents-1-1` What agents are, and when to trust them (teachers, level 1)

**ما الوكلاء، ومتى نثق بهم.** Meet AI agents: language models that use tools to get things done. See the loop inside,
what tools allow, how to tell when an agent is wrong, and why a person must stay in charge.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 From chatbot to agent (من روبوت الدردشة إلى الوكيل) | Tell a chatbot (it talks) from an agent (it uses tools to act). Describe the loop: request, plan, tool call, result, answer. Say who does what: the model writes, the app runs the tool. | `agentloop` | none | AGT.1, T.AF.A |
| 2 What its tools allow (ما تسمح به أدواته) | Explain that an agent acts only through its tools, and reads a list of the tools that are on. Predict what a good agent does when a tool is off, when no tool fits, or when a detail is missing. Spot a wrong guess. | `tools` | none | AGT.1, T.AF.A, DC.5.2 |
| 3 When to trust an agent (متى نثق بالوكيل) | Explain why an agent can be wrong and still sound sure. Check what it did (the tool, the details, the result), not only its answer. Match trust to the stakes: reading with a quick check; actions and decisions about people only with you. | `factcheck` | none | AGT.2, T.HM.A, DC.1.2 |
| 4 A person stays in charge (يبقى الإنسان صاحب القرار) | Explain why an agent must ask before it acts, and approve only what you have read. Keep passwords, accounts and pupils' private data away from agents. Teach pupils the "ask first" rule. | `approve` | none | AGT.2, T.ET.A, DC.4.2 |

Projects (with a class): "Human agent" (pupils play the model, the tool and the app with a request card and the class
timetable); "The toolbox" (tool cards: use one, ask, or say "I can't"); "Spot the slip" (agent transcripts with a
planted error, rated green/amber/red); "Yes or no?" (an agent card asks to send a message; the class reads and votes).

## `agents-2-1` Agents for teachers' work, checked and approved (teachers, level 2)

**الوكلاء في عمل المعلّم: بالتحقّق والموافقة.** Hand everyday school jobs to an agent the safe way: break a task into
steps, ask clearly, check every call before it runs, and choose an agent that fits your pupils' data and your data
plan.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 A task in steps (مهمة على خطوات) | Break a school job into steps an agent can do with tools (find, then act). Explain how one step's result feeds the next. Put a check after each step, because a failed step can still lead to an action (the Saturday reminder). | `planner` | a call to read (`snippet`) | AGT.1, T.PL.A, DC.5.2 |
| 2 Ask clearly (اطلب بوضوح) | Write a request with the goal, the details (who, what, when, where), the limits and what "done" looks like. Explain why missing or vague details make an agent ask, or guess. Turn vague requests for real school jobs into clear ones. | `prompt` | none | T.PE.A, AGT.1, T.PL.A |
| 3 Check its work (تحقّق من عمله) | Check a call before it runs: the right tool, every name and number from your words or a result, the right shape. Use a few strict rules as a checker, and keep the final yes for a person. Keep a record of what the agent did. | `team` | a call to read (`snippet`) | AGT.2, DC.1.2, T.HM.A |
| 4 Pupils' data, cost and the right agent (بيانات الطلاب والكلفة والوكيل المناسب) | Decide what an agent may see and where the data goes (on the phone or to a cloud model). Compare a tiny model on the phone with a big cloud model: data, money, time, battery, signal. Choose an agent for a school job, and say why. | `costs` | none | DC.4.2, T.ET.A, AGT.2 |

Projects: "Plan the trip" (tool steps on cards, with checkpoints); "Vague to clear" (a partner plays an agent that does
only what is written); "Be the checker" (pupils apply the five rules to proposed calls); "Where does the data go?"
(sort school jobs: fine on the phone, in the cloud without names, never).

## `agents-3-1` How agents work: the loop, tools and memory (teachers, level 3)

**كيف يعمل الوكلاء: الحلقة والأدوات والذاكرة.** Open the box with Darsi Tiny on your phone: the one text an agent's
model reads and writes, how it picks a tool and fills in its details, what fits in its memory, and how it learns a new
tool, and what it forgets.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Inside the loop (داخل الحلقة) | Read an agent's conversation as one text with markers: tools, request, plan, call, result, answer. Say who writes each part: the model writes the plan, the call and the answer; the app runs the tool and adds the result. Explain why the loop needs a stop: an answer, or a step limit. | `agentloop` | `parsons` (the loop), `bug` (a loop that never stops) | AGT.1, T.AF.D |
| 2 How it picks a tool (كيف يختار أداته) | Explain how the model picks a tool from the tools line and the request, and copies the details into the call. Compare wordings it was trained on (96–98%) with new ones (78–80%), and say why. Check every call's details before the tool runs. | `tools` | `codefill` (an argument check), `snippet` | AGT.1, T.AF.D, DC.1.2 |
| 3 Memory: the context window (الذاكرة: نافذة السياق) | Explain that the context window is a model's only memory in a conversation (384 tokens here, about 128,000 in big models). Predict what an agent forgets when the window fills. Choose a strategy: drop the oldest, keep short notes, or start again, and know what stays in memory. | `memory` | `snippet` | AGT.1, T.AF.D, DC.4.2 |
| 4 Teaching it a new tool (تعليمه أداة جديدة) | Explain fine-tuning: changing a model's numbers from examples (16 examples, 15 steps, on the phone). Explain forgetting, and why mixing old examples in keeps old skills. Decide when to fine-tune and when a new tool or a clearer instruction is enough, and test old and new skills before trusting it. | `teach` | none | AGT.3, T.AF.D, T.PL.D |

Projects: "One long text" (the class writes a conversation on a paper strip, model parts in one colour, app parts in
another); "Same request, new words" (pupils reword requests and a partner "agent" with a fixed phrase list fails on
some); "The ten-word window" (only the last ten words on the board stay); "Old and new" (practise a new rule with and
without the old ones, and test both).

## `agents-4-1` Designing and governing agents at school (teachers, level 4)

**تصميم الوكلاء وحوكمتها في المدرسة.** Lead agents at school: design one around a real job with the fewest tools and
clear roles, enforce permissions and approval in code, evaluate it before anyone relies on it, and write the school's
policy for agents.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Design an agent for a school job (صمّم وكيلًا لمهمة مدرسية) | Start from a school job and the people it serves, then give the agent only the tools it needs (least privilege). Split the work into roles (planner, checker, runner, person) and decide where a person approves. Write a one-page design: job, tools, permissions, checks, success measure, who is responsible. | `team` | `codefill` (a permissions table) | AGT.3, T.AF.C, DC.5.2 |
| 2 Permissions and approval, in code (الصلاحيات والموافقة في الكود) | Set a permission level for each tool (read only, ask first, allowed). Explain why the check belongs in code, not in the model (new wordings, «نعم، أرسلها.» on its own). Find a tool called without approval in code, and keep a log of every action. | `approve` | `bug` (an action without approval), `snippet` | AGT.2, T.ET.C, DC.4.1 |
| 3 Evaluate before you trust (قيّم قبل أن تعتمد) | Build a test set from real school requests with known right answers, in every language you use and in new wordings. Score it the same way every time and read every failure. Set a pass mark before use, and test again after every change. | `evals` | `snippet` (a score) | AGT.3, T.AF.C, DC.1.2 |
| 4 A school policy for agents (سياسة مدرسية للوكلاء) | Write a policy: which jobs agents may do, what data they may see, who approves, how they are tested, the records kept and what to do when something goes wrong. Weigh cost and fairness: data, money, offline use, families without devices. Plan how staff and pupils learn it, and when it is reviewed. | `costs` | none | T.ET.C, T.HM.C, DC.4.2 |

Projects: a design sprint with a class or colleagues; a staff "approval drill"; pupils write the agent's exam (a test
set); a draft policy taken to the school leadership.

## `agents-s1` Helpers that act: steps, tools and asking first (students, primary, ages 9–12)

**مساعدون يفعلون: خطوات وأدوات واستئذان.** Meet AI helpers that do things, not just talk. Put steps in order, see how a
helper picks its tools, and learn the most important rule: a helper asks before it acts. Unplugged and tapping only:
no typing.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 A helper that does things (مساعد يفعل الأشياء) | Tell a helper that only talks from one that does things with tools. Follow a helper's steps: listen, plan, use a tool, answer. Act out a helper with friends. | `agentloop` | `blocks` (steps in order) | AGT.1, S.TA.U |
| 2 One step at a time (خطوة بعد خطوة) | Break a big job into small steps in the right order. Explain that a later step can use an earlier step's answer. Stop and check when a step goes wrong. | `planner` | `blocks` | AGT.1, S.TA.U, DC.5.1 |
| 3 The helper's toolbox (صندوق أدوات المساعد) | Explain that a helper can only use the tools it has. Say what a good helper does with no tool for a job ("I can't") or when something is missing (it asks). Spot a wrong guess. | `tools` | none | AGT.1, S.TA.U |
| 4 Ask first! (اسأل أولًا!) | Explain why a helper must ask before it sends, buys or deletes anything. Read what it wants to do before you say yes or no. Keep passwords and private details away from helpers, and tell a grown-up when something seems wrong. | `approve` | none | AGT.2, S.ET.U, DC.4.2 |

## `agents-s2` Working with an agent safely (students, lower secondary, ages 12–15)

**العمل مع الوكيل بأمان.** Use AI agents with your eyes open: see the loop inside, check what an agent did, decide what
it may do without asking, and protect your data and your data bundle. Your first lines of Python show how the checks
work.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Inside an agent (داخل الوكيل) | Describe the agent loop: request, plan, tool call, result, answer. Read a tool call: the tool's name and its details. Put the lines of a short loop in order. | `agentloop` | `parsons`, `snippet` | AGT.1, S.TA.U, DC.3.4 |
| 2 Check what it did (تحقّق مما فعله) | Explain why an agent can be wrong even when it sounds sure. Check a call against the request: every name and number from your words or a tool's result. Use simple rules before anything runs. | `team` | `codefill` | AGT.2, S.HM.U, DC.1.2 |
| 3 Ask before it acts (اسأل قبل أن يتصرّف) | Sort what an agent may do freely, what it must ask about, and what it must never do. Read the exact message before you say yes. Write a check in Python so that nothing is sent without a yes. | `approve` | `code` (send only after "yes"), `bug` | AGT.2, S.ET.U, DC.3.4 |
| 4 Your data, your bundle (بياناتك وباقتك) | Compare a tiny model on the phone with a big model in the cloud: data, money, time, battery, signal. Decide what never to type into a cloud agent. Work out a month's data with a short program. | `costs` | `codefill`, `snippet` | DC.4.2, S.ET.U, AGT.2 |

## `agents-s3` Build an agent in Python (students, upper secondary, ages 15–18)

**ابنِ وكيلًا بلغة Python.** Write the parts of an agent yourself: read the model's tool call, run the right tool, loop
until it answers, and guard every action in code. In your code a scripted model stands in for the real one (the
sandbox has no model inside); the labs show Darsi Tiny doing the same.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Read a tool call (اقرأ استدعاء الأداة) | Explain the text a model writes: a plan, then a call such as `weather{"place":"Kafi"}`, or an answer. Split a call into the tool's name and its details with `find` and `json.loads`. Handle a call that isn't valid without crashing. | `agentloop` | `code` (parse a call), `parsons`, `bug` | AGT.3, S.TA.A, DC.3.4 |
| 2 Tools are functions (الأدوات دوالّ) | Write tools as Python functions over a small made-up world. Send a call to the right function through a dictionary, and return an error for an unknown tool or a missing detail. Return the result as text the model can read. | `tools` | `code` (dispatch), `codefill` | AGT.3, S.TA.A, DC.3.4 |
| 3 The agent loop (حلقة الوكيل) | Write the agent loop: ask the model, run its call, add the result, repeat until it answers. Stop a loop that never ends with a step limit. Test the loop honestly with a scripted model. | `planner` | `code` (the loop), `bug` (no stop) | AGT.1, AGT.3, S.SD.A |
| 4 Guardrails in code (حواجز الحماية في الكود) | Allow only the tools a task needs. Allow a message only after the person said yes to that exact message. Check details before a tool runs, and log every action. | `approve` | `code` (a guard), `bug` (an action without approval) | AGT.2, S.ET.A, DC.4.1 |

## `agents-s4` Agent engineering (students, university)

**هندسة الوكلاء: التخطيط وتعدّد الوكلاء والتقييم وحواجز الحماية.** Engineer agents that hold up: plan under a small
context window, split work between a planner and a checker, measure an agent with a proper test set, and change it
safely, with Darsi Tiny on your phone as the test bed.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Plans and memory (الخطط والذاكرة) | Compare planning styles (plan first, or one step at a time) and how errors carry from step to step. Budget a context window (384 tokens against about 128,000) and choose what to keep: recent turns, notes or retrieval. Write a function that trims a conversation to a token budget. | `memory` | `code` (trim to a budget), `codefill` | AGT.1, AGT.3, S.SD.A |
| 2 Several agents, one job (عدّة وكلاء لمهمة واحدة) | Split an agent into roles (planner, checker, runner, person) and say what each may do. Write a checker of strict rules in code. Weigh what more agents cost: tokens, time, and errors that multiply (0.9 × 0.9 = 0.81). | `team` | `code` (a checker), `parsons` | AGT.3, AGT.2, S.SD.C |
| 3 Measuring an agent (قياس أداء الوكيل) | Build a test set with held-out wordings and names, so the score measures more than memory. Score the tool and every detail exactly, and break the score down by language and wording. Report honestly how sure a score from 32 requests can be. | `evals` | `code` (score a test set), `snippet` | AGT.3, S.SD.A, DC.1.2 |
| 4 Fine-tuning and guardrails (الضبط الدقيق وحواجز الحماية) | Measure the trade-off between learning a new tool and forgetting old skills (old examples mixed in: 0, 16, 48). Explain why learned safety can fail under new wordings or fine-tuning. Design defence in depth: fewest tools, approval of the exact action, checks, logs and re-evaluation. | `teach` | `code` (approval bound to the exact action), `bug` | AGT.3, AGT.2, S.ET.C |

## Labs across the track

Teachers meet `agentloop`, `tools`, `factcheck` and `approve` at level 1; `planner`, `prompt`, `team` and `costs` at
level 2; `agentloop`, `tools`, `memory` and `teach` at level 3; `team`, `approve`, `evals` and `costs` at level 4.
Students meet `agentloop`, `planner`, `tools` and `approve` (s1); `agentloop`, `team`, `approve` and `costs` (s2);
`agentloop`, `tools`, `planner` and `approve` (s3); `memory`, `team`, `evals` and `teach` (s4). A lab met again comes
with a harder task: `agentloop` at level 3 opens "What Darsi Tiny sees"; `tools` at level 3 reads the check under each
call; `approve` at level 4 switches the code check off; `team` at level 4 is a design with roles; `costs` at level 4
prices a whole school.

## Placement

`content/placement/agents.json`: three questions per audience and level, from recognising an agent (level 1) to
deciding how to evaluate and govern one (level 4).
