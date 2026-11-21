# AI: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the eight-course page of October 2026 in this
file; the facts, labs and placement notes at the end are kept from it. The plan behind the six architecture courses
(`ai-d1`–`ai-d3`, `ai-u2`–`ai-u4`) stays in `docs/curriculum/ai-architecture.md`. What all tracks share (the Python
ladder, the home of each shared idea) is in `docs/CURRICULUM.md`; how to write a course is in the `darsi-course`
skill.

## The track in one look

A teacher who finishes the track can explain what AI is and how a chatbot writes, use it in class without handing
over pupils' details, judge a supplier's claim, and lead the school's rules, assessment and planning. A student ends
by training and testing a small model fairly and, at university, by following how networks, vision models and
language models are built, then training a real one. The track never assumes another track, and nobody writes code
in its courses: only the university capstone needs Python.

- **Track line (en):** Starts from zero: what AI is, how it learns, when to trust it. No coding; the university deep dives use school calculus, and the capstone needs Python.
- **Track line (ar):** يبدأ من الصفر: ما الذكاء الاصطناعي، وكيف يتعلّم، ومتى تثق به. لا برمجة في المقررات، لكن المقررات الجامعية المتعمّقة تستخدم تفاضل المرحلة الثانوية، والمشروع الختامي يحتاج إلى بايثون.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `ai-1-1` AI basics | tell AI from a fixed rule, explain how it learns from examples, and check its answers by what a mistake would cost | No experience needed. | 4 standard passes |
| 2 Elementary | `ai-2-1` AI tools for teaching | explain how a chatbot writes, write prompts that fit your class, check what it makes, and keep pupils' details out | `ai-1-1` | 4 standard passes |
| 3 Intermediate | `ai-3-1` How AI models work | work a neuron by hand, train a small network, and judge a model's score and a supplier's claim | `ai-2-1` | 4 standard passes |
| 4 Advanced | `ai-4-1` Leading AI at school | audit a tool, write the school's policy, redesign assessment, and design a unit where AI serves the learning | `ai-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `ai-s1` What is AI? | spot AI in your day, say how it learns and sees, and say what to do when it is wrong | No experience needed. | 4 rewrites (for the age) |
| Lower secondary (12–15) | `ai-s2` Talking to AI honestly | explain how a chatbot writes, ask it well, check what it says, and use it to learn, not to copy | No experience needed. | 4 standard passes |
| Upper secondary (15–18) | `ai-s3` Train your own model | plan your data, see how a model decides, test it honestly and make it fair | No experience needed. | 1 rewrite, 3 standard passes |
| University, start | `ai-s4-0` AI from zero (new) | explain what AI is and how a chatbot writes, ask it well, and check its answers by the stakes | No experience needed. | 4 new lessons |
| University, second | `ai-s4` AI and society | judge a claim about an AI system, say who it fails and who decides, and use AI honestly in your own work | `ai-s4-0` | 4 rewrites |
| University, deep dive 1 | `ai-d1` Networks and sequences | work a neuron and a gradient step by hand, and explain a memory that fades and attention that looks back | `ai-s4`, school calculus | 4 rewrites (to full length) |
| University, deep dive 2 | `ai-d2` Vision and generation | work a filter by hand, report who a detector misses, and tell three ways of generating a picture apart | `ai-d1` | 4 rewrites (to full length) |
| University, deep dive 3 | `ai-d3` Decisions, language and scale | explain learning from reward and fine-tuning, design a test with a refusal, and choose how to split training | `ai-d2` | 4 rewrites (to full length) |
| University, capstone | `ai-capstone` An Arabic sentiment classifier, honestly tested | train, test and publish a real classifier with an honest model card | `ai-d3`, `code-m6` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `ai-u1` Teaching machine learning at university | teach optimisation, backpropagation, attention and honest evaluation, with labs and assessment that survive chatbots | `ai-3-1`, or you already teach the subject | 4 standard passes |
| `ai-u2` Teaching networks and sequences | run one-phone seminars on depth, loss curves, fading memory and attention, each with the wrong idea to expect | `ai-u1` | 4 rewrites (to full length) |
| `ai-u3` Teaching vision and generation | teach filters, detectors and generators on drawn patterns, and mark what students claim about them | `ai-u2` | 4 rewrites (to full length) |
| `ai-u4` Teaching decisions, language and scale | teach reward, fine-tuning, tests with a refusal and training that does not fit one machine, with rubric lines | `ai-u3` | 4 rewrites (to full length) |

## What changes, and why

1. **University students get a path from zero.** Today a university student meets the track at three deep dives
   that open on a definition ("A neuron is a weighted sum, a bias, and an activation") and at a society course
   written for teenagers. The new starting course `ai-s4-0` teaches what AI is, how a chatbot writes, how to ask
   and how to check, on campus examples. `ai-s4` follows, then the deep dives, then the capstone. Everything
   `ai-d1` uses is now taught before it: a model, training data, labels and a prediction (`ai-s4-0-1`), a language
   model and tokens (`ai-s4-0-2`), a test set and overfitting (`ai-s4-1`), error by group (`ai-s4-2`). The slope of
   x² comes from school and is named in the "Before this" line.
2. **`ai-s4` “AI and society” is written again for adults, and reshaped.** It says "Will AI take my mum's job?"
   and "interview an adult you know", and it is less technical than `ai-s3`. Fairness and work stay, moved to
   campus. Two lessons are new: judging an accuracy claim (the bridge the deep dives need) and honest use of AI in
   your own degree, with credit and copyright. "Design an AI solution" and "Test and pitch it" leave the university
   path: the capstone is where a university student builds, tests and presents.
3. **The six architecture courses are written out to full length.** Their ideas, order and labs are right. But
   their videos are 188 to 246 words (the standard is 380 to 450), their readings are 36 to 110 words (the standard
   is 220 to 320), every first teaching scene is a definition, and the first check often repeats the case just
   worked. Each lesson gets a case before its definition, a worked step with the lab's own numbers, a new case for
   the first check, and a full reading. That is why they are counted as rewrites, not standard passes.
4. **Lecturers are not taught the same step twice.** `ai-u1-1` and `ai-u2-2` both have pairs take five steps on θ²
   and both meet "the gradient points at the minimum". `ai-u2-2` now opens with "In `ai-u1` your students took the
   steps by hand" and spends its time on reading loss curves. `ai-u2-4` does the same with attention from `ai-u1-3`.
5. **`ai-s1` is written again for ages 9 to 12.** It was written for 12 to 16. Its ideas stay. Its videos are 458
   to 465 words (primary is 280 to 370), its sentences run past 14 words, its teacher asks "Hands up if you've used
   AI today", and its examples are a class chat group, which children under 13 may not join.
6. **Each school stage can be a first meeting.** `ai-s2` lesson 1 says in one scene what AI is before it names a
   language model. `ai-s3` lesson 1 opened with "my class trained a model", which only makes sense after `ai-s1`:
   it is rewritten to show rules against examples first.
7. **The home lessons say their idea out loud.** AI owns four ideas other tracks borrow. "Check by the stakes"
   becomes the stated outcome of `ai-1-1-4`, `ai-s1-4` and `ai-s4-0-4` (today they say "check important facts").
   Where AI borrows, it reminds and moves on: `ai-2-1-4` opens with two sentences on "share the task, not the
   child" (its home is `cyber-3-1-1`), and `ai-4-1-3` with two on detectors (`aisec-1-1-4`).
8. **Credit and copyright are taught.** No course in any track mentions them. They enter `ai-2-1-3` (the fifth
   check: may I use this?), `ai-s2-4` (say whose words and pictures you used) and get a full lesson for university
   students in `ai-s4-4`.
9. **The capstone moves to university.** It needs GitHub, Colab, Python and about 17 hours. It sits at level 3
   (upper secondary) today; it becomes the end of the university path.
10. **Labs fit their lessons.** `ai-s3-1` drops `convolution` (it belongs to `ai-d2-1`). `ai-d1-4` gains
    `attention`: its only lab today, `melody`, counts which note follows which and has no attention in it. The four
    AI-ladder labs the review found unused are used: `activation` in `ai-3-1-1`, `perceptron` in `ai-3-1-2`,
    `convolution` in `ai-d2-1` and `ai-u3-1`, `embeddings` in `ai-u1-3`.
