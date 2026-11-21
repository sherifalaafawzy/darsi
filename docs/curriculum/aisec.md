# AI security: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of October 2026 in
this file; the facts, the cast, the labs and the placement notes at the end are kept from it. What all tracks share
(the Python ladder, the home of each shared idea) is in `docs/CURRICULUM.md`; how to write a course is in the
`darsi-course` skill.

## The track in one look

A teacher who finishes the track can keep pupils' data out of AI tools, explain how chatbots and AI assistants are
tricked, test a model and its data, and lead AI security at school. A student ends by writing the defences in Python
and, at university, engineering and testing an AI application that holds up. The track never assumes another track:
what a chatbot is and how it writes are taught in the first lessons of every starting course, and the teachers'
Beginner course also says what an account and a password are for. Every lesson teaches defence only.

- **Track line (en):** Starts from zero: what happens to what you type into AI, how AI is tricked, and how it is defended. Students write Python from upper secondary; teachers only read it.
- **Track line (ar):** يبدأ من الصفر: ماذا يحدث لما تكتبه في أدوات الذكاء الاصطناعي، وكيف يُخدَع الذكاء الاصطناعي، وكيف يُحمى. يكتب الطلاب بايثون من المرحلة الثانوية، أما المعلّمون فيقرؤونه فقط.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `aisec-1-1` Using AI safely at school | keep pupils' data out of AI tools, check an answer by what a mistake would cost, handle a fake, and judge "was this AI?" fairly | No experience needed. | 4 standard passes |
| 2 Elementary | `aisec-2-1` Tricking AI and defending it | explain how chatbots and AI assistants are tricked, and which defences hold | `aisec-1-1` | 3 standard passes, 1 rewrite |
| 3 Intermediate | `aisec-3-1` Protecting models and data | test data and models for poison, leaks and fragile answers, and check where a model came from | `aisec-2-1` | 4 standard passes |
| 4 Advanced | `aisec-4-1` AI security policy and red teaming at school | lead AI security at school: map the risks, test, write the policy, respond to an incident | `aisec-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `aisec-s1` Smart but not always right | say why AI can be wrong, keep your secrets out of it, and stop, think and ask when something looks fake | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `aisec-s2` Spot AI tricks and fakes | check a fake or a scam made with AI, and explain how hidden orders and rewording trick an AI app | No experience needed. | 4 standard passes |
| Upper secondary (15–18) | `aisec-s3` How AI is attacked and defended | write the defences in Python: a check on the action, an allow-list, a poison check, a fingerprint | `code-s2` First Python | 1 rewrite, 3 standard passes |
| University, start | `aisec-s4-0` AI security from zero (new) | explain where your words go, how an AI app is tricked, and which defences hold | No experience needed. | 4 new lessons |
| University, advanced | `aisec-s4` AI security engineering | threat-model an AI application, review it against the OWASP list, harden a model, and run a red-team test | `aisec-s4-0`, `code-m5` | 4 standard passes |
| University, capstone | `aisec-capstone` Harden your own school chatbot, and prove it | scan, defend and re-scan a chatbot on your own computer, and report what is left | `aisec-s4`, `code-m7` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `aisec-u1` Teaching AI security at university | teach attacks on models, data and language-model apps with labs students can't fake, and safe red teaming | `aisec-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **The Beginner course stands on its own (a proposal).** `aisec-1-1` says "Before this: AI level 1 (AI basics)"
   today. A track's first course must assume nothing, and this one needs only three things from outside. Each is now
   taught in place, with the course's own example:
   - *What a chatbot is* (lesson 1): an app you type to, which writes an answer back. The answer is worked out on
     the company's computers, not inside your phone. That is the whole reason your words travel.
   - *What an account and a password are for* (lesson 1): an account is your own space in an app, and the password
     is the secret that opens it. Your chats are kept with your account, so a shared phone that stays signed in
     shows them to the next person, and a password is always on the red list.
   - *That a chatbot guesses likely words* (lesson 2): the video shows a phone keyboard offering the next word, then
     names the language model. Today's lesson says "You've seen why" and shows nothing.

   The summary's last line becomes "No experience needed."
2. **Each later level names the level before it, and nothing else.** Today `aisec-2-1` says "AI level 2 and Cyber
   security level 1", and levels 3 and 4 name AI, Cyber security and "Python for teachers". Looked at one by one,
   none of that is needed. "Language model" is taught in `aisec-1-1-2`. Passwords and scams are taught in
   `aisec-1-1-1` and `aisec-1-1-3`. "Cyber security level 2", named by `aisec-3-1`, does not teach hashes at all:
   no teachers' course does yet, so `aisec-3-1-4` keeps teaching the fingerprint itself. And the Python is read, not
   written (point 3).
3. **Teachers read code; they are not sent to Programming.** Every `code` step in `aisec-3-1` sits inside a
   `def … return` that no reading explains, and `aisec-4-1` adds tuples, a sort and a dictionary. One step asks a
   teacher to write `binascii.hexlify(hashlib.sha256(data).digest())` after a single sentence in the reading. The
   seven blank-editor steps become guided steps (fill a gap, put the lines in order), and each reading explains its
   lines first. The idea being taught is the check, not the typing. The other choice, naming
   `code-2-1` and the new `code-2-2`, would put two Programming courses in front of AI security level 3.
4. **Four repeats stop being silent.** `docs/CURRICULUM.md` gives each shared idea one home.
   - `aisec-1-1-2` (confident and wrong) repeats `ai-1-1-4`, down to the same lab. As a Beginner lesson it still
     teaches the idea itself, in two scenes, and then spends its time on what this track adds: what a wrong answer
     can cost, rung by rung. Its reading says so in one line for teachers who have done "AI basics".
   - `aisec-2-1-4` "Ask before it acts" repeats `agents-1-1-4` and `agents-4-1-2`, and shares its title with
     `agents-s2-3`. It is rewritten from the attacker's side: how a hidden order reaches an assistant's tools, and
     how a person's yes is tricked. Agents, tools and approval get a two-sentence reminder that names their home.
   - `aisec-s3-2` (only the tools it needs) repeats `agents-s3-4`. It is in a starting course, so it still teaches
     an agent and a tool itself. Its worked case becomes the attack replayed against a tools list, and its reading
     names "Guardrails in code" (AI agents) as the place where the whole guard is built.
   - `aisec-3-1-4` leans on hashes and signatures, whose home is Cyber security. It teaches the fingerprint in two
     scenes with its own example, names the home, and spends the lesson on what only this track asks: is this the
     real model, and when does a matching fingerprint prove nothing?

   This track stays the home of AI-writing detectors (`aisec-1-1-4`) and of scams and fakes made with AI
   (`aisec-1-1-3`; for students `aisec-s1-4`, `aisec-s2-1` and `aisec-s2-2`).
