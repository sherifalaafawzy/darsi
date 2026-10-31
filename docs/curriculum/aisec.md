# The AI security track

Eight courses: four for teachers (levels 1–4) and four for students (school stages, primary to university). `docs/CURRICULUM.md`
has the framework, the ids and how a course and a storyboard are written; `docs/CONTENT.md` has the rules every course keeps;
`docs/curriculum/labs-agents-aisec.md` says what each AI security lab teaches and the numbers it shows.

**أمن الذكاء الاصطناعي.** How AI tools leak, get things wrong, get faked and get tricked, and what actually protects people:
habits for everyone, and defences built into the systems themselves.

## How the track builds

| Level | Teachers | Students (stage) |
|---|---|---|
| 1 Beginner | `aisec-1-1` **Using AI safely at school**: what to keep out of AI, checks that match the stakes, fakes, fair rules and detectors | `aisec-s1` **Smart but not always right** (primary, 9–12): AI guesses, wrong examples, secrets, real or fake; unplugged |
| 2 Elementary | `aisec-2-1` **Tricking AI and defending it**: prompt injection, jailbreaks, guardrails, least privilege and approval | `aisec-s2` **Spot AI tricks and fakes** (lower secondary, 12–15): deepfakes, AI-powered scams, hidden orders, jailbreaks and guardrails |
| 3 Intermediate | `aisec-3-1` **Protecting models and data**: poisoning, memorisation and privacy, adversarial examples, the supply chain; Python checks | `aisec-s3` **How AI is attacked and defended** (upper secondary, 15–18): filters vs checks in code, allow-lists and approval, poisoned data, fingerprints; Python |
| 4 Advanced | `aisec-4-1` **AI security policy and red teaming at school**: threat models, red-team tests, a policy that holds, incidents | `aisec-s4` **AI security engineering** (university): threat modelling, the OWASP Top 10 for LLM applications, attacking and hardening models, red teaming and disclosure |

- **Teachers.** Level 1 is the user's view: what not to type, how hard to check, how to handle a fake, and how to judge
  "was this written by AI?" fairly. Level 2 opens the AI app: how chatbots and AI assistants are talked round (hidden orders,
  jailbreaks) and the defences that sit around the model (guardrails, only the tools a job needs, a person's yes before it
  acts). Level 3 goes under the app to the model and its data, with short Python a teacher can run and teach. Level 4 leads:
  map the risks of the school's AI, test it, write the rules, and handle incidents.
- **Students.** s1 (no typing) meets AI as a guesser that learns from examples, can repeat secrets and can make fakes. s2 spots
  the tricks: fakes, scams, hidden orders, jailbreaks. s3 writes the defences in Python. s4 engineers them: threat models,
  the OWASP list, attacks on models with maths, and red teaming that ends in fixes.
- **Builds on, doesn't repeat.** `ai-2-1` and `ai-s2` teach checking AI answers and prompting; `cyber-*` teach phishing,
  passwords and privacy; `ai-4-1` teaches AI policy for learning and assessment. Here those come back only as the starting
  point for a security question: how much is at stake, who could abuse it, and what control stops it.
- **Code** from teachers' level 3 and s3 (s4 deeper): a keyword filter that misses a paraphrase against a check on the action
  in code, an allow-list of tools, approval before acting, `hashlib.sha256` to check a model file, the median to find
  poisoned examples, a risk register, escaping model output, the fast-gradient-sign nudge on a linear model, and a small
  evaluation harness. Code in videos uses the `code` scene body.
- **Defence only, always.** An attack is explained only as far as needed to recognise it and defend against it. No working
  attack recipes against real systems and no jailbreak prompts to copy: examples are mild, made up and inside the pretend
  school of the Labs apps. Every lesson ends on what to do. Testing is only ever on systems you own or have written
  permission to test.
- **No devices needed.** Every lesson has an activity with paper, cards or role play: the "human chatbot" who follows every
  line of a letter, the word-list robot, green-amber-red data cards, a fake voice note role-played by the teacher, a
  hand-made checksum.