11. **Every course says what it expects.** Each summary ends "No experience needed." or "Before this: …". Teacher
    lessons lose the student competency codes they carry today.
12. **Every video gets the standard pass.** All hooks below end on a question the lesson answers; every promise
    becomes "By the end, you'll be able to…"; check 2 asks the hook's question; every video names the next lesson.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| A machine that learned from examples, not from a written rule; a prediction | `ai-1-1-1` | every course |
| Training data, a label, a model, testing on unseen examples | `ai-1-1-2` | `ai-3-1-3`, `ai-4-1-1` |
| Bias (in AI) and a data gap | `ai-1-1-3` | `ai-2-1-3`, `ai-4-1-1` |
| A chatbot writes likely words; hallucination; check by the stakes | `ai-1-1-4` | `ai-2-1-1`, `ai-2-1-3`, `ai-3-1-4` |
| Token, language model, next-token prediction, knowledge cut-off | `ai-2-1-1` | `ai-2-1-2`, `ai-3-1-4` |
| A prompt: role, task, context, format; a follow-up | `ai-2-1-2` | `ai-2-1-3`, `ai-4-1-4` |
| Grounding and RAG; a licence, and credit | `ai-2-1-3` | `ai-3-1-4`, `ai-4-1-2` |
| Personal details stay out of a prompt; anonymise | `ai-2-1-4` | `ai-4-1-2` |
| Neuron, weight, bias (the number), activation | `ai-3-1-1` | `ai-3-1-2`, `ai-u1`, `ai-u2-1` |
| Hidden layer, error, gradient descent, learning rate | `ai-3-1-2` | `ai-u1-1`, `ai-u2-2` |
| Test set, overfitting, false positive, false negative | `ai-3-1-3` | `ai-4-1-1`, `ai-4-1-3`, `ai-u1-4` |
| Embedding, attention, pretraining, fine-tuning | `ai-3-1-4` | `ai-u1-3`, `ai-u2-4`, `ai-u4-2` |
| An audit, errors per group, a pilot | `ai-4-1-1` | `ai-4-1-2` |
| AI-writing detector, false alarm, AI-use level | `ai-4-1-3` | `ai-4-1-4` |
| A decision tree: a model you can read | `ai-4-1-4` | |
| Loss as empirical risk, mini-batch; computational graph; query, key and value | `ai-u1` | `ai-u2`, `ai-u4` |

Teachers never meet nearest neighbours in this track: their models are the neuron, the network and, at level 4, a
tree. Students meet it at upper secondary only.

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A rule, or learned from examples; a prediction | `ai-s1-1` | `ai-s2-1` | `ai-s3-1` | `ai-s4-0-1` |
| Examples, a label, a model, a test on new examples | `ai-s1-2` | `ai-s2-1` (training data) | `ai-s3-1` | `ai-s4-0-1` |
| A picture is a grid of numbers | `ai-s1-3` | | | `ai-d2-1` |
| Two kinds of mistake; which one matters; check and ask | `ai-s1-4` | | `ai-s3-3` | `ai-s4-1` |
| Language model, token, next-token prediction | | `ai-s2-1` | | `ai-s4-0-2` |
| A prompt, context, a follow-up | | `ai-s2-2` | | `ai-s4-0-3` |
| Hallucination; check by the stakes; a trusted source | | `ai-s2-3` | | `ai-s4-0-4` |
| Honest use, a note on how you used AI, credit | | `ai-s2-4` | | `ai-s4-4` |
| A dataset: balanced and varied | | | `ai-s3-1` | `ai-s4-2` (data gap) |
| Features, nearest neighbours | | | `ai-s3-2` | |
| Test set, overfitting, false positive, false negative | | | `ai-s3-3` | `ai-s4-1` |
| Bias, error by group, a data gap | | | `ai-s3-4` | `ai-s4-2` |
| Tasks, automation, augmentation | | | | `ai-s4-3` |
| Neuron, weight, activation, hidden layer | | | | `ai-d1-1` |
| Loss, gradient, learning rate, backpropagation | | | | `ai-d1-2` |
| Hidden state; embedding, attention, transformer block | | | | `ai-d1-3`, `ai-d1-4` |
| Filter, pooling; a detector's score and threshold | | | | `ai-d2-1`, `ai-d2-2` |
| Latent code; GAN, diffusion | | | | `ai-d2-3`, `ai-d2-4` |
| Reward, value, policy; fine-tuning; a test suite with a refusal | | | | `ai-d3-1`, `ai-d3-2`, `ai-d3-3` |
| Python: files, CSV and JSON | | | | Programming, up to `code-m6` (the capstone only) |

## The courses

### `ai-1-1` AI basics
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** tell a machine that learned from examples from one that follows a rule; explain how a machine learns and why its data must be fair; match how much you check an AI answer to what a mistake would cost.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** spot AI in things you already use, see how it learns from examples, find who it fails, then check before you trust.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Spot the AI around you | tell a machine that learned from examples from one that follows a fixed rule, in things you already use | Wait… how did my phone know I was going to type “ready”? | artificial intelligence (AI); rule; pattern; prediction | nextword | S |
| 2 | How machines learn from examples | explain in your own words how a machine learns from labelled examples, and why it is tested on ones it has never seen | A scam message reached our staff group this morning. My phone had already marked one just like it as spam. Nobody wrote it a rule about scams. So how did it learn? | training data; label; model; testing | classifier | S |
| 3 | Good data, fair AI | explain why an AI tool can work better for some people than for others, and name the gap in its examples | I said to my phone: maths test moved to Thursday. It wrote: mass chest! My colleague says the same words, and it gets them right first time. So what is wrong with my voice? | bias (in AI); data gap; varied examples | bias | S |
| 4 | Check before you trust | match how much you check an AI answer to what a mistake would cost, and check it in a source you trust | A chatbot gave me two facts and a book to cite. It took ten seconds, and it sounded so sure. One fact was wrong, and the book does not exist. So how was I to know? | hallucination; trusted source; automation bias; stakes | factcheck | S |

- **Unit check:** unchanged, apart from one question on checking by the stakes.
- **Changes:** this is a pack course: edit the unit file and the storyboards by hand, and never run `import-packs` with `--force`. Lesson 1 keeps its hook as it is. Lessons 2 and 3 keep their stories; their hooks were too long for the speech bubble or ran to five sentences. Lesson 4's hook told the answer in the next scene ("But one fact is wrong"): it now ends on the question. Lesson 4 is the teachers' home of "check by the stakes": its habit Ask, Check, Decide says what to check first (what would cost most if wrong), and "stakes" becomes a key term; "chatbot" is explained in passing. In lesson 1 the first check asks about the solar lamp, which the video has just explained: it gets a new case. Text only: the summary ends "No experience needed."; lessons 1 to 4 and the check lose the student codes `S.TA.U`, `S.ET.U` and `S.HM.U`; two dated claims in lesson 4's reading are checked against a source or cut (see Decisions).

### `ai-2-1` AI tools for teaching
- **For:** teachers, level 2 Elementary
- **Status:** keep
- **After it, you can:** explain how a chatbot builds an answer; change a prompt until it fits your class; check an AI draft before it reaches pupils; take pupils' details out of a task.
- **Before this:** `ai-1-1` “AI basics” (AI, level 1).
- **Python:** none
- **The path:** look inside a chatbot, ask it well, check what it makes, then keep your pupils out of it.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How a chatbot writes | explain how a chatbot builds an answer one token at a time, and predict why the same question can get two answers | Same question, two different stories! I asked a chatbot for a rain story for Primary Four. Then I asked again in a new chat, with the same words. So where do its words come from? | token; large language model (LLM); next-token prediction; knowledge cut-off | tokens | S |
| 2 | Prompts that fit your class | change a weak prompt into one that fits your class (a role, a task, the context, a format), then improve the answer with a follow-up | The chatbot planned my fractions lesson for the wrong school! It assumed a projector, worksheets for everyone and thirty pupils. I have sixty-two pupils, one textbook, and no power after noon. So what did I forget to tell it? | prompt; context; format; follow-up | prompt | S |
| 3 | Generate, then check | try an AI draft against five checks (facts, level, bias, local fit, the right to use it), and tie an answer to a source you give it | Twenty quiz questions on healthy eating, in ten seconds! Then I read them: rice as a body-building food, pizza and blueberries as examples. My pupils would have copied every word. How do I catch this every time? | grounding; RAG (retrieval-augmented generation); local fit; open licence | rag | S |
| 4 | Keep pupils’ data private | predict where what you type into a chatbot can end up, and take pupils' details out of a task before you send it | I nearly pasted my whole mark sheet into a chatbot! Names, marks, even a note that Musa missed a month with sickle cell. Then I stopped. Where does all that go when I press send? | personal data; anonymise; age rules | minilm | S |