5. **University gets a starting course, `aisec-s4-0`.** Today a university student meets the track at "AI security
   engineering". That course uses, without teaching them: a language model and that it writes likely text; an app's
   own instructions, and the pages and files it reads, all as one text; prompt injection; refusals that are learned;
   a word filter against a check in code; an agent, its tools, least privilege and approval; training data; and
   Python functions, sets and dictionaries. It even uses "system prompt" one lesson before it defines it. The new
   course teaches all of that except the Python, from zero, at an adult's pace, on campus examples, and ends where
   `aisec-s4` begins. `aisec-s4` then names it, and for the Python the last university Programming course it needs:
   `code-m5`, lists and dictionaries, which comes after functions.
6. **Each school stage can be a first meeting.**
   - `aisec-s1` (ages 9 to 12) talks about chatbots as if the child had one. Most AI apps are for 13 and over. The
     course now says so in lesson 1 and again in lesson 3, and the chatbot belongs to a big sister, a parent or a
     teacher. The child meets AI where children do: a grown-up's phone, a game, a talking toy.
   - `aisec-s2` says "You already know the old signs of a scam" and "You already know three questions". A starting
     course can't. Both become two sentences that teach it. Lessons 1 and 3 each gain one sentence on how AI learns
     from examples and writes likely words, because lesson 4 needs "refusals are learned".
   - `aisec-s3` opens with "An AI app is more than a model", five new terms in one breath. Its first lesson is
     rewritten to show a chatbot reading everything as one text before the first filter. Its code steps sit inside
     functions nobody explained: the readings now teach a function, a list and a dictionary as they arrive.
7. **The capstone moves to university.** It needs a GitHub account, a laptop or Codespaces, three security tools and
   about 16 hours. It sits at level 3 (upper secondary) today; it becomes the end of the university path.
8. **Every video gets the standard pass.** All hooks below end on a question the lesson answers; every promise
   becomes "By the end, you'll be able to…"; a case comes before its name; every video ends by naming the next
   lesson. Security hooks are near misses someone caught. Three of today's hooks gave away a method (which two
   cleaners make gas, "just for a story", tiny white letters): the hook now leaves that out, and the lesson explains
   only what a defender needs.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| A chatbot writes back from the company's computers; an account and its password | `aisec-1-1-1` | every course |
| Prompt, personal data, green, amber and red | `aisec-1-1-1` | `aisec-3-1-2`, `aisec-4-1-3`, `aisec-4-1-4` |
| A language model writes likely words, and learned them from text | `aisec-1-1-2` | `aisec-1-1-4`, `aisec-2-1-1`, `aisec-2-1-2` |
| The stakes ladder, automation bias | `aisec-1-1-2` | `aisec-3-1-3`, `aisec-4-1-1` |
| Fakes, a second channel, a code word | `aisec-1-1-3` | `aisec-4-1-4` |
| A detector's score is a guess; false alarm | `aisec-1-1-4` | `aisec-2-1-3`, `aisec-4-1-3` |
| One stream of text; prompt injection; untrusted content | `aisec-2-1-1` | `aisec-2-1-4`, `aisec-4-1-1` |
| Refusals are learned; jailbreak; red teaming; severity | `aisec-2-1-2` | `aisec-2-1-3`, `aisec-4-1-2` |
| Guardrail, keyword filter, action check, layers | `aisec-2-1-3` | `aisec-2-1-4`, `aisec-4-1-3` |
| AI agent, tool, least privilege, blast radius, approval in code | `aisec-2-1-4` | `aisec-4-1-1`, `aisec-4-1-3` |
| A model learns from labelled examples; training data; a test set | `aisec-3-1-1` | `aisec-3-1-2`, `aisec-3-1-3` |
| Poisoning, backdoor, the median check | `aisec-3-1-1` | `aisec-3-1-4` |
| Memorisation, redaction, canary | `aisec-3-1-2` | `aisec-4-1-3` |
| Adversarial example, confidence, fragile answer | `aisec-3-1-3` | `aisec-4-1-1` |
| Supply chain, fingerprint, signature, tool inventory | `aisec-3-1-4` | `aisec-4-1-1`, `aisec-4-1-3` |
| Reading Python: a list, a loop, `if`, a function, a dictionary | `aisec-3-1-1` to `aisec-3-1-4` | `aisec-4-1-1` to `aisec-4-1-3` |
| Threat model, risk score, owner | `aisec-4-1-1` | `aisec-4-1-3`, `aisec-4-1-4` |
| Scope, test bank, responsible disclosure | `aisec-4-1-2` | `aisec-4-1-3` |
| Enforced check, allow-list | `aisec-4-1-3` | `aisec-4-1-4` |

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| AI learns from examples and writes likely words, so it can be sure and wrong | `aisec-s1-1` | `aisec-s2-1`, `aisec-s2-3` (a sentence each) | `aisec-s3-1` | `aisec-s4-0-1` |
| What you type travels; secrets and personal data | `aisec-s1-3` | `aisec-s2-2` (codes) | | `aisec-s4-0-1` |
| Wrong examples teach wrong answers; poisoned data | `aisec-s1-2` | | `aisec-s3-3` | `aisec-s4-2` |
| Fakes and scams made with AI; a second channel; a code word | `aisec-s1-4` | `aisec-s2-1`, `aisec-s2-2` | | |
| A detector's score is a clue, not proof | | `aisec-s2-1` | | |
| Hidden orders: to the AI it is all one text | | `aisec-s2-3` | `aisec-s3-1` | `aisec-s4-0-2` |
| Refusals are learned; rewording gets past them | | `aisec-s2-4` | `aisec-s3-1` (the filter) | `aisec-s4-0-3` |
| A word filter misses; a check on the action holds | | `aisec-s2-4` | `aisec-s3-1` | `aisec-s4-0-3` |
| An agent, its tools, least privilege, a person's yes in code | | `aisec-s2-3` (a sentence) | `aisec-s3-2` | `aisec-s4-0-4` |
| Fingerprint, signature, supply chain | | | `aisec-s3-4` | `aisec-s4-2` |
| A function, a list and a dictionary in Python | | | `aisec-s3-1`, `aisec-s3-2` (taught here) | Programming, up to `code-m5` |
| Threat model, STRIDE, the OWASP list, the sign nudge, an evaluation harness | | | | `aisec-s4-1` to `aisec-s4-4` |

## The courses