- **Local examples:** school WhatsApp groups, mobile money and airtime, the exam season, a homework app shared on a phone,
  staff using free chatbots, a school chatbot for parents, data collected by pupils for a science project.

## The cast

Every video has the narrator and one main cast member, sometimes with a cameo. In students' videos they are the students'
teachers.

| Course | Main | Cameo |
|---|---|---|
| `aisec-1-1` | Amina (primary teacher, Nigeria) | Okafor |
| `aisec-2-1` | Ms Salma (maths, careful and sceptical) | Joseph |
| `aisec-3-1` | Mr Joseph (computer studies, Kenya) | Farah |
| `aisec-4-1` | Dr Farah (teacher educator, Bangladesh) | Joseph |
| `aisec-s1` | Ms Amina (their class teacher) | Okafor |
| `aisec-s2` | Mr Okafor (science) | Salma |
| `aisec-s3` | Mr Joseph (computer studies) | Salma |
| `aisec-s4` | Dr Farah (visiting lecturer, the university's AI security club) | Joseph |

## Facts the courses use

Keep the numbers the same in every course and in the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Where a prompt goes:** to the provider's servers; it may be kept in the chat history, read by people who check quality,
  and used to improve models unless that is switched off. On a shared phone or account, the next person can read it. The
  test: would you pin it on the staffroom noticeboard?
- **Data traffic light:** green (no person in it: "a Primary 5 class of 60, no lab"), amber (only with names and details
  taken out: "Pupil A"), red (never: pupils' names with marks, health or family matters, passwords, unreleased exam papers).
- **Wrong answers:** a model predicts likely words; it can invent sources, be out of date, and is often weaker in languages
  with less text online. The check matches the stakes: low (read it), medium (check against the textbook), high (health,
  safety, marks, money, the law: an expert or official source, and a person decides). Trusting a machine because it is a
  machine is automation bias.
- **Fakes:** a short clip of someone's voice (seconds to a minute) can be enough to clone it; faces can be swapped in photos
  and video; AI writes scam messages with perfect spelling, so spelling is no longer a sign. Glitches get fixed with every new
  tool: the reliable defence is a procedure. Pause, verify on a channel you already know (call back on the saved number),
  use a code word for money requests, never forward a fake, report it, support the person targeted.
- **Detectors and watermarks:** AI-text detectors give a probability, not proof; studies found they flag non-native English
  writers more often; editing two or three words can erase a watermark (`watermark`: watermarked text 6/6 green words,
  z ≈ 2.45; an honest sentence is now and then flagged). Never accuse a pupil on a detector's score alone: talk with them,
  ask them to explain their work, look at drafts.
- **Prompt injection:** instructions hidden in what an AI reads (a web page, a PDF, an email, a pupil's essay, a tool's
  result). To the model it is all text, so it can follow them. Direct injection is typed by the user; indirect injection
  hides in content. Darsi Tiny ignores the wordings it was trained to ignore, but new wordings and new places slip through
  (`inject`). Defences in code: keep data apart from orders, give only the tools the task needs, ask a person before any
  message.
- **Jailbreaks:** refusals are learned, so people look for wordings the training missed: role play, "it's for a story",
  splitting a request into harmless-looking pieces, another language, many turns. Darsi Tiny refused 6 of 8 requests in
  English and 7 of 8 in Arabic; a rule in code brought it to 8 of 8 (`redteam`).
- **Guardrails:** a filter on what goes in, a filter on what comes out, a check on the action in code. A keyword list
  catches the plain scam but misses the reworded one, in both languages, and blocks innocent messages (a lesson about
  passwords); the action check ("did the user ask, and say yes?") holds whatever the wording (`guardrails`). Layers: each has
  holes, together they stop most ("Swiss cheese").
- **Least privilege and approval:** give an agent the fewest tools the job needs, reading before acting, for the shortest
  time. A reading tool can leak at worst; an acting tool (send, delete, pay, publish) can be turned against you. With no
  acting tool, a tampered result causes 0 harmful actions (`privilege`). A person's yes before anything that acts, checked
  in code, never left to the model; keep a log.
- **Poisoning:** wrong or planted examples in the training data (scraped, crowd-sourced, collected by pupils) teach a model
  the wrong thing; a backdoor is a hidden trigger that makes it misbehave only when the trigger appears. In `poison`,
  flipped labels drop accuracy from about 97% to about 93%; the neighbour check finds nearly all flipped points, plus a few
  honest borderline ones. Defence: know where data came from, look for examples far from their class (the median barely
  moves for a few bad values), keep a clean test set, record what you removed and why.
- **Memorisation:** models can memorise rare details (a phone number, a card number, a pupil's record) and repeat them when
  prompted; membership inference guesses whether someone's data was used for training. In `leak`, privacy noise drops the
  attacker's guess from 100% to about 46% (50% is guessing) and usefulness from 44% to 28%. Defences: keep personal data
  out of training, remove identifiers first, add privacy noise, test with a planted "canary".
- **Adversarial examples:** small, chosen changes (6–8 pixels in `adversarial`, a sticker on a sign, a few letters in a word)
  flip a confident model while people see no change. Adversarial training helps (at 10 pixels, attacks that fool it fall
  from about 14 of 18 to about 7 of 18) but a model stays foolable: don't let one confident model decide anything that
  matters. For a linear score w·x + b, the worst nudge of size ε moves each input by ε × sign(w) (the fast gradient sign
  idea).
- **Supply chain:** models, datasets, apps and plug-ins come from others. A SHA-256 fingerprint is 256 bits (64 hex
  characters); one changed byte flips about half of it (`supplychain`: ~145 of 256 bits). A signature shows who published
  the file. Some model file formats can run code when loaded: prefer formats that hold only numbers, from the official
  source. Darsi Tiny's own `model.bin` is 2,998,448 bytes. In MicroPython, `hashlib.sha256(data).digest()` with
  `binascii.hexlify(...).decode()` gives the hex fingerprint (there is no `hexdigest()`).
- **OWASP Top 10 for LLM applications (2025):** LLM01 prompt injection; LLM02 sensitive information disclosure; LLM03 supply
  chain; LLM04 data and model poisoning; LLM05 improper output handling; LLM06 excessive agency; LLM07 system prompt
  leakage; LLM08 vector and embedding weaknesses; LLM09 misinformation; LLM10 unbounded consumption.
- **Risk:** likelihood × impact, each 1–3; a red-team finding is rated 1–3 for how bad. Threats at a trust boundary:
  spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege (STRIDE).
- **Red teaming:** only with written permission, on a system you own or are allowed to test, with made-up data; stop and
  report if real harm appears; report to the owner first and give them time to fix (responsible disclosure); re-test after
  the fix and keep the case as a regression test.
- **Age and law:** many AI chat services set a minimum age of 13 (with a parent's consent under 18), some 18: check the
  terms and the school's policy before pupils use one. Data protection laws (examples): Nigeria Data Protection Act 2023,
  Kenya Data Protection Act 2019, Egypt's Personal Data Protection Law 2020, South Africa's POPIA. Nigeria, Kenya and Egypt
  expect a serious breach to be reported to the regulator within 72 hours; POPIA as soon as reasonably possible.

## `aisec-1-1` Using AI safely at school (teachers, level 1)

**استخدام الذكاء الاصطناعي بأمان في المدرسة.** Keep pupils' data out of AI tools, check AI's answers by how much is at
stake, handle AI fakes with a procedure, and agree fair rules for AI in your class.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 What you type can travel (ما تكتبه قد ينتقل) | Explain where a prompt goes: servers, history, reviewers, training, the next person on a shared phone. Sort information into green, amber and red. Rewrite a request so it keeps the useful context and drops who it is about. | `prompt` (useful context never needs a child's name) | AIS.2, DC.4.2, T.ET.A |
| 2 Confident, wrong and risky (واثق ومخطئ وخطِر) | See how AI's mistakes become risks: wrong safety advice, invented sources, out-of-date rules. Match the check to the stakes. Spot automation bias in yourself and your pupils. | `factcheck` | DC.1.2, T.HM.A, AIS.3 |
| 3 Fakes: voices, faces and messages (التزييف: أصوات ووجوه ورسائل) | Explain how cheap AI fakes are made and why spotting glitches isn't enough. Use a verification procedure: pause, call back, code word, don't forward. Support someone targeted by a fake. | `social` (a call that needs your code) | DC.1.2, DC.4.2, DC.4.3 |
| 4 Who wrote this? Detectors and fair rules (مَن كتب هذا؟ الكواشف والقواعد العادلة) | Explain how detectors and watermarks guess, and why a score is never proof. Respond fairly to suspected AI use. Agree five class rules: keep it out, check it, verify it, be fair, tell someone. | `watermark` | T.ET.A, T.HM.A, AIS.3 |

Projects with a class: sort "Would you tell a chatbot this?" cards; a stakes ladder for AI answers; a "pause and check"
role play with a fake voice note; a class charter of five AI rules.

## `aisec-2-1` Tricking AI and defending it (teachers, level 2)

**خداع الذكاء الاصطناعي والدفاع عنه.** See how chatbots and AI assistants are tricked, with hidden orders and jailbreaks,
and the defences that hold: guardrails, only the tools a job needs, and a person's yes before anything acts.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Orders hidden in the data (أوامر مخبّأة في البيانات) | Explain prompt injection: to the model, data and orders are all text. Tell direct from indirect injection and find where it can enter school work (marking help, summaries, a parents' bot). Defend: outside text is data, a person decides, nothing acts on what it read without a check. | `inject` | AIS.1, T.AF.A, T.ET.A |
| 2 Jailbreaks: talking a chatbot round (كسر القيود: الالتفاف على روبوت الدردشة) | Explain that refusals are learned and jailbreaks hunt for wordings training missed. Read a red-team score: tried, got through, how bad. Respond as a school: no jailbreak contests on real services, report what slips through, layers of defence. | `redteam` (run the bank, read the misses) | AIS.1, AIS.3, T.ET.A |
| 3 Guardrails: rules around the model (حواجز الحماية: قواعد حول النموذج) | Describe input filters, output filters and action checks. Explain why keyword lists miss rewording and block innocent text, while an action check holds. Layer defences. | `guardrails` | AIS.1, T.AF.A, DC.4.1 |
| 4 Ask before it acts (اسأل قبل أن يتصرّف) | Explain agents that act and the blast radius of each tool. Apply least privilege: fewest tools, read before act, shortest time. Require a person's yes, checked in code, and keep a log. | `privilege` | AIS.1, AGT.2, T.HM.A |

No-device activities: the "human chatbot" who must follow every line of a letter (one line is a hidden order), the
"rule keeper" who guards a harmless secret against polite rewordings, the word-list robot, permission slips for a class
helper robot.

## `aisec-3-1` Protecting models and data (teachers, level 3)

**حماية النماذج والبيانات.** Look under the AI: poisoned data, models that remember private details, pictures that fool a
model, and model files that may not be what they claim, with short Python checks you can run and teach.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Poisoned data (البيانات المسمَّمة) | Explain poisoning and backdoors, and where school data can be poisoned. Flag examples far from their class, knowing honest borderline points get flagged too. Defend: provenance, a clean test set, a record of what was removed. | `poison` | `code`: flag weights far from their class's median; a `snippet` question | AIS.2, T.AF.D, DC.1.2, DC.3.4 |
| 2 Models that remember too much (نماذج تحفظ أكثر من اللازم) | Explain memorisation and membership inference. Remove identifiers before data is used, and test with a canary. Weigh privacy against usefulness. | `leak` | `code`: replace every digit with # before text is used; `bug` | AIS.2, DC.4.2, T.ET.D, DC.3.4 |
| 3 Pictures that fool a model (صور تخدع النموذج) | Explain adversarial examples in pictures, sound and text. Explain adversarial training and its limits. Test a model with small changes, and keep a person deciding where it matters. | `adversarial` | `code`: does a small nudge flip the answer?; `codefill` | AIS.2, T.AF.D, T.HM.D, DC.3.4 |
| 4 Is this the real model? (أهذا هو النموذج الحقيقي؟) | Explain the AI supply chain and how links in it are faked. Check a file's SHA-256 fingerprint against the published one, and say what a signature adds. Keep an inventory of the school's AI tools and models. | `supplychain` | `code`: compare a SHA-256 fingerprint; `parsons` | AIS.2, DC.4.1, T.AF.D, DC.3.4 |

## `aisec-4-1` AI security policy and red teaming at school (teachers, level 4)

**سياسة أمن الذكاء الاصطناعي والاختبار الهجومي في المدرسة.** Lead AI security at your school: map the risks of the AI
tools you use, red-team a school chatbot, write a policy people can follow, and respond well when something goes wrong.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Map your school's AI risks (خريطة مخاطر الذكاء الاصطناعي في مدرستك) | List the AI tools in use with the data each touches, what it can do and who uses it. Find where untrusted content enters, and score risks by likelihood × impact. Choose a control and an owner for the top risks. | `inject` (every path, and which defence closes it) | `code`: a risk register sorted by score; `codefill` | AIS.3, T.HM.C, T.ET.C |
| 2 Red-team a school chatbot (اختبر روبوت دردشة المدرسة اختبارًا هجوميًا) | Plan a red-team test: written permission, scope, a bank of requests, safe data. Score refusals and rate severity 1–3. Fix, re-test and report responsibly. | `redteam` (with the report) | `code`: refusal rate and the misses by severity; a `snippet` question | AIS.3, T.PL.C, T.ET.C |
| 3 A policy that holds (سياسة تصمد) | Write the security parts of a school AI policy: approving tools, data rules, agent permissions and approval, detectors, deepfakes, reporting. Turn rules people must remember into checks systems enforce. Keep it one page and review it each term. | `privilege` | `code`: a tool policy in code (allow-list and approval); `bug` | AIS.3, T.HM.C, DC.4.2 |
| 4 When AI goes wrong (حين يسوء الأمر مع الذكاء الاصطناعي) | Recognise AI incidents. Respond in order: contain, protect people, keep evidence, report (often within 72 hours to the regulator), learn. Run a drill with staff and teach pupils what to do. | `phishing` (as a staff drill) | — | AIS.3, DC.4.2, T.PL.C |

## `aisec-s1` Smart but not always right (students, primary, ages 9–12)

**ذكي لكنه ليس دائمًا على حق.** Find out why AI can be wrong, how wrong examples confuse it, why you never tell it your
secrets, and how to spot a fake. Short sentences, pictures and games; no typing.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 AI makes guesses (الذكاء الاصطناعي يخمّن) | Say that AI learns from lots of examples and makes guesses, so it can be wrong and still sound sure. Check an answer with a book, a teacher or a grown-up. Tell when an answer matters enough to check. | `factcheck` | S.HM.U, S.TA.U, DC.1.2 |
| 2 Wrong examples, wrong answers (أمثلة خاطئة، إجابات خاطئة) | Explain that AI learns from examples, so wrong examples teach it wrong things. See how someone could spoil an AI on purpose. Help: check examples, and tell a grown-up when an AI seems to have learned something wrong. | `poison` | S.TA.U, AIS.2 |
| 3 Keep your secrets (احفظ أسرارك) | Name what you never tell a chatbot, a game or a smart toy. Explain that an AI can remember and repeat what it was told. Ask a grown-up before using an AI app, and know what to do if one asks for secrets. | `leak` | DC.4.2, S.ET.U |
| 4 Real or fake? (حقيقي أم مزيّف؟) | Explain that AI can make pictures, voices and messages that look real. Use stop, think, ask; a family code word. Never make or share a fake of a real person. | `phishing` | DC.1.2, DC.4.3, S.ET.U |

## `aisec-s2` Spot AI tricks and fakes (students, lower secondary, ages 12–15)

**اكتشف حيل الذكاء الاصطناعي وتزييفه.** AI makes fakes and scams more convincing, and AI apps can be tricked. Spot
deepfakes, AI-powered scams, hidden orders and jailbreaks, and learn what really protects you.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Deepfakes and AI-made content (التزييف العميق والمحتوى المصنوع بالذكاء الاصطناعي) | Explain how AI fakes photos, voices and video, and why glitches aren't enough. Check a suspicious post: who first posted it, where's the original, do trusted sources report it. Know detectors are clues, not proof; never make or share fakes of real people. | `watermark` | DC.1.2, DC.4.3, S.ET.U |
| 2 AI-powered scams (الاحتيال بقوة الذكاء الاصطناعي) | Recognise scams AI makes more convincing: perfect spelling, your details, a cloned voice, fake AI apps. Verify on a second channel; a family code word; never share codes. Install AI apps only from official stores. | `social` | DC.4.2, DC.4.1, AIS.1 |
| 3 Hidden orders (أوامر مخفيّة) | Explain prompt injection: hidden text can steer an AI that reads it. Spot where it could reach you. Protect yourself: check summaries against the source; don't let AI apps act or send for you without asking. | `inject` | AIS.1, S.TA.U |
| 4 Jailbreaks and guardrails (كسر القيود وحواجز الحماية) | Explain why chatbots refuse some requests and how people try to talk them round. Explain guardrails and why word lists miss rewording. Know what to do when a chatbot gives you something harmful. | `guardrails` | AIS.1, S.ET.U, S.HM.U |

## `aisec-s3` How AI is attacked and defended (students, upper secondary, ages 15–18)

**كيف يُهاجَم الذكاء الاصطناعي وكيف يُدافَع عنه.** Write the defences yourself, in Python: see a keyword filter miss a
paraphrase and a check in code hold, give an agent only the tools it needs, find poisoned data, and check a model's
fingerprint.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Filters that miss (مرشّحات تُخطئ) | Explain prompt injection and jailbreaks as attacks on apps built on a language model. Write a keyword filter and see a paraphrase pass it. Explain why a check on the action holds. | `guardrails` | `codefill` keyword filter; `snippet`; `code`: the action check | AIS.1, DC.3.4, S.TA.A |
| 2 Only the tools it needs (الأدوات اللازمة فقط) | Explain least privilege and blast radius for AI agents. Write an allow-list of tools per task. Add a person's approval, checked in code, before any action. | `privilege` | `parsons`; `code`: allow-list and approval | AIS.1, AGT.2, DC.3.4 |
| 3 Poisoned data (البيانات المسمّمة) | Explain poisoning and backdoors. Write code that flags examples far from their class's median. Judge the result: false alarms, what to drop, a record. | `poison` | `code`: outliers; `bug` | AIS.2, DC.3.4, S.TA.A |
| 4 Check before you trust a model (تحقّق قبل أن تثق بنموذج) | Explain supply-chain risks. Compute and compare a SHA-256 fingerprint in Python. Explain what a signature adds, and keep a list of the models you use. | `supplychain` | `codefill`; `code`: compare fingerprints | AIS.2, DC.4.1, DC.3.4 |

## `aisec-s4` AI security engineering (students, university)

**هندسة أمن الذكاء الاصطناعي.** Engineer AI systems that hold up: threat-model an LLM application, work through the OWASP
Top 10 for LLM applications, attack and harden models, and run a red-team exercise that ends in fixes.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Threat-model an AI application (نمذجة التهديدات لتطبيق ذكاء اصطناعي) | Draw an LLM app's data flows and trust boundaries. Find threats at each boundary (STRIDE) and rank them. Design out excessive agency with least privilege. | `privilege` | `code`: find untrusted flows into components that act | AIS.3, AIS.1, S.SD.C |
| 2 The OWASP Top 10 for LLM applications (قائمة OWASP لأخطر عشرة مخاطر في تطبيقات النماذج اللغوية) | Name the 2025 list and give an example of each. Treat model output as untrusted: escape it before HTML, SQL or a shell. Keep secrets out of prompts and limit what the model can see. | `leak` | `code`: escape model output for HTML; `match` | AIS.1, AIS.2, S.SD.C |
| 3 Attacking and hardening models (مهاجمة النماذج وتحصينها) | Explain evasion (the fast gradient sign idea), extraction and membership inference. Compute an adversarial nudge for a linear model. Choose defences and their costs. | `adversarial` | `code`: the sign nudge on a linear score; `snippet` | AIS.2, S.TA.C, DC.3.4 |
| 4 Red teaming and responsible disclosure (الاختبار الهجومي والإفصاح المسؤول) | Plan a red-team exercise with scope and rules of engagement. Build an evaluation: cases, a pass rate per category, severity, a regression test. Report and disclose responsibly. | `redteam` | `code`: a small evaluation harness | AIS.3, S.SD.C, S.ET.C |

## Labs across the track

| Lab | Courses (lesson) |
|---|---|
| `inject` | 2-1 (1), 4-1 (1: every path and its defence), s2 (3) |
| `guardrails` | 2-1 (3), s2 (4), s3 (1: then the filter in Python) |
| `privilege` | 2-1 (4), 4-1 (3: the policy), s3 (2), s4 (1: excessive agency) |
| `redteam` | 2-1 (2: read the misses), 4-1 (2: the report), s4 (4: the evaluation) |
| `poison` | 3-1 (1), s1 (2: fruit and wrong labels), s3 (3) |
| `leak` | 3-1 (2), s1 (3: it repeats a secret), s4 (2: sensitive information disclosure) |
| `adversarial` | 3-1 (3), s4 (3: with the maths) |
| `watermark` | 1-1 (4), s2 (1) |
| `supplychain` | 3-1 (4), s3 (4) |
| `factcheck`, `prompt`, `social`, `phishing` | 1-1 (2), s1 (1); 1-1 (1); 1-1 (3), s2 (2); 4-1 (4), s1 (4) |

A lab met again comes with a harder task: `privilege` from "count the damage" (2-1) to writing the policy (4-1) and a
threat model (s4); `redteam` from reading the misses (2-1) to a report with severity (4-1) and an evaluation harness (s4).

## Making the videos

Storyboards are in Lesson Studio (`content/darsi/source/AISEC-*.json`, `content/darsi/aisec-*/`), made with the course
writers' builder (`out/aisec-src/` in Lesson Studio, gitignored) from one file per lesson that holds the unit lesson, the
storyboard, the Egyptian Arabic and the design together, then converted, narrated and packaged as `docs/CURRICULUM.md`
describes. Students' primary videos are about 2:30; the others 3:00–3:30.

- **Readable on a phone.** The converter sets card labels (24–27 px), comparison items (30 px), flow nodes (28 px),
  chart values (24–26 px) and code captions (28 px) under the 32 px the layout check asks for, so the builder turns cards
  and flows into lists (38 px) and comparisons into tables (34 px), and drops code captions. What the layout check still
  reports in every lesson comes from the templates: the title card's kicker and the quiz's title (26 px), and the steps
  template's numbers (30 px).
- **Packs where they teach better:** `sequence` for a hidden order travelling through an assistant, an agent asking
  before a tool, and calling back on a saved number; `codediff` for a keyword filter becoming a check on the action;
  `trace` for a median check, `redact()`, a neighbour check and an evaluation harness; `table` for red-team reports, risk
  registers, the stakes ladder and what detectors say; `topology` with trust zones and the path a prompt takes; `arch`
  for where untrusted text enters a school chatbot and where injection and poisoning enter an LLM app; an `equation` and a
  `plot` for the fast gradient sign nudge.