- **Unit check:** gains one question on the right to use a text or a picture, in place of a recall question.
- **Changes:** lesson 1 is the teachers' home of "what a language model is; tokens". Its first scene names tokens at once: it shows the idea first (pupils building a sentence one likely word each), then names it. Lesson 2 is the home of prompting; its hook gains its question. Lesson 3 gains a fifth check, "May I use it?": a paragraph in the reading on who may reuse what an AI makes and what you paste in, open licences and crediting a source, the key term "open licence", and two questions. "Bias" is no longer listed as new there (lesson `ai-1-1-3` taught it). Lesson 4 opens with a two-sentence reminder of "share the task, not the child" (home: `cyber-3-1-1`) and spends its time on what only a chatbot adds: where your words go, chat history, training on chats, age rules. Lesson 2's "widen" scene adds one use for the teacher's own learning (ask it to quiz you on next week's topic). Text only: the summary names `ai-1-1`; lesson 1 and the check lose `S.TA.U`.

### `ai-3-1` How AI models work
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** work out one neuron's answer by hand; train a small network and read its error; judge an accuracy claim; trace how a language model writes a word.
- **Before this:** `ai-2-1` “AI tools for teaching” (AI, level 2).
- **Python:** none
- **The path:** one neuron, a network that learns, an honest test, then inside the language model you met at level 2.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | One neuron | work out one neuron's answer from its inputs, weights and bias, and judge what a single neuron can and cannot decide | A pupil asked me: is there a tiny brain in the computer? I said no. Then she asked: so what is in there? What would you have told her? | artificial neuron; weight; bias (of a neuron); activation | neuron, activation | S |
| 2 | How a network learns | build a small network that learns a shape one neuron can't, and judge from its error whether the steps are too big | This article says a new AI model has billions of weights. Nobody set one of them by hand. So how did the model find them? | hidden layer; error; gradient descent; learning rate | perceptron, playground | S |
| 3 | Train, test, trust? | judge an accuracy claim: what the model was tested on, whether it memorised, and which mistake it makes | “Ninety-eight per cent accurate!” That is a company’s email to our school, about its AI for spotting pupils likely to drop out. Ninety-eight per cent of what? | overfitting; test set; false positive; false negative | overfit | S |
| 4 | Inside a language model | trace how a language model writes one word, and judge when its answer needs a source and a check | I wrote on the board: the bus didn’t stop because it was… My pupils shouted “full” and “late”. A chatbot finishes it the same way. But how does it know what “it” means? | embedding; attention; pretraining; fine-tuning | llm | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1's hook ended on a statement ("then I had to explain what a neural network is"), with a word the lesson had not taught. Lesson 1 already keeps the neuron's bias apart from bias in data: keep that sentence. "Activation" becomes a key term there, since the second lab is about it. Lesson 3 is the teachers' home of train and test and overfitting: its hook is kept whole. Lesson 4 lists "embedding" as its new term in place of "grounding", which `ai-2-1-3` taught: a one-sentence reminder is enough. Its first scene says "You know the first step: text is cut into tokens", which is right at this level. Text only: the summary names `ai-2-1`; lesson 1 and the check lose `S.TA.A`.

### `ai-4-1` Leading AI at school
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design an audit of an AI tool; write the school's AI policy with the people it affects; redesign a task so the learning shows; design a unit where AI serves the learning.
- **Before this:** `ai-3-1` “How AI models work” (AI, level 3).
- **Python:** none
- **The path:** audit a tool, write the rules, redesign assessment, then design a whole unit.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Audit an AI tool | design a small audit of an AI tool with work like your own pupils', and decide to adopt, pilot or refuse it from its errors per group | Our district bought a reading app. In town it marks children’s reading well. In my village schools it marks good readers wrong. The supplier says it is ninety-five per cent accurate, so how can both be true? | AI audit; overall accuracy; errors per group; pilot | bias | S |
| 2 | Your school’s AI policy | write your school's AI policy as principles, with pupils, parents and staff, and choose a tool in the open with a weighted table | In one school I support, two classrooms share a wall. In one, chatbots are banned. Next door, the homework is set with one. So which rule do the pupils follow? | AI policy; principle; weighted decision matrix | decision | S |
| 3 | Assessment when pupils have AI | redesign a task so the learning shows, set its AI-use level, and explain to colleagues why a detector cannot be the judge | A teacher showed me an essay marked: ninety per cent machine-written. A program had judged it. The pupil wrote every word herself, in her second language. So what did the program measure? | AI-writing detector; false alarm; AI-use level; process evidence | threshold | S |
| 4 | Design an AI-supported unit | design a unit from its learning goals, with AI where it helps, a path for pupils with no device, and a way to judge its effect | A young teacher showed me her unit plan. Six lessons, six different AI tools, one for each. I asked what the pupils should learn, and she went quiet. Where would you start? | backward design; no-device path; decision tree; unit evaluation | tree | S |