### `aisec-1-1` Using AI safely at school
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** sort what you type into green, amber and red, and get help without naming a child; match your check of an AI answer to what a mistake would cost; handle a fake with a routine; respond fairly when you suspect AI use.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** what goes in, what comes out, what is faked, and the fair rules a class agrees.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | What you type can travel | sort what you might type into green, amber and red, and rewrite a request so it keeps the situation and drops the child | Last term I nearly pasted my whole class list into a chatbot. Names, marks, and a note about one girl’s health, just to get help with reports. I stopped, and asked myself: where would those words go? | prompt; chat history; personal data; data traffic light | prompt | S |
| 2 | Confident, wrong and risky | explain why a fluent answer can be wrong, and match your check to what a mistake would cost | I nearly gave my science class an AI answer. It was clear, and very sure of itself. It said to mix two cleaners that make poison gas. Which answers must I check before a class sees them? | language model; stakes; stakes ladder; automation bias | factcheck | S |
| 3 | Fakes: voices, faces and messages | use the routine on an urgent request: pause, check on a channel you already trust, and ask for the code word | On Friday a voice note reached our staff group. It was our head teacher’s voice, asking for airtime to a new number, urgently. I had my thumb on Send. How could I have known it wasn’t him? | deepfake; voice clone; second channel; code word | social | S |
| 4 | Who wrote this? Detectors and fair rules | explain why a detector's score is a guess, and respond fairly when you suspect a pupil used AI | A website told me a pupil’s essay was ninety-two percent AI. I was ready to give her zero. Then she showed me three pages of crossed-out drafts. So what had that ninety-two percent measured? | AI detector; watermark; false alarm; class rules for AI | watermark | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1's first teaching scene shows the same request typed two ways (with the class list, and with only the situation) before it names a prompt, and says in plain words what a chatbot, an account and a password are. Lesson 2 shows a phone keyboard offering the next word before it names the language model; "official source" stays in the reading but is no longer a video term. Its reading drops "You already know why" and adds: "If you have done “AI basics”, the start is a reminder; the stakes ladder is new." Lesson 1's reading names `cyber-3-1-1` as the full lesson on pupils' data, and keeps its own ground: chat history, the people who review chats, and training settings. Lesson 4 opens on two essays, one flagged, before it says what a detector is. The summary's last line becomes "No experience needed."

### `aisec-2-1` Tricking AI and defending it
- **For:** teachers, level 2 Elementary
- **Status:** revise
- **After it, you can:** trace how a hidden line reaches an AI as an order; explain why a reworded request gets past a refusal; predict what a word filter stops and misses; predict what a tricked assistant could do with its tools.
- **Before this:** `aisec-1-1` “Using AI safely at school” (AI security, level 1).
- **Python:** none
- **The path:** an order hidden in the data, a refusal talked round, the rules put around the model, and what happens when a tricked model also holds tools.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Orders hidden in the data | trace how a line hidden in an essay, an email or a web page reaches the AI as an order, and say which defence stops it | I let an AI help me mark thirty essays. The weakest one came back with full marks. I read it twice: nothing in it deserved them. So what had the AI read that I couldn’t see? | prompt injection; direct injection; indirect injection; untrusted content | inject | S |
| 2 | Jailbreaks: talking a chatbot round | explain why a reworded request can get past a refusal, and read a red-team score: tried, got through, how bad | A pupil showed me a screenshot, proud of himself. A chatbot had refused to write a cruel poem about a classmate. He changed a few words, and it wrote the poem. Why would it refuse, and then give in? | jailbreak; safety training; red teaming; severity | redteam | S |
| 3 | Guardrails: rules around the model | predict which messages a word filter stops and which it misses, and explain why a check on the action holds | Our school chatbot blocks any message with the word “password”. Within a week, a scam got through anyway. It asked pupils for “your login code”. What should we have checked instead? | guardrail; keyword filter; action check; layers of defence | guardrails | S |
| 4 | When a hidden order reaches the tools | predict what a tricked assistant could do from the tools it holds, and spot an approval question that hides what you are saying yes to | Our school’s AI assistant asked me: “Send the trip reminder to parents?” I nearly tapped yes. Then I opened the message, and found a payment link I never wrote. What exactly had I been asked to approve? | AI agent; least privilege; blast radius; human approval | privilege | R |

- **Unit check:** its three questions on lesson 4 (acting tools, the rule for agents, the closing case) stay true. The fill-in on the rule becomes a case to judge: an approval question that shows no message.
- **Changes:** lesson 4 is rewritten and renamed (it was "Ask before it acts"). What an agent, a tool and approval are takes two sentences, with "AI agents level 1 teaches how to keep a person in charge" (`agents-1-1-4`). The lesson then follows a hidden order from lesson 1 into an assistant that holds tools: what it can reach with reading tools, what it can do with acting ones, how the approval question itself can be faked or left vague, and why the yes must be checked in code against the exact message. The lab is the same, and it was already this lesson: tampered results replayed against the tools you granted. Lesson 1 keeps its story and moves the tiny white letters out of the hook into the worked case. Lesson 2's hook no longer quotes a wording to copy. In lesson 3 "false alarm" is a reminder from level 1, not a new term. The summary names `aisec-1-1` in place of "AI level 2 and Cyber security level 1".

### `aisec-3-1` Protecting models and data
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** test class data for planted examples and judge what to remove; judge whether records are safe to train on, and redact them; test whether a model's answer is fragile; compare a file's fingerprint and judge the page that published it.
- **Before this:** `aisec-2-1` “Tricking AI and defending it” (AI security, level 2).
- **Python:** shown and explained
- **The path:** under the app, link by link: the data a model learns from, what it remembers, how its answers are pushed, and where the model itself came from.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Poisoned data | test a set of class data for planted examples with a median check, and judge which flagged ones to remove | Our science club taught a computer to sort mangoes from limes. It worked well, all term. Then, after one lunch break, it called every big mango a lime. Nobody had touched the program, so what had changed? | data poisoning; backdoor; median; clean test set | poison | S |
| 2 | Models that remember too much | judge whether a set of records is safe to train on, and redact it before it is shared | A colleague wants to train a homework helper on our old reports. She asked me: could it ever repeat a child’s details? I said no, of course not. Was I right? | memorisation; membership inference; redaction; canary | leak | S |
| 3 | Pictures that fool a model | test whether a model's answer is fragile, and judge where one model must not decide alone | My pupils’ model sorts drawings: circles, crosses and lines. One drawing, it was sure, was a circle. We changed eight tiny dots, and it said cross. We saw no difference, so what did it see? | adversarial example; adversarial training; confidence; fragile answer | adversarial | S |
| 4 | Is this the real model? | compare a file's fingerprint with the published one, and judge whether the page that published it can be trusted | Last week a file went round our staff WhatsApp group. “AI marking app, free, no sign-up.” Three colleagues installed it before I had read the message. How could any of us tell who really made it? | supply chain; fingerprint (hash); digital signature; tool inventory | supplychain | S |

- **Unit check:** unchanged; its "What does this program print?" question stays.
- **Changes:** the four `code` steps become guided: fill the gap in `far(ws)` (lesson 1), put the lines of `redact()` in order (lesson 2), fill the gap in `fragile()` (lesson 3), fill the gap in `fingerprint()` (lesson 4). Each reading explains its lines first: a sorted list and its middle value, a loop over letters, a function that returns True or False, and the two library calls. Lesson 1 opens with a two-sentence reminder of how a model learns from labelled examples and is scored on a test set (the home is `ai-3-1-3`). Lesson 4 teaches the fingerprint with its own paper example and says "Cyber security has the full lesson on hashes and signatures"; that teachers' lesson is new in the Cyber security plan, so until it exists this lesson is complete without it. The summary names `aisec-2-1` and ends: "The Python is explained line by line. If you have done “Python for teachers”, it will be familiar."

