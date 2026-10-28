# The AI track

Eight courses: four for teachers and four for their students (ages 12–16), one per level. `docs/CURRICULUM.md` has the
framework, the ids and how a course is written; this page is what each AI course teaches.

| Level | Teachers | Students |
|---|---|---|
| 1 Beginner | `ai-1-1` AI basics (live) | `ai-s1` What is AI? |
| 2 Elementary | `ai-2-1` AI tools for teaching | `ai-s2` Talking to AI honestly |
| 3 Intermediate | `ai-3-1` How AI models work | `ai-s3` Train your own model |
| 4 Advanced | `ai-4-1` Leading AI at school | `ai-s4` AI and society |

## How the levels build

- **Teachers.** Level 1 says what AI is, how it learns from examples, why data must be fair and why you check before you
  trust. Level 2 opens a chatbot (tokens, next-token prediction) and turns that into daily practice: prompts that fit a
  real class, checking what AI makes, keeping pupils' data private. Level 3 goes inside the models (neurons, networks,
  training, testing, language models) so a teacher can judge an AI's results and claims. Level 4 leads a school: audits,
  policy, assessment, and a unit designed around learning, with AI where it helps.
- **Students.** Level 1 meets AI in daily life, how it learns and sees, and what to do when it is wrong. Level 2 is the
  chatbot from the inside, then honest use: good questions, fact-checking, learning instead of copying. Level 3 trains
  and tests their own models and makes them fair. Level 4 weighs AI in society and designs, tests and pitches an AI
  solution for a local problem.