- **Unit check:** the review's rough count found lesson 4 with the fewest questions: look, and move one to it if so.
- **Changes:** lesson 1's hook was close to `ai-3-1-3`'s (a supplier's percentage): it is now a surprise from two kinds of school, and the lesson opens "At level 3 you asked what a score was tested on. Now you run the test yourself." Lesson 1 is the teachers' home of fairness by group. Lesson 2 no longer lists "weight" as new: a sentence ties it to the neuron's weight. Lesson 3 gives a two-sentence reminder of what a detector is (home: `aisec-1-1-4`) and says a false alarm is the false positive of `ai-3-1-3`; the hooks of lessons 2 to 4 gain their questions. Lesson 4 meets the first decision tree of the teachers' path: one sentence ties it to level 3 ("a model you can read, unlike a network's weights"). Its reading gains a short paragraph on pupils with low vision or reading difficulties. Text only: the summary names `ai-3-1`.

### `ai-u1` Teaching machine learning at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** design labs in which students take gradient steps, backpropagate and compute attention by hand; set an evaluation students cannot inflate; assess projects when students have language models.
- **Before this:** `ai-3-1` “How AI models work” (AI, level 3), or you already teach the subject. It uses university calculus and linear algebra.
- **Python:** none
- **The path:** learning as a loss going down, the chain rule behind it, attention, then honest numbers and honest assessment.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Learning as optimisation | design a lab in which students take gradient steps by hand, and explain each loss curve before they see code | A student’s first network printed nan after three steps. She had copied my code exactly, except for one number. Her neighbour’s copy trained perfectly. Which number would you check first? | empirical risk; learning rate; mini-batch | gradient | S |
| 2 | Backpropagation | set an assignment in which students build backpropagation themselves and verify every gradient | I asked my class how a network knows which weights to change. One student said: the framework does it. Everyone nodded, and nobody could say how. What would you ask them next? | computational graph; vanishing gradient; gradient check | backprop | S |
| 3 | Attention and transformers | design a lab in which students compute attention by hand for three tokens before they use a library | I showed my class one sentence. The laptop did not fit in the bag because it was full. They all knew what “it” meant, and none could say how. How could a machine work it out? | query, key and value; multi-head attention; positional encoding | embeddings, attention | S |
| 4 | Evaluating models and assessing students | write a project brief with a validation plan fixed in advance, one final test, a model card and an oral defence | Our best team topped the course leaderboard by a wide margin. Then I saw their notebook: forty models, each scored on the same held-back data. What had their winning number really measured? | selection bias; model card; recall | overfit | S |

- **Unit check:** unchanged.
- **Changes:** the stories are kept. None of the four hooks ended on a question: lesson 1 named the learning rate, and lesson 4 said "their final score measured their persistence". Three first sentences were too long for the speech bubble. Each promise lists three topics ("Today: learning as minimising a loss, how gradient descent does it, and why…"): each becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a student's case comes first. The readings are 173 to 198 words: each gains the worked numbers of its lab. Text only: the summary gains its "Before this" line.

### `ai-u2` Teaching networks and sequences
- **For:** university teachers
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** run a seminar on one phone between two for each idea; name the wrong idea students bring; set a question a chatbot cannot answer for them.
- **Before this:** `ai-u1` “Teaching machine learning at university” (AI, university teachers).
- **Python:** none
- **The path:** what depth adds, what a loss curve tells you, why a sequence model forgets, and why attention is not understanding.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A stack of neurons | run a seminar in which students predict which boundary a network can draw before they train it, and mark the sentence that says what the activation does | My student added ten more layers to her network. Its score did not move at all. She asked me: isn’t deeper always smarter? What would you draw on the board? | decision boundary; activation; depth | playground | R |
| 2 | Loss, descent and backprop | run a seminar in which students diagnose three unlabelled loss curves, and mark the claim that a falling loss means a right model | I showed my class a loss curve falling smoothly to zero. Everyone agreed: the model has learned. Then I showed its score on new data: worse than a coin toss. What had the curve been telling us? | validation loss; early stopping | gradient | R |
| 3 | Sequences and the memory that fades | open a lecture on sequence models with a prediction students get wrong, and let the lab correct it before you name the cause | My students say the network reads the whole sentence at once. So I gave them four symbols, where the first decides the last. They stepped through it by hand. Why had the first symbol gone by the end? | hidden state; vanishing gradient | rnn | R |
| 4 | Attention and the transformer | write and mark the question that separates “the model mixes what came before” from “the model understands” | A student wrote in her report: the model understands the sentence. I asked her to point at where. She pointed at a heat map of weights. What should she have written instead? | residual connection; transformer block | attention, melody | R |

- **Unit check:** rewritten with the lessons: at least four of the ten are seminar or marking decisions, not recall.
- **Changes:** today's hooks are instructions to the lecturer ("Show them a ring of points…"), the videos are 194 to 244 words and the readings 46 to 54. Each lesson is written out: a lecturer's own case, the seminar step by step with the lab's numbers, the wrong idea, and the marked question. Lesson 2 no longer repeats `ai-u1-1` (five steps on θ², "the gradient points at the minimum"): it opens with "In `ai-u1` your students took the steps by hand" and teaches reading curves: too big a step, too small, and memorising. Lesson 4 opens the same way on `ai-u1-3` and adds `attention` beside `melody`, because the melody lab counts note pairs and shows no attention. The summary gains its "Before this" line.

### `ai-u3` Teaching vision and generation
- **For:** university teachers
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** teach filters, detectors and generators on drawn patterns only; make students report who a detector misses; mark what students claim a model "understands".
- **Before this:** `ai-u2` “Teaching networks and sequences” (AI, university teachers).
- **Python:** none
- **The path:** a picture as numbers, a detector and who it misses, a picture squeezed into a code, then three ways to invent one.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A picture is a grid of numbers | run a seminar on drawn grids in which students compute one output of a filter by hand and say what it mixes | A student showed me nine numbers and a picture of a door. He said: look, the network sees the door. I asked which of the nine numbers knows about doors. What should he have said? | filter; feature map; pooling | convolution | R |
| 2 | Who a detector misses | set a detection lab on drawn patterns only, and mark the sentence that reports who the detector misses | A colleague set a face-detection lab with the students’ own photos. The detector missed three students, all from one group. They sat there while the class watched. How would you teach the same lesson without doing that? | prototype; score; miss | detect | R |
| 3 | Squeeze and sample | replace “the model understands” in students' reports with a sentence they can check against the two numbers | One sentence keeps turning up in my students’ reports. It says the model understands the picture. Yet its whole code for that picture is two numbers. What do those two numbers really hold? | latent code; decoder; sampling | vae | R |
| 4 | Adversaries and noise | teach three generators from one table (rebuild, contest, denoise), and assess each one's failure, not a guess about a picture | A student brought a generated photo of our campus gate. She asked which kind of model had made it. I had three methods on the board, and I could not tell. So what should I mark instead? | GAN; diffusion; mode collapse | denoise | R |

- **Unit check:** rewritten with the lessons, as for `ai-u2`.
- **Changes:** today's hooks are orders ("Do not assign classmates' photos"), the videos are 196 to 227 words and the readings 36 to 44. Each lesson is written out around a lecturer's own case. The rule "no photographs of people" stays the centre of lesson 2. The summary gains its "Before this" line.

### `ai-u4` Teaching decisions, language and scale
- **For:** university teachers
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** teach reward, fine-tuning, evaluation with a refusal and training at scale; write the rubric line for each; mark the test design, not the adjective.
- **Before this:** `ai-u3` “Teaching vision and generation” (AI, university teachers).
- **Python:** none
- **The path:** learning from a reward that comes late, changing a language model, testing what it must refuse, then training that does not fit in one machine.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Learn from reward | run a seminar in which students separate a value from a policy on one grid, and write a reward that teaches the wrong behaviour | I asked my class to draw what the robot had learned. Half drew arrows: what to do in each square. Half drew numbers: how good each square is. Both called it the same thing, so who was right? | value; policy; credit assignment | rl | R |
| 2 | A language model, and changing one | write the rubric line that makes students name which weights a fine-tune moved, and retest one old skill | Three project reports said: we fine-tuned the model. None said which weights moved, or on how many examples. One team’s model had lost a skill it had before. What line in your rubric would have caught that? | frozen layer; catastrophic forgetting | teach | R |
| 3 | Laws, tests and a person who can look | write the rubric line that fails any evaluation with a missed refusal, and mark the test design, not the word “safe” | A team told me their assistant scored ninety per cent. They called it safe. I asked it one question it must refuse, and it answered in full. What was their ninety per cent worth? | test suite; refusal case; three duties | suite | R |
| 4 | Science stand-ins, and one machine | open a seminar with the memory arithmetic of one wide layer, so students choose how to split training with a reason | A student’s model would not fit on our lab machine. His plan was one line: buy a bigger graphics card. I asked how much memory his widest layer needs. Could your students work it out on paper? | surrogate model; data parallelism; model parallelism | split | R |

- **Unit check:** rewritten with the lessons, as for `ai-u2`.
- **Changes:** as for `ai-u2` and `ai-u3` (videos 194 to 232 words, readings 37 to 50). Lesson 1's hook is about value and policy, so it does not repeat the reward story of `agents-u1-1`. Lesson 4 carries two ideas today (a model standing in for an experiment, and splitting training): the memory arithmetic becomes its one idea, and the stand-in is its "where else" scene. The teach lab downloads Darsi Tiny once (2.8 MB): lesson 2 says so. The summary gains its "Before this" line.

### `ai-s1` What is AI?
- **For:** students, primary (9–12)
- **Status:** rewrite (the same four ideas, written for the age)
- **After it, you can:** tell a machine that follows a rule from one that learned; say how a machine learns from examples; show that a picture is numbers; say what to do when AI is wrong.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** spot it, see how it learns, see how it sees, then know what to do when it gets it wrong.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | AI all around you | tell a machine that follows a rule from one that learned from examples | You type “Good” to your grandma. The phone offers “morning” before you write it! Nobody told it what you wanted to say. So how did it guess? | artificial intelligence (AI); rule; pattern; prediction | nextword | R |
| 2 | How machines learn | put the steps of teaching a machine in order, and say why it is tested on new examples | Mum’s phone gets a message: you won a prize, tap here! The phone hides it before she even looks. Nobody showed it that message before. So how did it know it was a trick? | example; label; model; test | classifier | R |
| 3 | How AI sees | draw a picture as a grid of numbers, and say one reason a machine can see wrong | You point a phone at a leaf. In one second it shows the plant’s name! But a phone has no eyes like yours. So what is it looking at? | pixel; computer vision; edge | pixels | R |
| 4 | When AI gets it wrong | name the two kinds of mistake, say which one matters more in a case, and say what to do: check, and ask a grown-up | The coach sent a message: the match is now on Saturday. Dad’s phone hid it with the junk! On Friday, half the team stood on an empty pitch. The phone was trying to help, so what went wrong? | false alarm; miss; threshold | threshold | R |

- **Unit check:** rewritten to the new wording: ten questions, none typed.
- **Changes:** every video is cut to 280 to 370 words in sentences of 14 words or fewer, with one idea each and things a child can touch. The hooks are told to "you" or about a child, not by the teacher about himself. The class chat group and the forwarded scam become a family phone. Lesson 1 says once: many chat and AI apps are for ages 13 and over, so use them with a grown-up. Lesson 2 says "trick message" and adds that the app calls it phishing. Lesson 4 is the students' home of "check by the stakes": which mistake matters more, then check and ask. It loses "data gap", which upper secondary teaches. `fill` steps choose from a word bank; projects are done at home or with a friend. The summary ends "No experience needed."

### `ai-s2` Talking to AI honestly
- **For:** students, lower secondary (12–15)
- **Status:** keep
- **After it, you can:** explain how a chatbot writes; ask for the help you need; check the claims that matter; use AI to learn and say how you used it.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** see how a chatbot writes, ask it well, check what it says, then use it to learn, not to copy.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How a chatbot writes | explain how a chatbot writes one piece at a time, and why a sure sentence is not a checked fact | You type “See you”, and your phone offers “tomorrow”. A chatbot writes a whole poem about fractions, and it rhymes! One guesses a word, the other writes a page. Is it the same trick, just bigger? | language model; token; training data; cut-off date | minilm | S |
| 2 | Ask good questions | write a request that says what you need, your level and what you already know, and ask for a hint instead of the answer | Yusuf typed one word into a chatbot: fractions. Back came three long pages. Not one line helped with question four of his homework. What should he have told it? | prompt; context; follow-up; personal data | prompt | S |
| 3 | Check the facts | pick out the claims in an AI answer, and check the ones that matter in two sources you trust | Hana’s project had a perfect number in it. Seventy-three per cent of homes in her town have running water, said a government report. Her teacher asked to see the report. Why could nobody find it? | hallucination; claim; trusted source; deepfake | factcheck | S |
| 4 | Learn, don’t copy | tell honest use of AI from copying, and write the note that says how you used it and whose work you used | Mariam and Tarek both handed in perfect homework. In the test, Mariam solved every question. Tarek could not even start. So what was different? | honest use; copying (plagiarism); AI-use note; credit | rl | S |

- **Unit check:** gains one question on credit, in place of a recall question.
- **Changes:** this is a starting course, so lesson 1's "show" scene says what AI is in one example (nobody gave your keyboard rules: it learned from lots of text which word comes next) before it names a language model; it is the students' home of "what a language model is; tokens". Lesson 2 is the home of prompting. The hooks are about a pupil or told to "you"; lessons 2 and 3 explained themselves in their last sentence and now end on the question. The videos are 443 to 475 words: trim to 450. Lesson 4's reading gains a section on credit (say whose words and pictures you used; some may be shared freely, some may not) and two questions; "AI-writing detector" stays as the reading's one extra term. Lesson 4 keeps the `rl` lab, with its link said plainly in the video (the robot is shown no answers and improves only from its own tries, as you do): no other lab fits better today (see Decisions). The summary ends "No experience needed."

### `ai-s3` Train your own model
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** plan and check a dataset; classify a new example by its nearest neighbours; test a model honestly; find who it fails and fix the data.
- **Before this:** No experience needed, only plotting points on a chart.
- **Python:** none
- **The path:** get the data right, see how a model decides, test it honestly, then make it fair for everyone.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Data first | explain how a model learns from labelled examples, and plan a dataset that is balanced and varied | Kofi’s science club taught a phone to spot sick bean leaves. They showed it ninety healthy leaves and ten sick. It called every leaf healthy, and scored ninety per cent! How can it be so right, and so useless? | model; label; dataset; balanced data | shapes | R |
| 2 | How a classifier decides | describe examples with features, and classify a new one by a vote of its nearest neighbours | A mango seller squeezes one mango and glances at its colour. Eat it tomorrow, she says. She has never seen this mango before. So what is she comparing it with? | classifier; feature; nearest neighbours; k | knn | S |
| 3 | Test it honestly | keep a test set apart, spot overfitting from two scores, and say which mistake matters more | Lina’s leaf model scored twenty out of twenty. She showed the whole club. Then Kofi held up a leaf from his garden, and it got it wrong. So what had her twenty out of twenty shown? | test set; overfitting; false positive; false negative | overfit | S |
| 4 | Fair for everyone | test a model group by group, find who it fails, and fix the data | A class trained a model to hear spoken numbers. It scored ninety per cent, and everyone cheered. Then Amal noticed it kept getting her wrong, and her friends too. How can a score that high hide that? | bias; overall score; testing by group; data gap | bias | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1 is rewritten to start from zero for a 16-year-old: two scenes show a rule a person wrote and a pattern a machine found from examples, and name the model, before any data is planned. Its hook uses the lesson's own numbers (ninety healthy leaves, ten sick). "Permission" stays in the reading and the project but is not a video term. It drops the second lab, `convolution`, which has nothing to do with planning data. Lessons 2 to 4 keep their content; all four hooks follow one science club (Kofi, Lina, Amal) and are told about pupils, not by the teacher about his class; three of them explained themselves. This course is the students' home of train and test, overfitting, nearest neighbours and fairness by group. The summary ends "No experience needed, only plotting points on a chart."

### `ai-s4-0` AI from zero
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** tell a model that learned from examples from a program that follows rules; explain how a chatbot builds an answer; ask it for help that keeps the thinking yours; check its answers by what a mistake would cost.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** meet a model that learned from examples, open the chatbot you use every day, ask it well, then check it by the stakes.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Rules, or examples? | tell a program that follows written rules from a model that learned from examples, and name its training data, its labels and its prediction | The library gate opens when you tap your card. Your phone finishes your sentence before you do. Both are just programs. So why does only one of them ever get it wrong? | training data; label; model; prediction | classifier | D |
| 2 | How a chatbot writes | explain how a chatbot builds an answer one token at a time, and say what it can and cannot know about you | You and your flatmate type the same question into the same chatbot. You get two different answers. Both sound completely sure. So where does a chatbot get its words from? | language model; token; next-token prediction | minilm | D |
| 3 | Ask it well | write a request that gives a chatbot the context it lacks, and ask for the help that keeps the thinking yours | Two students ask a chatbot about the same statistics problem. One gets three pages she cannot use. The other gets one hint, and solves it herself. They used the same chatbot, so what did they type differently? | prompt; context; follow-up | prompt | D |
| 4 | Sure is not right | match how much you check a chatbot's answer to what a mistake would cost, and check the claims that matter in a source you can name | Your essay is due at nine tomorrow morning. A chatbot hands you three references, with authors, years and page numbers. They look perfect. Which of them would you bet your grade on? | hallucination; stakes; trusted source | factcheck | D |

- **Unit check:** 10 questions, at least four of them campus cases to decide.
- **Changes:** new. It covers the ground of `ai-s1-1`, `ai-s1-2` and `ai-s2-1` to `ai-s2-3` at an adult's pace, on campus examples (a library gate, a flatmate, a statistics problem, an essay's references), and ends where `ai-s4` begins. Lesson 1's worked case is the lab's: safe and trick messages, then a test on messages the model has never seen. Lesson 2 trains the lab's tiny model and watches it choose each next word; it says one sentence on why a chatbot knows only what is in the conversation, which lesson 3 builds on. Lesson 3 uses the `prompt` lab as it is, a teacher's quiz on the water cycle, to see what each ingredient changes; the practice questions use a student's own cases (see Decisions). Lesson 4 says once what never goes into a chatbot: other people's details. For university students these four lessons are the home of the ideas other tracks borrow. Nothing here says "your class", "a grown-up" or "your pupils".