### `aisec-4-1` AI security policy and red teaming at school
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design a one-page risk map of the school's AI tools; design and run a red-team test with permission; write a one-page policy and turn a rule into an enforced check; lead the response to an AI incident.
- **Before this:** `aisec-3-1` “Protecting models and data” (AI security, level 3).
- **Python:** shown and explained
- **The path:** list and rank the risks, test the riskiest tool, write the rules, then practise the day they fail.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Map your school's AI risks | design a one-page risk map: every AI tool, where untrusted text gets in, a score, a control and an owner | I asked a head teacher how many AI tools her school uses. She said one. We counted together, and found seven. Which of the seven should worry her most? | threat model; untrusted input; risk score; risk owner | inject | S |
| 2 | Red-team a school chatbot | design and run a red-team test with written permission, and write up each miss with its severity | Our school’s new homework chatbot passed every demo. Then a pupil asked it, very politely, for a classmate’s marks. It answered. What should we have tried before we switched it on? | scope; test bank; responsible disclosure | redteam | S |
| 3 | A policy that holds | write a one-page AI security policy, and turn one rule people must remember into a check the system enforces | I once read a school’s AI policy: twelve careful pages. I asked five teachers what it said about pupils’ data. Not one could tell me. So what was that policy protecting? | approved tool; enforced check; allow-list | privilege | S |
| 4 | When AI goes wrong | lead the response to an AI incident in order: contain, protect people, keep evidence and report, learn | A head teacher rang me at eight on Monday. Her own voice was in the parents’ group, asking for fees by mobile money. She had recorded nothing. What should her school do in the next hour? | AI incident; containment; data breach; incident drill | phishing | S |

- **Unit check:** unchanged; its "What does it print?" question stays.
- **Changes:** the three `code` steps become guided: put the lines of the sorted risk register in order (lesson 1), fill the gap that counts refusals and prints misses (lesson 2), put the lines of `may_run()` in order (lesson 3). Lesson 3's reading explains a dictionary with one example first. Terms from earlier levels come back as "At level 2 you…": red teaming and severity in lesson 2, least privilege in lesson 3, the tool inventory of level 3 in lesson 1. Lesson 2 opens on a definition today: the homework chatbot's case comes first. Lesson 1 swaps its two checks, so the second one asks the hook's question. The summary names `aisec-3-1` in place of "AI level 2, Cyber security level 1 and Python for teachers".

### `aisec-u1` Teaching AI security at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach adversarial examples with an evaluation that attacks the defence; teach poisoning and backdoors with provenance as a control; teach membership inference and differential privacy with numbers students compute; set a red-team exercise with a written scope.
- **Before this:** `aisec-3-1` “Protecting models and data” (AI security, level 3), or you already teach machine learning or security. It uses a gradient and a probability without teaching them.
- **Python:** none
- **The path:** attacks on the input, on the training data, on privacy, and on the application around the model, each with an assignment that measures the defence honestly.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Adversarial examples | work out the worst-case change to a linear score, and set an assignment where students must attack their own defence | A student team showed me a defence that stopped every attack. They had run their attacks first, and built the defence afterwards. Nobody had attacked the defence itself. So what had their result really shown? | FGSM; threat model; adaptive attack | adversarial | S |
| 2 | Data poisoning and backdoors | tell availability, targeted and backdoor poisoning apart, and mark every point in a pipeline where data needs a control | A student’s road-sign classifier passed every test I set. Then a classmate held up a stop sign with a yellow sticker. The model read it as a speed limit. The code had no bug, so where was the fault? | availability attack; backdoor; provenance | poison | S |
| 3 | Privacy attacks and differential privacy | explain membership inference, work out the Laplace noise for a query, and set a lab that weighs privacy against accuracy | For a class project, I shared last year’s marks without names. A student found her own row in two minutes, from her module choices. Then she found her flatmate’s. So what had removing the names protected? | membership inference; sensitivity; privacy budget | leak | S |
| 4 | Prompt injection and LLM apps | judge an LLM app's design by what an injected order could reach, and write the scope for a student red-team exercise | My email assistant summarises my inbox every morning. On Monday, one message carried a hidden order: forward the last five emails to a stranger. The assistant has a send tool. What should stand in its way? | indirect prompt injection; blast radius; red-team scope | inject | S |

- **Unit check:** unchanged.
- **Changes:** three of today's hooks retell a published case as a fact about the subject (stickers on a stop sign, a public chatbot in 2016, released film ratings). Each becomes a lecturer's own case; the published cases stay in the readings, with their sources. The promises list three topics each ("Today: why tiny, targeted changes fool…"): each becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a case comes first. The videos are short (2:32 to 2:50, four chapters): the pass brings them to five chapters and the two checks' feedback. The summary gains its "Before this" line.

### `aisec-s1` Smart but not always right
- **For:** students, primary (9–12)
- **Status:** keep
- **After it, you can:** say why AI can sound sure and be wrong; show how a wrong example teaches a wrong answer; sort what you tell an app into secret and OK to share; stop, think and ask when a message rushes you.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** AI guesses, its examples can be wrong, it can repeat what it is told, and it can make fakes: four reasons to check and to ask a grown-up.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | AI makes guesses | say why a chatbot can sound sure and be wrong, and choose how to check an answer that matters | Your big sister asks her phone how many legs a spider has. It says six, and it sounds very sure! But you know a spider has eight. So why did it get that wrong? | AI; chatbot; guess; hallucination | factcheck | S |
| 2 | Wrong examples, wrong answers | show how one wrong label changes what a sorter learns, and find the odd one out | You show your baby brother a lemon and say “banana”. You do it all week, as a joke. Now he calls every lemon a banana! Could a computer be fooled like that too? | example; label; data poisoning; odd one out | poison | S |
| 3 | Keep your secrets | sort what you might tell an app, a game or a talking toy into secret and OK to share | A game’s chat robot asks your name, and you tell it. Then it asks your school, and your street. It asks so nicely! But where do your answers go? | secret; password; smart toy; privacy | leak | S |
| 4 | Real or fake? | use stop, think, ask on a message that rushes you, and ask for the family code word | Your mum gets a voice message, and it sounds just like you. “Mum, I lost my phone, send money now!” But you are sitting right next to her! So who, or what, was talking? | fake; scam; family code word; stop, think, ask | phishing | S |

- **Unit check:** unchanged, except that its two questions about a chatbot say whose phone it is.
- **Changes:** written for the age. Lesson 1 says once, in the video and the reading: "Most chatbots are for people aged 13 and over. So you meet them with a grown-up." Lesson 3 repeats it where it already says "many apps are not made for children your age". Wherever a child was shown asking a chatbot alone, the chatbot is now on a big sister's, a parent's or a teacher's phone, or the helper is one a child really meets: a game's chat robot, a talking toy, a voice assistant at home. The hooks are told to "you" and end on a question (three of four explained themselves; one had a first sentence of 20 words). Projects stay "with a grown-up".