- Every course assumes the one before it, and no lesson repeats a lesson below it: where a Labs app comes back (`bias` in
  teachers' levels 1 and 4), it is used for a new job (spotting a data gap, then running an audit).

## Competencies

Codes from `apps/web/src/content/competencies.ts`. UNESCO's three levels follow Darsi's four: teachers Acquire (levels 1–2),
Deepen (3), Create (4); students Understand (1–2, with Apply where they practise), Apply (3), Create (4). DigComp codes
mark information literacy (`DC.1.2`) and personal data (`DC.4.2`).

## Cast

Every video has the narrator and one main cast member, sometimes with a cameo. In students' videos the cast are their
teachers.

| Course | Main | Cameo |
|---|---|---|
| `ai-2-1` | Amina (primary teacher, Nigeria) | Salma |
| `ai-3-1` | Joseph (computer studies, Kenya) | Farah |
| `ai-4-1` | Farah (teacher educator, Bangladesh) | Okafor |
| `ai-s1` | Mr Okafor (science) | Amina |
| `ai-s2` | Ms Salma (maths) | Joseph |
| `ai-s3` | Mr Joseph (computer studies) | Salma |
| `ai-s4` | Dr Farah (visiting the school's AI club) | Okafor |

---

## `ai-2-1` AI tools for teaching — أدوات الذكاء الاصطناعي في التدريس

Teachers, level 2. *Look inside a chatbot, write prompts that fit your class, check everything it makes, and keep your
pupils' data private.*

### 1. How a chatbot writes — كيف يكتب روبوت الدردشة
- Explain that a chatbot writes one token at a time, each time picking a likely next token, from patterns in huge
  amounts of text.
- Explain why fluent is not the same as true: it predicts, it doesn't look facts up (unless it searches), it has a
  knowledge cut-off, and it can invent details.
- Explain why the same message costs more tokens in Arabic and many African languages, and why tools often work less well
  in languages with less text online.
- **Lab:** `tokens`. **Competencies:** T.AF.A, T.HM.A, S.TA.U.
- **In class:** "Human chatbot": pupils build a sentence one word at a time, each choosing a likely next word, then
  check whether the finished sentence is true.

### 2. Prompts that fit your class — طلبات تناسب صفّك
- Write a prompt with a role, a task, context (age, class size, resources, language) and a format, plus an example when
  it helps.
- Improve an answer with follow-ups instead of starting again.
- Say what the AI cannot know about your class, and add it.
- **Lab:** `prompt`. **Competencies:** T.PE.A, T.PL.A, T.AF.A.
- **In class:** "Prompt makeover": show a weak prompt and its answer; groups add one ingredient each and predict how the
  answer changes.

### 3. Generate, then check — أنشئ ثم تحقّق
- Use AI to draft teaching material (questions, examples, explanations) and check it for facts, level, bias and local
  fit before it reaches pupils.
- Ground an answer in your own source ("answer only from this page of the textbook") and know what that does and
  doesn't guarantee.
- Keep a person responsible for everything that reaches pupils.
- **Lab:** `rag`. **Competencies:** T.PE.A, T.HM.A, DC.1.2.
- **In class:** "Find the mistakes": pupils check an AI-made worksheet (with planted errors) against the textbook.

### 4. Keep pupils' data private — احمِ بيانات طلابك
- Name the personal data that never goes into a public AI tool (names with marks, health, family, photos, voices, ID
  numbers).
- Remove personal details from a task before using AI, and check a tool's settings, age rules and your school's rules.
- Explain why what goes in can come out: chats can be used to train later models, and models can repeat what they
  learned.
- **Lab:** `minilm`. **Competencies:** T.ET.A, DC.4.2, T.HM.A.
- **In class:** "Traffic light": pupils sort cards of information into green (fine to share with an AI), amber (only
  without names) and red (never).

---

## `ai-3-1` How AI models work — كيف تعمل نماذج الذكاء الاصطناعي

Teachers, level 3. *Neurons, networks, training and testing, and language models: enough of the inside to judge an AI's
results and claims in your school.*

### 1. One neuron — خلية عصبية واحدة
- Work out a neuron's output from its inputs, weights and bias.
- Explain weights as how much each input matters, and learning as changing them.
- Explain that one neuron can only draw one straight line between two answers.
- **Lab:** `neuron`. **Competencies:** T.AF.D, S.TA.A.
- **In class:** "Human neuron": three pupils hold input cards, one adds up their weighted votes and decides.

### 2. How a network learns — كيف تتعلّم الشبكة العصبية
- Explain how layers of neurons combine straight lines into shapes one neuron can't learn.
- Describe training as a loop: guess, measure the error, nudge every weight a little downhill, repeat (gradient
  descent).
- Explain why the step size and enough varied examples matter.
- **Lab:** `playground`. **Competencies:** T.AF.D, T.PE.D.
- **In class:** "Warmer, colder": one pupil finds a hidden object guided only by "warmer" and "colder", which is how
  training follows the error downhill.

### 3. Train, test, trust? — درّب واختبر… ثم ثِق؟
- Explain overfitting, and why a model's score must come from examples it never trained on.
- Tell false positives from false negatives, and say which costs more in a school case.
- Question an accuracy claim: tested on whom, on which data, with which mistakes?
- **Lab:** `overfit`. **Competencies:** T.AF.D, T.HM.D, DC.1.2.
- **In class:** "Memoriser and learner": one pupil memorises ten answers, another learns the method; new questions show
  the difference.

### 4. Inside a language model — داخل النموذج اللغوي
- Describe the loop: tokens become numbers, attention gathers context, the model scores every possible next token,
  picks one and repeats.
- Explain the training stages: pretraining on huge amounts of text, then fine-tuning with examples and human feedback.
- Explain why a language model can be confidently wrong, and how grounding and checking help.
- **Lab:** `llm`. **Competencies:** T.AF.D, T.PE.D.
- **In class:** "Who is 'it'?": pupils draw arrows from "it" to the words that tell them what it means, which is what
  attention does.

---

## `ai-4-1` Leading AI at school — قيادة الذكاء الاصطناعي في المدرسة

Teachers, level 4. *Audit AI tools for fairness, write your school's AI policy, redesign assessment for pupils who have
AI, and plan a unit where AI serves the learning.*

### 1. Audit an AI tool — دقّق أداة ذكاء اصطناعي
- Plan a small audit with work like your own pupils': the groups to compare, the errors to count for each.
- Ask a supplier the questions that matter: data, testing, languages, privacy, offline use, cost.
- Decide to adopt, pilot or refuse from evidence, with a person checking the tool's decisions.
- **Lab:** `bias` (an overall score hiding one group's failures). **Competencies:** T.ET.C, T.HM.C, DC.1.2.
- **In class:** "Test the tester": pupils test one tool (voice typing or translation) with their own voices and
  languages and record where it fails.

### 2. Your school's AI policy — سياسة الذكاء الاصطناعي في مدرستك
- Draft the principles: purpose, people stay responsible, privacy, fairness, openness, honesty in assessment, equal
  access.
- Involve pupils, parents and staff, and plan a yearly review.
- Choose tools with a weighted decision matrix, in the open.
- **Lab:** `decision`. **Competencies:** T.HM.C, T.ET.C, T.PL.C.
- **In class:** "Class AI charter": pupils agree five rules for AI in their class and vote on the wording.

### 3. Assessment when pupils have AI — التقييم في زمن الذكاء الاصطناعي
- Explain why AI-writing detectors can't be the judge: false accusations, and more of them for pupils writing in a
  second language.
- Redesign a task so the learning shows: process, drafts, talk, local and personal content, work in class.
- Set an AI-use level for each task and ask pupils to say how they used AI.
- **Lab:** `threshold`. **Competencies:** T.PE.C, T.ET.C.
- **In class:** "Show your thinking": pupils explain one step of their homework aloud in a two-minute talk with a
  partner.

### 4. Design an AI-supported unit — صمّم وحدة يدعمها الذكاء الاصطناعي
- Plan a unit from its learning goals, then decide where AI helps you, where pupils use it and where it stays out.
- Include a path for pupils with no device, and checks on everything AI makes.
- Plan how you will judge the unit's effect and share it with colleagues.
- **Lab:** `tree` (a model pupils can read and question). **Competencies:** T.PE.C, T.PL.C.
- **In class:** "Decision tree from our data": the class collects data (for example, which days they play outside) and
  builds a tree of yes/no questions on the board.

---

## `ai-s1` What is AI? — ما الذكاء الاصطناعي؟

Students, level 1. *Spot the AI in your day, see how machines learn from examples and how they see, and know what to do
when AI gets it wrong.*

### 1. AI all around you — الذكاء الاصطناعي من حولك
- Tell AI (learns patterns from examples and makes predictions) from machines that only follow fixed rules.
- Spot AI in your own day: keyboard suggestions, voice notes to text, face unlock, maps, video suggestions, spam
  filters.
- Explain that AI predicts; it doesn't think or feel like a person.
- **Lab:** `nextword`. **Competencies:** S.TA.U, S.HM.U.
- **Try it:** keep an "AI diary" for one day: every time you meet AI, write what it predicted.

### 2. How machines learn — كيف تتعلّم الآلات
- Put the steps in order: collect examples, label them, train, test, use.
- Explain why a model is tested on examples it has never seen.
- Explain why more, and more varied, examples help.
- **Lab:** `classifier`. **Competencies:** S.TA.U.
- **Try it:** "Be the machine" with a friend or your family: draw examples of a secret pattern and let them find it.

### 3. How AI sees — كيف يرى الذكاء الاصطناعي
- Explain that a picture is a grid of numbers (pixels).
- Explain that vision AI learns patterns in those numbers from many labelled photos.
- Give reasons it can be fooled: light, angle, and things it never saw.
- **Lab:** `pixels`. **Competencies:** S.TA.U, S.SD.U.
- **Try it:** draw a picture on squared paper as numbers (0 = white, 9 = black) and ask someone to draw it back from
  the numbers.

### 4. When AI gets it wrong — عندما يخطئ الذكاء الاصطناعي
- Name the two kinds of mistake: a false alarm and a miss.
- Explain that people choose which mistake matters more, and that gaps in the data cause mistakes too.
- Know what to do: check, ask a person, report it.
- **Lab:** `threshold`. **Competencies:** S.HM.U, S.ET.U.
- **Try it:** find one AI mistake this week (a wrong suggestion, a bad translation) and work out what it got wrong and
  why.

---

## `ai-s2` Talking to AI honestly — الحوار مع الذكاء الاصطناعي بأمانة

Students, level 2. *See how a chatbot writes, ask it good questions, check its facts, and use it to learn, never to
copy.*

### 1. How a chatbot writes — كيف يكتب روبوت الدردشة
- Explain that a chatbot learned from huge amounts of text and writes by predicting the next word, piece by piece.
- Explain why it can sound sure and still be wrong, and why it may know less about your country and language.
- Build a tiny language model and see it can only write from what it learned.
- **Lab:** `minilm`. **Competencies:** S.TA.U, S.HM.U.
- **Try it:** "One word each": write a story with a friend, one likely word at a time, and see where it goes wrong.

### 2. Ask good questions — اسأل أسئلة جيدة
- Write a clear request: what you want, what you already know, your level, and the form of the answer.
- Ask the AI to explain step by step, give a hint, or quiz you, instead of handing you the answer.
- Keep personal details out of what you type.
- **Lab:** `prompt`. **Competencies:** S.TA.A, S.HM.A.
- **Try it:** turn one homework question into a request for a hint, not the answer, and compare the two replies.

### 3. Check the facts — تحقّق من المعلومات
- Explain hallucinations: invented facts, numbers, quotes and sources.
- Check a claim against two trusted sources (the textbook, a teacher, a trusted website).
- Know that pictures, videos and voices can be made by AI too, and check before you share.
- **Lab:** `factcheck`. **Competencies:** DC.1.2, S.HM.A.
- **Try it:** check three facts from an AI answer (or a forwarded message) against your textbook.

### 4. Learn, don't copy — تعلّم ولا تنسخ
- Explain why you only learn what you practise yourself, like the robot in the lab that learns from its own tries.
- Tell honest uses of AI (explain, quiz me, check my work) from dishonest ones (do it for me), and follow your school's
  rules.
- Say how you used AI when you hand work in.
- **Lab:** `rl`. **Competencies:** S.ET.U, S.HM.A.
- **Try it:** use AI as a tutor for one topic: ask it to quiz you, answer yourself, then ask it to explain your mistakes.

---

## `ai-s3` Train your own model — درّب نموذجك بنفسك

Students, level 3. *Collect and label your own data, see how classifiers decide, test your model honestly and make it
fair for everyone.*

### 1. Data first — البيانات أولًا
- Plan a dataset: what to collect, the labels, how many, how varied.
- Spot problems in data: wrong labels, too few examples, one kind of example far more than another.
- Collect data fairly: ask permission and keep personal details out.
- **Lab:** `shapes`. **Competencies:** S.SD.A, S.TA.A.
- **Try it:** collect 20 labelled examples of something around you (leaves, fruit, handwriting) and note what is
  missing.

### 2. How a classifier decides — كيف يقرّر المصنِّف
- Describe each example by features (numbers you can measure).
- Classify a new example by its nearest neighbours, and see how the number of neighbours changes the answer.
- Explain why the choice of features matters.
- **Lab:** `knn`. **Competencies:** S.TA.A.
- **Try it:** measure ten fruits (size, softness) on a chart, label them ripe or not, and classify a new one by its
  nearest neighbours.

### 3. Test it honestly — اختبره بأمانة
- Keep test data apart from training data, and count right and wrong answers.
- Explain overfitting: perfect on training examples, poor on new ones.
- Tell a false positive from a false negative, and say which matters more for your model.
- **Lab:** `overfit`. **Competencies:** S.TA.A, S.SD.A.
- **Try it:** test a friend's "memorised" answers against new questions, then explain overfitting to them.

### 4. Fair for everyone — منصف للجميع
- Find who a model fails by testing each group separately, not only overall.
- Fix bias at its source: collect the missing examples, then test again.
- Explain why a fair model matters to the people it judges.
- **Lab:** `bias`. **Competencies:** S.ET.A, S.SD.A.
- **Try it:** test voice typing or a translator with different voices or languages in your family and record who it
  understands best.

---

## `ai-s4` AI and society — الذكاء الاصطناعي والمجتمع

Students, level 4. *Weigh the ethics of AI, explore the work it changes and creates, then design, test and pitch an AI
solution for a problem near you.*

### 1. Who decides what's fair? — مَن يقرّر ما العدل؟
- Use five questions on any AI: is it fair, private, open about how it works, who is responsible, did people agree?
- Explain that the values inside an AI (what matters, which mistake is worse) are people's choices.
- Explain the harm of deepfakes and of AI used to watch people, and what you can do.
- **Lab:** `decision`. **Competencies:** S.ET.C, S.HM.C.
- **Try it:** hold a short debate at home or in class: should our school use face recognition for attendance?

### 2. AI and the work of tomorrow — الذكاء الاصطناعي وأعمال الغد
- Explain that AI changes tasks more than whole jobs, and creates new work.
- Name AI work near you (farming, health, transport, languages) and the people behind AI (data labellers, engineers,
  testers).
- Plan the skills to build: maths and data, judging information, ethics, working with people.
- **Lab:** `kmeans` (a planner placing bus stops). **Competencies:** S.HM.C, S.TA.A.
- **Try it:** interview an adult about one task in their work that AI could help with, and one it never should.

### 3. Design an AI solution — صمّم حلًّا بالذكاء الاصطناعي
- Start from a real local problem and the people who have it, then ask whether AI is needed at all.
- Plan the data (where from, with whose permission) and what the AI will do with it.
- Plan for harm: who could be hurt by a mistake, and how a person stays in charge.
- **Lab:** `rag` (a complete design to take apart). **Competencies:** S.SD.C, S.ET.C.
- **Try it:** write a one-page plan for an AI that helps your school or community.

### 4. Test and pitch it — اختبر حلّك واعرضه
- Test a paper prototype with real users and change it.
- Explain how your AI decides, in words a user understands.
- Pitch it in two minutes: problem, users, data, how it works, risks, why it can be trusted.
- **Lab:** `tree` (a model you can explain). **Competencies:** S.SD.C, S.HM.C.
- **Try it:** pitch your solution to your class, family or school's AI club and collect three questions.

---

## Unit checks

Each course ends with `<course>-check`: ten graded questions over all four lessons, mixing at least four question types,
each with an `explain`, and no video. Its slides are a team quiz, and its kit is the slides and the review plan.