### `ai-s4` AI and society
- **For:** students, university
- **Status:** rewrite
- **After it, you can:** judge an accuracy claim about an AI system; find who it fails and say who should decide; judge what AI changes in a job; use AI honestly in your own work, with credit.
- **Before this:** `ai-s4-0` “AI from zero” (AI, university).
- **Python:** none
- **The path:** ask what a score was tested on, ask who it fails and who decides, see what it does to the work you are training for, then take charge of your own use.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Tested on what? | judge an accuracy claim: what the model was tested on, whether it memorised, and which mistake it makes | An app says it can predict your exam grade. Ninety-five per cent accurate, the advert promises. Your friend tries it, and it is wrong by two full grades. Can both of those be true? | test set; overfitting; false positive; false negative | overfit | R |
| 2 | Who decides what’s fair? | test a claim group by group, find who a system fails, and say who should decide whether it is used | Your university wants cameras that take attendance by face. In tests, they recognised ninety-eight students in a hundred. Nobody has asked who the other two were. Should it go ahead? | bias; error by group; data gap; consent | bias | R |
| 3 | AI and the work you are training for | split a job into tasks, and judge which ones AI takes over, which it helps with and which stay with a person | Nour is in her final year of accounting. Her uncle says: a machine will do your job before you graduate. Her cousin, a nurse, uses AI every shift and is busier than ever. Which of them is right? | task; automation; augmentation; data labelling | kmeans | R |
| 4 | Your work, your name | decide whether a use of AI in an assignment is honest under the course's rules, and write the note that says how you used it and whose work you used | Maha and Omar both used a chatbot for the same essay. Maha’s lecturer thanked her for saying how. Omar was called to a misconduct hearing. Neither copied a line from anyone, so what was the difference? | academic integrity; AI-use statement; copyright; licence | watermark | R |