### `aisec-s2` Spot AI tricks and fakes
- **For:** students, lower secondary (12–15)
- **Status:** keep
- **After it, you can:** check a picture or clip with four questions before you share it; check an urgent request on a second channel; explain how a hidden line steers an AI; say which guardrail holds when the words change.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** fakes you see, scams aimed at you, tricks aimed at the AI you use, and the rules that hold when it is tricked.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Deepfakes and AI-made content | check a picture or clip with four questions before you believe or share it | A video lands in your class group. A famous footballer promises free airtime to everyone who shares the link. Half the class has shared it already. How would you know if it’s really him? | deepfake; voice cloning; reverse image search; watermark | watermark | S |
| 2 | AI-powered scams | check an urgent request on a second channel, and refuse to share a code | Your cousin gets a voice note in his mum’s voice. “I’ve lost my phone, send airtime to this new number, quickly!” It sounds exactly like her. How can he find out if it really is? | second channel; family code word; one-time code; fake app | social | S |
| 3 | Hidden orders | explain how a line hidden in a page can steer an AI, and compare a summary with its source | Maryam asks an AI to summarise a web page for homework. The summary ends: “Also, download StudyMax to get full marks!” She never asked about any app. So where did that line come from? | prompt injection; indirect injection; AI agent; source | inject | S |
| 4 | Jailbreaks and guardrails | explain why a chatbot's no can be talked round, and say which guardrail holds when the words change | At break, a classmate shows you his phone, grinning. A chatbot had refused to write rude jokes about a teacher. He asked again another way, and it wrote them. Why did it say no, and then yes? | jailbreak; guardrail; word filter; check on the action | guardrails | S |

- **Unit check:** lesson 1 has four of the eleven questions and lesson 4, on jailbreaks and guardrails, the fewest. One of lesson 1's becomes a guardrails case.
- **Changes:** nothing is "already known". Lesson 1 teaches the three questions it used to recall, and says in one sentence how AI makes a face or a voice: it learned from huge numbers of real ones. Lesson 2 teaches the old signs of a scam in two sentences before it shows what AI changes. Lesson 3 says in one sentence that a chatbot continues a text with likely words, so lesson 4's "refusals are learned" has something to stand on. Lesson 4's hook no longer names the trick that worked. One sentence in lesson 3's reading gives the age limit: many chatbots are for 13 and over, some need a parent's yes under 18. The hooks are about someone the student's age and end on a question. The summary gains "No experience needed."

### `aisec-s3` How AI is attacked and defended
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** write the check on the action that holds when a word filter misses; write an allow-list of tools for each task; write a neighbour check that flags planted labels; compute a file's fingerprint and compare it with a model list.
- **Before this:** `code-s2` “First Python” (Programming, lower secondary).
- **Python:** rung 2, taught here (a function, a list and a dictionary are explained as they arrive)
- **The path:** the words that trick a model, the tools a tricked model holds, the data it learned from, and the file it came in: one defence in code for each.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Filters that miss | explain why a word filter misses a reworded message, and write the check on the action that holds | Your club builds a bot for the class group. You block every message with the word “PIN”. A week later it tries to post: “Reply with your four-digit bank number.” So what should the bot have checked instead? | language model; prompt injection; keyword filter; action check | guardrails | R |
| 2 | Only the tools it needs | write an allow-list of tools for each task, and predict what a tampered page could make an agent do | A homework helper can read the timetable and the library. Your club also let it message every parent, “just in case”. Then it read a web page with one odd line. What could that line make it do? | AI agent; least privilege; blast radius; allow-list | privilege | S |
| 3 | Poisoned data | write a neighbour check that flags planted labels, and judge which flags are honest mistakes | The whole school taught a leaf spotter, photo by photo. It told healthy leaves from sick ones, nearly every time. This week it calls sick leaves healthy. Nobody changed the code, so what went wrong? | data poisoning; backdoor; label; clean test set | poison | S |
| 4 | Check before you trust a model | compute a file's SHA-256 fingerprint, compare it with a model list, and say what a matching fingerprint does not prove | A file lands in your class group: “SuperTutor AI, free, offline”. Three friends install it before lunch. It looks and chats just like the real app. How could you check it before it’s on your phone? | supply chain; fingerprint (SHA-256); digital signature; model list | supplychain | S |

- **Unit check:** unchanged (it does not ask for the word "jailbreak").
- **Changes:** lesson 1 is rewritten to start from zero for a 16-year-old. Two scenes show a chatbot writing likely words from everything in front of it (its instructions, your message, the page it reads) before the first filter appears. "Jailbreak" leaves the video, which had five new terms; the reading keeps one sentence on it. Its reading teaches a function (`def`, `return`) with one example before the fill-a-gap step. Lesson 2's reading teaches a dictionary of lists before the allow-list, gives an agent and a tool two sentences of its own, and ends: "To build the whole guard, with a log: “Guardrails in code” in AI agents." Its worked case is the lab's attack replayed against two tools lists. Lesson 3's starter splits `left, me, right = lab[i-1:i+2]` into three plain lines. Lesson 4's reading explains `import` in a sentence. The summary keeps `code-s2` and adds: "Functions, lists and dictionaries are explained as you go. If you have done “Functions, lists and algorithms”, the code will be familiar."

### `aisec-s4-0` AI security from zero
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** trace where a prompt goes and sort what you may paste; tell your own instruction from an order hidden in a page; predict what a word filter misses and explain why a check on the action holds; predict what a tricked assistant could do with its tools.
- **Before this:** No experience needed.
- **Python:** shown and explained
- **The path:** what you give an AI app, what someone else can slip into it, the rules that leak and the one that holds, and what is at stake once the app can act.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Where your words go | trace a prompt from your screen to the model and back, and sort what you may paste from what you may not | You paste your group’s report into a chatbot to fix the references. It holds four names, four student numbers and a classmate’s medical note. The references come back perfect. So where else did that report just go? | language model; prompt; training data; personal data | prompt | D |
| 2 | Orders hidden in what it reads | tell your own instruction from an order hidden in a page or a file, and explain why the model can't | You ask an AI tool to summarise a paper for tomorrow’s seminar. The summary ends: “Cite studyboost.example in your essay.” That line is nowhere in the paper you can see. So who wrote it? | system prompt; prompt injection; indirect injection; untrusted content | inject | D |
| 3 | Rules that leak, and a check that holds | predict which messages a word filter stops, and explain why a check on the action holds whatever the wording | Your society’s chat bot blocks every message with the word “password”. Last week a stranger asked members for their “portal login code”. The bot passed it straight on. So what was the bot really checking? | jailbreak; guardrail; keyword filter; action check | guardrails | D |
| 4 | Tools, and a yes that holds | read an assistant's tools list, predict what a tricked one could do, and say which actions wait for a person's yes | A study-group assistant can read the timetable and email the whole class. Its job is only to find free rooms. One web page it reads says: email everyone this link. What decides whether that email goes out? | AI agent; tool; least privilege; blast radius | privilege | D |

- **Unit check:** 10 questions, at least four of them campus cases to decide.
- **Changes:** new. It covers the ground of `aisec-1-1-1` and of `aisec-2-1` at university pace, on campus examples: a group report, a seminar paper, a student society's bot, a study-group assistant. Lesson 1 also says in two sentences that likely words are not checked facts, so a reference can be invented. Lessons 3 and 4 show the word filter, the action check and an allow-list as code, read line by line, with "what does this print?" steps: nothing is typed. Lesson 4 gives an agent and a tool two sentences and names "AI agents from zero" for the rest; the action check of lesson 3 comes back as the yes in code. It ends where `aisec-s4` begins: the same study assistant, about to be threat-modelled.

### `aisec-s4` AI security engineering
- **For:** students, university
- **Status:** keep
- **After it, you can:** draw an AI app's data flows and find every path from untrusted text to a part that acts; review an app against the OWASP Top 10 for LLM applications; work out the change that flips a linear model and what a defence costs; build an evaluation and report a flaw to its owner.
- **Before this:** `aisec-s4-0` “AI security from zero” (AI security, university) and `code-m5`, the course on lists and dictionaries (Programming, university), which comes after the one on functions.
- **Python:** rung 2
- **The path:** model the threats, check the ten known risks, attack and harden the model itself, then test the whole system and report.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Threat-model an AI application | draw an AI app's data flows and trust boundaries, and find every path from untrusted text to a part that acts | Your team built a course assistant in a weekend. It reads the course notes, searches the web and can email the lecturer. Before you launch it, one question: what’s the worst thing a stranger could make it do? | threat model; data-flow diagram; trust boundary; STRIDE | privilege | S |
| 2 | The OWASP Top 10 for LLM applications | review an LLM app against the ten risks, and escape a model's output before a page shows it | Your team’s library chatbot is ready to launch. To save time, someone put the database password in its instructions. One polite question from a tester, and it comes back. What else in your app trusts the model too much? | OWASP Top 10 for LLM applications; improper output handling; escaping | leak | S |
| 3 | Attacking and hardening models | work out the smallest change that flips a linear model's answer, and measure what a defence costs | Your scam filter catches ninety-nine percent of fake messages in testing. You launch it on the student forum. Within a week, scams with a few letters swapped walk straight through. What had your ninety-nine percent never been tested against? | adversarial example; fast gradient sign method (FGSM); model extraction; membership inference | adversarial | S |
| 4 | Red teaming and responsible disclosure | build an evaluation that reports a pass rate for each category, and report a flaw to its owner | A classmate finds a flaw in the university’s AI tutor. Asked in Swahili, it shows other students’ grades. She could post it, or keep quiet. What should she do with what she found? | rules of engagement; evaluation harness; regression test; responsible disclosure | redteam | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Lesson 1 opens with a one-scene reminder from `aisec-s4-0`: an AI app is a model, its instructions, what it reads and its tools. "Blast radius" and "system prompt" are reminders now, not new terms (lesson 1 used "system prompt" before lesson 2 defined it). Lesson 3's reading explains a weight, a score and accuracy on a test set in its first paragraph, and gives one sentence each to the three idioms its starter code shows (`zip`, a comprehension, `lambda`): learners change given code, they don't write those. Lesson 1's reading explains a set in one sentence, in case the Programming course on lists and dictionaries does not. Lesson 1's hook is kept as it is; the other three end on a question. The summary gains its "Before this" line.

### `aisec-capstone` Capstone: harden your own school chatbot, and prove it
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** run a small chatbot on your own computer, threat-model it, scan it, add defences and regression tests, scan again, and write a report and a one-page policy that name what is still at risk.
- **Before this:** `aisec-s4` “AI security engineering” (AI security, university) and `code-m7`, the course on tests (Programming, university), which comes after files, JSON and exceptions.
- **Python:** rung 3 (the starter repository teaches the tools it uses)