- **Unit check:** rewritten: 10 questions on the four new lessons, at least four of them campus cases.
- **Changes:** all four lessons are written again for adults on campus. Lesson 1 is new content at this id: the university home of train and test and overfitting, and what `ai-d1` leans on. Lesson 2 keeps today's question (the face-recognition register, now in a lecture hall) and its five questions for any AI, and adds the test by group with the `bias` lab; today it used `decision`. Lesson 3 is today's lesson 2 with a student about to graduate in place of "my mum's job"; it keeps `kmeans` and says the link plainly (the program places the bus stops, the planner still decides how far anyone should walk). Lesson 4 is new: honest use, a statement of how you used AI, why a detector's verdict is a hint and not proof (the `watermark` lab), who owns what an AI makes, and licences. Today's "Design an AI solution" and "Test and pitch it" leave the course (see Decisions). A learner who finished the old course keeps the completion on the same ids. The summary names `ai-s4-0`.

### `ai-d1` Networks and sequences
- **For:** students, university
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** compute a neuron and a gradient step by hand; explain why a deep network needs an activation; explain why a sequence model forgets; explain attention as a weighted mix.
- **Before this:** `ai-s4` “AI and society” (AI, university), and school calculus (the slope of x² is 2x).
- **Python:** none
- **The path:** one neuron's cut, how a network finds its weights, a memory that fades, then attention that looks back.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A stack of neurons | compute one neuron's answer by hand, and explain why a hidden layer and an activation can separate a shape one line cannot | The cafés sit in a ring around the campus library. Try to split cafés from library with one straight line. You can’t, however you turn the ruler. So how does a model manage it? | neuron; weight; activation; hidden layer | playground | R |
| 2 | Loss, descent and backprop | take a gradient-descent step by hand, and predict what a learning rate that is too large or too small will do | The shower in your hall runs cold. You turn the tap a little, and it is still cold. You turn it a lot, and it scalds! How do you find the right spot? | loss; gradient; learning rate; backpropagation | gradient | R |
| 3 | Sequences and the memory that fades | step a recurrent network through a short sequence, and explain why what it read first fades | Ten friends pass a message down a corridor, whisper by whisper. It starts as: meet at the library at six. It arrives as nonsense about a strawberry. Each friend heard only one whisper, so where did the start go? | recurrent network; hidden state; vanishing gradient | rnn | R |
| 4 | Attention and the transformer | work out which earlier words a word should look back at, and explain attention as a weighted mix | A friend texts: my charger is in the lab, and it’s locked. What is locked? You knew at once, and no rule told you. So how could a model know where to look? | embedding; attention; transformer block | attention, melody | R |

- **Unit check:** rewritten with the lessons; keeps one hand-worked step and one "which architecture" choice.
- **Changes:** today's hooks are statements about the subject ("Look at this ring of points"), the videos are 196 to 246 words and the readings 74 to 95. Each lesson is written out. Lesson 1 shows points on a chart as examples described by two numbers before it names a neuron, and says that a neuron's bias is a number, not the bias of `ai-s4-2`. Lesson 2 gives a one-scene reminder of the slope of x²; its first check asks a new case (today it repeats the worked one: θ = 3, a rate of 0.1), and backpropagation gets a worked scene, not one sentence. Lesson 4 shows a word as a list of numbers before attention, makes `attention` its main lab, and keeps `melody` for "a next-token model only repeats what it counted". Each summary line and each lesson says what the phone left out: a real dataset, a graphics card, many passes. The summary gains its "Before this" line.

### `ai-d2` Vision and generation
- **For:** students, university
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** work a filter by hand; read a detector's score and report who it misses; explain what a short code keeps and loses; tell three ways of generating a picture apart.
- **Before this:** `ai-d1` “Networks and sequences” (AI, university).
- **Python:** none
- **The path:** a picture as numbers, a detector and who it misses, a picture squeezed into a code, then two more ways to invent one.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A picture is a grid of numbers | compute one output of a 3×3 filter by hand, and say what a filter can and cannot find | Zoom into a selfie until it turns into coloured squares. Keep zooming: each square is only a number. Nowhere in those numbers does it say “face”. So where does a model find one? | pixel; filter; pooling | convolution | R |
| 2 | Who a detector misses | read a detector's score against its threshold, and report which group it misses and why | The gate camera at your hall lets your flatmates in every time. It keeps you outside, night after night. The company says it is ninety-eight per cent accurate. What does that number leave out? | prototype; score; threshold; miss | detect | R |
| 3 | Squeeze and sample | squeeze a small picture into a short code, change the code, and explain why what comes back is a new picture | You send a photo over the campus Wi-Fi, and it arrives blurry. Your phone squeezed it to save data. A model can squeeze a small picture into just two numbers. What can it possibly get back from two numbers? | latent code; decoder; sampling | vae | R |
| 4 | Adversaries and noise | tell three ways of generating a picture apart (rebuild, contest, denoise), and say why a generated picture is not evidence | A photo is going round your year’s group chat. The dean is dancing at a party, and it looks completely real. The party never happened. So how do you make a photo of nothing? | GAN; diffusion; denoising step | denoise | R |

- **Unit check:** rewritten with the lessons; keeps one filter computation and one "which group did it miss".
- **Changes:** as for `ai-d1` (videos 200 to 217 words, readings 61 to 83). Lesson 2 opens with one sentence on error by group from `ai-s4-2`, then measures it on drawn patterns; "threshold" becomes a key term, because the lab's line is one. The labs use drawn 8×8 patterns: no photograph of a person appears in any lesson. The summary gains its "Before this" line.

### `ai-d3` Decisions, language and scale
- **For:** students, university
- **Status:** rewrite (the same four ideas and labs, written out to full length)
- **After it, you can:** explain learning from a late reward; explain what fine-tuning changes and costs; design a test that includes a refusal; choose how to split a training step that does not fit.
- **Before this:** `ai-d2` “Vision and generation” (AI, university).
- **Python:** none
- **The path:** learn from a reward that comes late, change a language model, test what it must refuse, then train what does not fit in one machine.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Learn from reward | trace how credit for a late reward travels back along a path, tell a value from a policy, and spot a reward that teaches the wrong behaviour | You learn a new game with no instructions. You press buttons for ten minutes, and suddenly you win. Which of your hundred moves earned that win? And how would you know to do it again? | reward; value; policy | rl | R |
| 2 | A language model, and changing one | explain what fine-tuning changes and what stays frozen, and test what the changed model has forgotten | Your university’s chatbot knows nothing about your faculty’s rules. Training a new one from nothing would cost a fortune. Someone says: just teach it the rulebook. Can it learn something new without losing what it knew? | pretraining; fine-tuning; frozen layer; forgetting | teach | R |
| 3 | Laws, tests and a person who can look | design a small test suite for an AI tool that includes cases it must refuse, and say who answers for what it does | A campus health chatbot scores nine out of ten. Everyone calls it ready. Then a student asks it for a dose of a prescription drug, and it answers. What did the test forget to ask? | test suite; refusal; accountability | suite | R |
| 4 | Science stand-ins, and one machine | work out the memory one training step needs, and choose between splitting the examples and splitting the layer | Your project model trains happily on your laptop. You double its width for a better score. Now it stops at once: out of memory. The lab has two machines, so how do you share the work? | surrogate model; data parallelism; model parallelism | split | R |

- **Unit check:** rewritten with the lessons; keeps one value-against-policy item, one "what did fine-tuning change", one test missing a refusal, and one choice of split with a reason.
- **Changes:** as for `ai-d1` (videos 188 to 215 words, readings 81 to 110). Lesson 2 opens with one sentence on the language model of `ai-s4-0-2` and says the teach lab downloads Darsi Tiny once (2.8 MB). Lesson 3 keeps the three duties as its frame and makes the test with a refusal its one idea. Lesson 4's one idea is the memory of a training step; the model that stands in for an experiment is its "where else" scene. Lesson 4 ends by naming the capstone. The summary gains its "Before this" line.

### `ai-capstone` Capstone: an Arabic sentiment classifier, honestly tested
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** train a baseline and a small Arabic BERT on public reviews, study its mistakes on Egyptian dialect, and publish a demo with an honest model card.
- **Before this:** `ai-d3` “Decisions, language and scale” (AI, university) and `code-m6` (Programming, university: files, CSV and JSON; it comes after functions, lists and dictionaries).
- **Python:** rung 3 (the starter notebooks give the library code; you change it and run it)

- **Changes:** it moves from level 3 (upper secondary) to level 4, after `ai-d3`. Text only: the description says who it is for, what it expects, and which lessons each milestone leans on (the fixed test split: `ai-s4-1`; mistakes by dialect: `ai-s4-2` and `ai-d2-2`; BERT and fine-tuning: `ai-d1-4` and `ai-d3-2`). It needs a computer or Codespaces, a GitHub account and a free Colab graphics card: the description says so in its first lines.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `ai-1-1` | Teachers, Beginner | Kept. 4 standard passes. Says "No experience needed." Loses student competency codes. |
| `ai-2-1` | Teachers, Elementary | Kept. 4 standard passes. Names `ai-1-1`. Lesson 3 gains the right to use a text. |
| `ai-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `ai-2-1`. |
| `ai-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `ai-3-1`. |
| `ai-u1` | University teachers, first | Kept. 4 standard passes. Gains its "Before this". |
| `ai-u2` | University teachers, second | Written out to full length: 4 rewrites. Names `ai-u1`; lesson 2 stops repeating `ai-u1-1`. |
| `ai-u3` | University teachers, third | Written out to full length: 4 rewrites. Names `ai-u2`. |
| `ai-u4` | University teachers, fourth | Written out to full length: 4 rewrites. Names `ai-u3`. |
| `ai-s1` | Students, primary | Written again for ages 9 to 12: 4 rewrites. |
| `ai-s2` | Students, lower secondary | Kept. 4 standard passes. Lesson 1 says what AI is; lesson 4 gains credit. |
| `ai-s3` | Students, upper secondary | Revised. Lesson 1 rewritten to start from zero; 3 standard passes. |
| `ai-s4` | Students, university, second | Rewritten for adults: 4 rewrites. Two lessons new, two leave. Names `ai-s4-0`. |
| `ai-d1` | Students, university, deep dive 1 | Written out to full length: 4 rewrites. Names `ai-s4` and school calculus. |
| `ai-d2` | Students, university, deep dive 2 | Written out to full length: 4 rewrites. Names `ai-d1`. |
| `ai-d3` | Students, university, deep dive 3 | Written out to full length: 4 rewrites. Names `ai-d2`. |
| `ai-capstone` | Students, university, capstone | Moves from level 3 to level 4. Text only. Names `ai-d3` and `code-m6`. |
| (new) `ai-s4-0` | Students, university, start | New: 4 lessons and a unit check. |

## Work, in order

1. **`ai-s4-0`, new** (4 lessons): it is what a university student should see first, and university courses are
   the ones published today. It cannot be published until the app lists courses in path order (Decisions, 2).
2. **`ai-s4`, rewritten** (4 lessons): it is live, and it speaks to teenagers.
3. **`ai-d1`, then `ai-d2` and `ai-d3`, written out** (12 lessons): live, and they lean on the two courses above.
4. **`ai-4-1` and `ai-u1`, standard pass** (8 lessons), then **`ai-u2` to `ai-u4`, written out** (12 lessons): the
   other live courses.
5. **`ai-1-1`, `ai-2-1`, `ai-3-1`, standard pass** (12 lessons): the teachers' ladder, in order.
6. **`ai-s3` (lesson 1 rewritten), `ai-s2`, then `ai-s1` rewritten** (12 lessons): the school stages, not published
   today.
7. **Text only:** every summary's last line; the competency codes on nine teacher lessons and checks; the unit
   checks; the capstone's level and description; `convolution` out of `ai-s3-1`; three placement questions for
   university students.

In all: 27 standard passes, 33 rewrites, 4 new lessons. Narration is about $2.02 for both languages. Of the 33
rewrites, 24 are the six architecture courses written out to full length and 4 are `ai-s1` for its age: they keep
their ideas, terms and labs.

## Decisions for the user

1. **Add `ai-s4-0`, and rewrite `ai-s4` for adults?** Recommended: yes. The other choice is to turn `ai-s4` itself
   into the starting course, which saves four lessons but changes what an earned "AI and society" certificate
   means, and leaves no room for fairness, work and honest use. Cost: 4 new lessons and 4 rewrites, about $0.32.
2. **Make the app list courses in path order.** Inside a level, courses are listed by id today. For university
   students that gives `ai-d1`, `ai-d2`, `ai-d3`, `ai-s4`, `ai-s4-0`: the starting course last, the hardest first.
   Recommended: a number on each course that sets its place (or follow the "Before this" lines), before `ai-s4-0`
   is published. Cost: app work, no content.
3. **Write the six architecture courses out to full length?** Recommended: yes. They were published on 2026-11-05
   at about half the length of a lesson. Cost: 24 rewrites, about $0.96. The cheaper choice (new hooks and promises
   only) leaves readings of 40 to 100 words and first checks that repeat the worked case.
4. **Let "Design an AI solution" and "Test and pitch it" leave the university course?** Recommended: yes. They were
   written for a school AI club, and the capstone now does the building. Their storyboards stay in Lesson Studio's
   history; if upper secondary gets a second course when the school stages are published again, they and today's
   teenage versions of fairness and work are its content, under a new id. Cost now: none.
5. **Move the capstone to university?** Recommended: yes. Upper secondary then ends at the unit check of `ai-s3`,
   with its own project in every lesson and no capstone. Cost: a level number and a paragraph.
6. **Rewrite `ai-s1` for 9 to 12?** Recommended: yes, last, when primary is published again. Until then it should
   not be published as it is. Cost: 4 rewrites, about $0.16.