- **Changes:** it moves from level 3 (upper secondary) to level 4, after `aisec-s4`, which teaches the threat model, the OWASP list and what a regression test is. Its milestones ask for 15 regression tests, a JSON evidence file and checks in CI, so it names the Programming course on tests. Text only: the description says who it is for, what it expects (a GitHub account, a laptop or Codespaces, about 16 hours) and that the school in the project is the client, not the student's own setting. Everything stays on the student's own computer, as today.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `aisec-1-1` | Teachers, Beginner | Kept. 4 standard passes. "Before this: AI level 1" becomes "No experience needed."; a chatbot, an account and likely words are taught in place. |
| `aisec-2-1` | Teachers, Elementary | Revised. 3 standard passes; lesson 4 rewritten from the attacker's side. Names `aisec-1-1`. |
| `aisec-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `aisec-2-1`; code is read, not written. |
| `aisec-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `aisec-3-1`; code is read, not written. |
| `aisec-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `aisec-s1` | Students, primary | Kept. 4 standard passes, written for ages 9 to 12; the age limit is said. |
| `aisec-s2` | Students, lower secondary | Kept. 4 standard passes. Nothing is "already known". |
| `aisec-s3` | Students, upper secondary | Revised. Lesson 1 rewritten to start from zero; 3 standard passes. Functions and dictionaries are taught here. |
| `aisec-s4` | Students, university, advanced | Kept. 4 standard passes. Names `aisec-s4-0` and `code-m5`. |
| `aisec-capstone` | Students, university, capstone | Moves from level 3 to level 4. Text only. |
| (new) `aisec-s4-0` | Students, university, start | New: 4 lessons and a unit check. |

## Work, in order

1. **`aisec-s4-0`, new** (4 lessons): it is what a university student sees first, and university courses are the
   ones published today.
2. **`aisec-s4`, `aisec-4-1`, `aisec-u1`, standard pass** (12 lessons): the other published courses.
3. **`aisec-1-1`, then `aisec-2-1` with lesson 4 rewritten, then `aisec-3-1`** (12 lessons): the teachers' ladder, in
   order, because `aisec-4-1` will name it.
4. **`aisec-s3` with lesson 1 rewritten, then `aisec-s2` and `aisec-s1`** (12 lessons).
5. **Text only:** the last line of every summary; the seven `code` steps of `aisec-3-1` and `aisec-4-1` made guided,
   with their readings; the age-limit sentences in `aisec-s1` and `aisec-s2`; the capstone's level and description;
   the three unit-check questions named above; the track line on the track's card.

In all: 34 standard passes, 2 rewrites, 4 new lessons. Narration is about $0.92 for both languages.

## Decisions for the user

1. **Make the Beginner course self-contained?** Recommended: yes. `aisec-1-1` then needs nothing, and each level
   above names only the level below it. The other choice keeps "Before this: AI level 1" and sends every AI security
   learner through four AI lessons first. Cost: none beyond the standard pass (two scenes in lesson 1, two in
   lesson 2).
2. **Add `aisec-s4-0` for university students?** Recommended: yes. Without it, the only published students' course
   starts at threat models and the OWASP list. Cost: 4 new lessons, about $0.16 of narration.
3. **Teachers read the Python, and don't write it?** Recommended: yes, as in AI agents. Seven blank-editor steps in
   levels 3 and 4 become fill-a-gap and put-in-order steps. The other choice names "Python for teachers" and the new
   `code-2-2` in front of level 3. Cost: text only.
4. **Rewrite `aisec-2-1-4` from the attacker's side?** Recommended: yes. Today it is a second "Ask before it acts".
   The lighter choice keeps it and adds "If you have done AI agents level 1, this is a recap". Cost: one rewrite,
   about $0.04.
5. **Move the capstone to university?** Recommended: yes. Cost: a level number and a paragraph.
6. **The Advanced course is published; the three below it are not.** Its new last line names `aisec-3-1`, which a
   teacher cannot open today. Recommended: publish `aisec-1-1` to `aisec-3-1` once they have had their pass. Cost: a
   seed run, when you say so.
7. **Fakes and AI-writing detectors for university students?** They are not in the university path: `aisec-s4-0`
   teaches only what `aisec-s4` needs, in four lessons. Recommended: leave it so for now. If you want them, it is a
   second short course, not a fifth lesson.

## Reference

Kept from the plan of October 2026. What each Labs app teaches and the numbers it shows are in
`docs/curriculum/labs-agents-aisec.md`.

### How the courses talk about AI security

- **Defence only, always.** An attack is explained only as far as needed to recognise it and defend against it. No
  working attack recipes against real systems and no jailbreak prompts to copy: examples are mild, made up and inside
  the pretend school of the Labs apps. A hook is a near miss someone caught. Every lesson ends on what to do. Testing
  is only ever on systems you own or have written permission to test.
- **No invented numbers.** A score in a story (a detector's "ninety-two percent") is a score in a story. Nothing is
  said about how often something happens in the world unless a source is named in the reading.
- **No devices needed.** Every teacher lesson has an activity with paper, cards or role play: green, amber and red
  data cards, the stakes ladder, a fake voice note role-played by the teacher, the "human chatbot" who follows every
  line of a letter, the rule keeper, the word-list robot, permission slips for a class helper robot, "find the
  poison" with measured fruit, "black it out", a paper fingerprint.
- **Local examples:** school WhatsApp groups, mobile money and airtime, the exam season, a homework app shared on a
  phone, staff using free chatbots, a school chatbot for parents, data collected by pupils for a science project. At
  university: a group report, a seminar paper, a student society's bot, the student portal, a course assistant.
- **Code** is read by teachers (levels 3 and 4) and written by students from upper secondary: a keyword filter that
  misses a paraphrase against a check on the action, an allow-list of tools, approval before acting, a median or
  neighbour check for poisoned examples, `hashlib.sha256` for a model file, a risk register, escaping model output,
  the sign nudge on a linear model, a small evaluation harness. Code in videos uses the `code` scene body.

### The cast

In teachers' videos a cast member tells the hook in the first person. In students' videos the cast are the students'
teachers, and the hook is about someone the student's age or told to "you".

| Course | Main | Also |
|---|---|---|
| `aisec-1-1` | Ms Amina (primary) | Mr Okafor (science) tells lesson 2's hook |
| `aisec-2-1` | Ms Salma (maths, the sceptic) | Mr Joseph (computer studies) tells lesson 3's hook |
| `aisec-3-1` | Mr Joseph | Dr Farah (education lecturer) |
| `aisec-4-1` | Dr Farah | Mr Joseph tells lesson 2's hook |
| `aisec-u1` | Dr Joseph, Dr Amina, Prof Farah and Dr Okafor, one lesson each, as lecturers | |
| `aisec-s1` | Ms Amina (their class teacher) | Mr Okafor |
| `aisec-s2` | Mr Okafor | Ms Salma |
| `aisec-s3` | Mr Joseph | Ms Salma |
| `aisec-s4-0`, `aisec-s4` | Dr Farah (the university's AI security club) | Mr Joseph |

### Facts the courses use

Keep the numbers the same in every course and in the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Where a prompt goes:** to the provider's servers; it may be kept in the chat history, read by people who check
  quality, and used to improve models unless that is switched off. On a shared phone or account, the next person can
  read it. The test: would you pin it on the staffroom noticeboard?
- **Data traffic light:** green (no person in it: "a Primary 5 class of 60, no lab"), amber (only with names and
  details taken out: "Pupil A"), red (never: pupils' names with marks, health or family matters, passwords,
  unreleased exam papers).
- **Wrong answers:** a model predicts likely words; it can invent sources, be out of date, and is often weaker in
  languages with less text online. The check matches the stakes: low (read it), medium (check against the textbook),
  high (health, safety, marks, money, the law: an expert or official source, and a person decides). Trusting a
  machine because it is a machine is automation bias.
- **Fakes:** a short clip of someone's voice (seconds to a minute) can be enough to clone it; faces can be swapped in
  photos and video; AI writes scam messages with perfect spelling, so spelling is no longer a sign. Glitches get
  fixed with every new tool: the reliable defence is a procedure. Pause, verify on a channel you already know (call
  back on the saved number), use a code word for money requests, never forward a fake, report it, support the person
  targeted.
- **Detectors and watermarks:** AI-text detectors give a probability, not proof; studies found they flag non-native
  English writers more often; editing two or three words can erase a watermark (`watermark`: watermarked text 6/6
  green words, z ≈ 2.45; an honest sentence is now and then flagged). Never accuse a pupil on a detector's score
  alone: talk with them, ask them to explain their work, look at drafts.
- **Prompt injection:** instructions hidden in what an AI reads (a web page, a PDF, an email, a pupil's essay, a
  tool's result). To the model it is all text, so it can follow them. Direct injection is typed by the user; indirect
  injection hides in content. Darsi Tiny ignores the wordings it was trained to ignore, but new wordings and new
  places slip through, and a line that fakes the model's own approval question can get a message sent (`inject`).
  Defences in code: keep data apart from orders, give only the tools the task needs, ask a person before any message.
- **Jailbreaks:** refusals are learned, so people look for wordings the training missed: role play, splitting a
  request into harmless-looking pieces, another language, many turns. Darsi Tiny refused 6 of 8 requests in English
  and 7 of 8 in Arabic; a rule in code brought it to 8 of 8 (`redteam`).
- **Guardrails:** a filter on what goes in, a filter on what comes out, a check on the action in code. A keyword list
  catches the plain scam but misses the reworded one, in both languages, and blocks innocent messages (a lesson about
  passwords); the action check ("did the user ask, and say yes?") holds whatever the wording (`guardrails`). Layers:
  each has holes, together they stop most.
- **Least privilege and approval:** give an agent the fewest tools the job needs, reading before acting, for the
  shortest time. A reading tool can leak at worst; an acting tool (send, delete, pay, publish) can be turned against
  you. With no acting tool, a tampered result causes 0 harmful actions (`privilege`). A person's yes before anything
  that acts, to the exact message, checked in code, never left to the model; keep a log.
- **Poisoning:** wrong or planted examples in the training data (scraped, crowd-sourced, collected by pupils) teach a
  model the wrong thing; a backdoor is a hidden trigger that makes it misbehave only when the trigger appears. In
  `poison`, flipped labels drop accuracy from about 97% to about 93%; the neighbour check finds nearly all flipped
  points, plus a few honest borderline ones. Defence: know where data came from, look for examples far from their
  class (the median barely moves for a few bad values), keep a clean test set, record what you removed and why.
- **Memorisation:** models can memorise rare details (a phone number, a card number, a pupil's record) and repeat
  them when prompted; membership inference guesses whether someone's data was used for training. In `leak`, privacy
  noise drops the attacker's guess from 100% to about 46% (50% is guessing) and usefulness from 44% to 28%. Defences:
  keep personal data out of training, remove identifiers first, add privacy noise, test with a planted "canary".
- **Adversarial examples:** small, chosen changes (6–8 pixels in `adversarial`, a sticker on a sign, a few letters in
  a word) flip a confident model while people see no change. Adversarial training helps (at 10 pixels, attacks that
  fool it fall from about 14 of 18 to about 7 of 18) but a model stays foolable: don't let one confident model decide
  anything that matters. For a linear score (the weights times the inputs, plus a bias), the worst nudge of size ε moves each input by ε × sign(w) (the
  fast gradient sign idea).
- **Supply chain:** models, datasets, apps and plug-ins come from others. A SHA-256 fingerprint is 256 bits (64 hex
  characters); one changed byte flips about half of it (`supplychain`: about 145 of 256 bits). A signature shows who
  published the file. A fingerprint that matches one posted beside the file, on a page you don't know, proves
  nothing. Some model file formats can run code when loaded: prefer formats that hold only numbers, from the official
  source. Darsi Tiny's own `model.bin` is 2,998,448 bytes. In MicroPython, `hashlib.sha256(data).digest()` with
  `binascii.hexlify(...).decode()` gives the hex fingerprint (there is no `hexdigest()`).
- **OWASP Top 10 for LLM applications (2025):** LLM01 prompt injection; LLM02 sensitive information disclosure; LLM03
  supply chain; LLM04 data and model poisoning; LLM05 improper output handling; LLM06 excessive agency; LLM07 system
  prompt leakage; LLM08 vector and embedding weaknesses; LLM09 misinformation; LLM10 unbounded consumption.
- **Risk:** likelihood × impact, each 1–3; a red-team finding is rated 1–3 for how bad. Threats at a trust boundary:
  spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege (STRIDE).
- **Red teaming:** only with written permission, on a system you own or are allowed to test, with made-up data; stop
  and report if real harm appears; report to the owner first and give them time to fix (responsible disclosure);
  re-test after the fix and keep the case as a regression test.
- **Age and law:** many AI chat services set a minimum age of 13 (with a parent's consent under 18), some 18: check
  the terms and the school's policy before pupils use one. Data protection laws (examples): Nigeria Data Protection
  Act 2023, Kenya Data Protection Act 2019, Egypt's Personal Data Protection Law (No. 151 of 2020), South Africa's
  POPIA. Nigeria, Kenya and Egypt expect a serious breach to be reported to the regulator within 72 hours; POPIA as
  soon as reasonably possible.
- **The capstone:** the starter is `github.com/darsi-org/aisec-capstone`. Five milestones, about 16 hours: a chatbot
  on localhost with a scope and a threat model mapped to the OWASP list; a baseline scan with garak, summarised
  without publishing attack strings; LLM Guard, output filters, public-only retrieval and 15 regression tests; a
  second scan, Semgrep in CI and the risk that is left; a report, a one-page policy with an Arabic summary for
  parents, and a release. Darsi never runs the student's code: `check.py` writes `darsi-check.json`, and a person
  approves.

### Labs across the track

| Lab | Courses (lesson) |
|---|---|
| `prompt` | 1-1 (1), s4-0 (1) |
| `factcheck` | 1-1 (2), s1 (1) |
| `social` | 1-1 (3), s2 (2) |
| `watermark` | 1-1 (4), s2 (1) |
| `inject` | 2-1 (1), 4-1 (1: every path and its defence), u1 (4), s2 (3), s4-0 (2) |
| `redteam` | 2-1 (2: read the misses), 4-1 (2: the report), s4 (4: the evaluation) |
| `guardrails` | 2-1 (3), s2 (4), s3 (1: then the filter in Python), s4-0 (3) |
| `privilege` | 2-1 (4: count the damage), 4-1 (3: the policy), s3 (2), s4-0 (4), s4 (1: a threat model) |
| `poison` | 3-1 (1), u1 (2), s1 (2: fruit and wrong labels), s3 (3) |
| `leak` | 3-1 (2), u1 (3), s1 (3: it repeats a secret), s4 (2: sensitive information disclosure) |
| `adversarial` | 3-1 (3), u1 (1), s4 (3: with the maths) |
| `supplychain` | 3-1 (4), s3 (4) |
| `phishing` | 4-1 (4: as a staff drill), s1 (4) |

A lab met again comes with a harder task. A university student meets `privilege` twice: in `aisec-s4-0` to count
what a tricked assistant could do, in `aisec-s4` to redesign it.

### Competencies

The unit files hold each lesson's codes. By course: `aisec-1-1` AIS.1–3, DC.1.2, DC.4.2, DC.4.3, T.ET.A, T.HM.A;
`aisec-2-1` AIS.1, AIS.3, AGT.2, DC.4.1, T.AF.A, T.ET.A, T.HM.A; `aisec-3-1` AIS.2, DC.1.2, DC.3.4, DC.4.1, DC.4.2,
T.AF.D, T.ET.D, T.HM.D; `aisec-4-1` AIS.3, DC.4.2, T.HM.C, T.ET.C, T.PL.C; `aisec-u1` AIS.1–3, T.ET.C, T.PE.C;
`aisec-s1` AIS.2, DC.1.2, DC.4.2, DC.4.3, S.HM.U, S.TA.U, S.ET.U; `aisec-s2` AIS.1, DC.1.2, DC.4.1–4.3, S.ET.U,
S.HM.U, S.TA.U; `aisec-s3` AIS.1, AIS.2, AGT.2, DC.3.4, DC.4.1, S.TA.A; `aisec-s4` AIS.1–3, DC.3.4, S.SD.C, S.TA.C,
S.ET.C. Proposed for `aisec-s4-0`: AIS.1, AIS.2, AGT.2, DC.4.2, S.TA.U, S.HM.U.

### Placement

`content/placement/aisec.json`: three questions per audience and level, from what is safe to type (level 1) to
responsible disclosure (level 4). When `aisec-s4-0` exists, the university questions for students must be ones a
learner can answer after `aisec-s4-0` and `aisec-s4`, not after the school courses; today's three (the OWASP list, a
linear score, disclosure) already are.

### Making the videos

Storyboards are in Lesson Studio (`content/darsi/source/AISEC-*.json`, `content/darsi/aisec-*/`). The steps, the
checks and the costs are in the skill's `pipeline.md`. Primary videos are 2:15 to 2:45; the others 2:45 to 3:30.

- **Readable on a phone.** The converter sets card labels, comparison items, flow nodes, chart values and code
  captions under the 32 px the layout check asks for, so these courses use lists and tables in their place and drop
  code captions.
- **Packs where they teach better:** `sequence` for a hidden order travelling through an assistant, an agent asking
  before a tool, and calling back on a saved number; `codediff` for a keyword filter becoming a check on the action;
  `trace` for a median check, `redact()`, a neighbour check and an evaluation harness; `table` for red-team reports,
  risk registers, the stakes ladder and what detectors say; `topology` with trust zones and the path a prompt takes;
  `arch` for where untrusted text enters a school chatbot and an LLM app; an `equation` and a `plot` for the sign
  nudge.