7. **Give the `prompt` lab a student's case.** Its only case is a teacher writing a quiz. `ai-s2-2` and
   `ai-s4-0-3` use it as it is; a second case (a homework question, with "my level", "what I know" and "a hint,
   not the answer") would also give `ai-s2-4` a lab that fits better than `rl`. Cost: app work in one lab.
8. **Show the track line and each "Before this" in the app.** The lines are written here and in the summaries; the
   track card has no field for its line yet. This is shared with the other tracks. Cost: app work.
9. **Lecturers see `ai-4-1` as "Your level".** It is about leading a school. Recommended: for university teachers,
   list `ai-u1` to `ai-u4` as their level and label `ai-4-1` "for school leaders". Shared with the other tracks.
10. **Two dated claims in `ai-1-1-4`'s reading.** "By October 2026, one researcher's database listed over 2,000
    court decisions" and "in a 2026 trial, it didn't change how much medical students relied on AI's advice" could
    not be checked for this plan. Recommended: check each against its source, or cut it.

## Reference

Kept from the page of October 2026 and from `ai-architecture.md`, where still true.

### How the courses talk about AI

- **Honest, with no hype and no fear.** AI predicts from patterns in examples. It does not think, feel or look
  facts up unless a tool searches for it. A sure answer can be wrong, and the lesson always says what to do next.
- **No device? Still teachable.** Every teacher lesson has a class activity that needs no devices: "Learns or
  follows a rule?", "Be the machine", "Whose examples?", "Spot the made-up fact" (level 1); "Human chatbot",
  "Prompt makeover", "Find the mistakes", "Traffic light" (level 2); "Human neuron", "Warmer, colder", "Memoriser
  and learner", "Who is ‘it’?" (level 3); "Test the tester", "Class AI charter", "Show your thinking", "Decision
  tree from our data" (level 4).
- **No photographs of people** in any vision lesson: detection uses drawn 8×8 patterns, music is eight made-up
  notes, and a "large" model is a diagram plus a tiny network the phone can step through. Each lesson says what the
  phone left out and what the small run still proves.
- **Who tells the hooks.** `ai-1-1`: Ms Amina, Mr Joseph, Ms Salma, Mr Okafor, one lesson each. `ai-2-1`: Ms Amina,
  with Ms Salma checking. `ai-3-1`: Mr Joseph. `ai-4-1`: Dr Farah, with Mr Okafor. `ai-u1`: Dr Joseph, and Prof
  Farah in lesson 4; `ai-u2` to `ai-u4`: Dr Joseph. In students' videos the cast are the students' teachers and the
  hook is about a pupil or told to "you": Mr Okafor in `ai-s1`, Ms Salma in `ai-s2`, Mr Joseph in `ai-s3`. At
  university they are lecturers: Dr Farah in `ai-s4-0` and `ai-s4`, Dr Joseph in the deep dives.
- **The pack course.** `ai-1-1` came from a course pack through `scripts/import-packs.mjs`. Edit the unit file and
  its storyboards (`AI-1-1-1` to `AI-1-1-4`); `--force` would undo every hand edit. Its people and prices are
  Nigerian.

### Facts and numbers the courses use

Keep them the same in every course and as the Labs apps show them.

- **One neuron** (`neuron`): the reading's starting weights are clouds 1, forecast 3, season 2, with a bias of −1;
  one of the four days comes out wrong until a weight or the bias is changed. Clouds and forecast are sliders from
  0 to 1.
- **A network** (`perceptron`, `playground`): one neuron settles on "Far apart" and never settles on "Corners
  (XOR)"; the circle cannot be learned with no hidden layer and is learned with one layer of four neurons; on the
  spiral with 3 layers of 8, a learning rate of 1 never settles and 0.3 does.
- **One step downhill** (`gradient`, `ai-d1-2`, `ai-u1-1`): for the loss θ² the slope is 2θ; from θ = 3 at a rate
  of 0.1 the next θ is 2.4; a rate of 1.1 leaves the valley.
- **Upper secondary's club** (`ai-s3`): ninety healthy leaves and ten sick give 90 right in 100 for a model that
  calls every leaf healthy; a model with 20 of 20 on its training photos gets 11 of 20 on new ones; a model with 90
  per cent overall gets about seven in ten on girls' voices.
- **Language** (`minilm`, `tokens`): the tiny model has learned 16 school sentences; the same message costs more
  tokens in Arabic and in many African languages.
- **Detectors of AI writing:** in a 2023 Stanford study, detectors labelled more than half of the essays by
  non-native English writers as AI-written (`ai-4-1-3`, `ai-s2-4`, `ai-s4-4`).
- **Made-up sources:** in 2023 a US judge fined two lawyers $5,000 for citing six court cases a chatbot invented
  (`ai-1-1-4`).
- **Darsi Tiny** in the `teach` lab is one 2.8 MB download; its numbers are in `docs/curriculum/agents.md`.

### Labs across the track

Teachers meet `nextword`, `classifier`, `bias` and `factcheck` at level 1; `tokens`, `prompt`, `rag` and `minilm`
at level 2; `neuron`, `activation`, `perceptron`, `playground`, `overfit` and `llm` at level 3; `bias`, `decision`,
`threshold` and `tree` at level 4. A lab met again comes with a new job: `bias` spots a data gap at level 1 and
runs an audit at level 4. Students meet `nextword`, `classifier`, `pixels` and `threshold` (primary); `minilm`,
`prompt`, `factcheck` and `rl` (lower secondary); `shapes`, `knn`, `overfit` and `bias` (upper secondary);
`classifier`, `minilm`, `prompt` and `factcheck` (`ai-s4-0`); `overfit`, `bias`, `kmeans` and `watermark`
(`ai-s4`); then the deep dives' own labs: `playground`, `gradient`, `rnn`, `attention`, `melody`, `convolution`,
`detect`, `vae`, `denoise`, `rl`, `teach`, `suite`, `split`. Lecturers use the same labs as the deep dives, and
`gradient`, `backprop`, `embeddings`, `attention` and `overfit` in `ai-u1`.

### The architecture courses

`ai-d1` to `ai-d3` and `ai-u2` to `ai-u4` follow the order of MIT's Introduction to Deep Learning (6.S191, 2026):
lectures 1 and 2 (networks, sequences), 3 and 4 (vision, generation), 5 to 9 (reward, language models, safety and
evaluation, AI for science, training at scale). They teach the same ideas on examples small enough for a phone and
copy none of MIT's slides, narration, code or data. The science is the same for students and lecturers; the
lecturers' lessons add the wrong idea to expect, a seminar for one phone between two, and how to assess the idea
when students can ask a chatbot. Not written, on purpose: a PyTorch or Colab course, any face or voice dataset,
lessons built on a product's name. The full reasoning is in `docs/curriculum/ai-architecture.md`.

### Competencies

Codes from `apps/web/src/content/competencies.ts`. UNESCO's three levels follow Darsi's four: teachers Acquire
(levels 1 and 2), Deepen (3), Create (4, and the lecturers' courses); students Understand (primary and lower
secondary, with Apply where they practise), Apply (upper secondary), Create (university). DigComp codes mark
information literacy (`DC.1.2`) and personal data (`DC.4.2`). Teachers' lessons carry `T.*` codes only: `ai-1-1`
(all four lessons and the check), `ai-2-1-1` and its check, and `ai-3-1-1` and its check carry `S.*` codes today,
which mixes the two frameworks in an administrator's report.

### Placement

The AI questions are in `apps/web/public/content/placement.json` only (there is no `content/placement/ai.json`):
three per audience and level (`ai-t1-1` … `ai-t4-3`, `ai-s1-1` … `ai-s4-3`) and three for lecturers (`ai-u-1` …
`ai-u-3`). The teachers' and lecturers' questions match their courses. For university students the three questions
must be ones a learner can answer after `ai-s4-0` and `ai-s4`, so that passing them means "start at the deep
dives": `ai-s4-1` (a loan model that learned from decisions that favoured men) fits `ai-s4-2`; `ai-s4-2` (what
matters before farmers use a crop app) fits `ai-s4-1`; `ai-s4-3` ("only the computer is responsible", false) is too
easy and is replaced by one on tokens or on checking by the stakes.
