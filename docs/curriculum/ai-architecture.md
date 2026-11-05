# AI architecture for university

Three advanced courses on how modern AI is built, for university students and for the lecturers who teach them. They
follow the 2026 run of MIT's *Introduction to Deep Learning* (6.S191), taught by Alexander Amini and Ava Amini and
published at [introtodeeplearning.com](https://introtodeeplearning.com/2026/index.html). The six units and the new labs are written
and can be opened on the local app. They are not published. Every lesson video is voiced locally, in English and Egyptian Arabic, as a light lesson and a 240p file.

6.S191 is a nine-lecture bootcamp plus three software labs, rewritten every year. Darsi cannot ship that course. The
lectures assume a GPU notebook, PyTorch and, in one lab, photographs of faces. Darsi runs on a phone, offline, with no
account and no download of a dataset. These courses teach the same ideas, in the same order, on examples small enough
to compute on the phone. They do not copy MIT's slides, narration, code or lab data, and they do not embed the YouTube
videos. A lecturer who wants the original hour can assign the link; the Darsi lesson stands on its own.

## Where they sit

They come after the level-3 courses (`ai-3-1` for teachers, `ai-s3` for students): a neuron, a small network, training
and testing, and a first look inside a language model. They do not replace level 4. `ai-4-1` and `ai-s4` stay the
school-leadership and society courses. `ai-u1` stays the lecturers' course on teaching the foundations (risk, backprop,
attention, evaluation). These three go on to the architectures `ai-u1` only names.

Every course is level 4. University students see the student courses. University lecturers see the teacher courses
(`teach: "university"`), the same way they see `ai-u1`. Each course is four lessons and a unit check, in English and
Modern Standard Arabic, and follows `docs/CONTENT.md` and `docs/CURRICULUM.md`.

| Course | MIT 2026 | Students | Lecturers |
|---|---|---|---|
| 1. Networks and sequences | Lectures 1–2, software lab 1 (music generation) | `ai-d1` | `ai-u2` |
| 2. Vision and generation | Lectures 3–4, software lab 2 (facial detection) | `ai-d2` | `ai-u3` |
| 3. Decisions, language and scale | Lectures 5–9, software lab 3 (fine-tune a language model) | `ai-d3` | `ai-u4` |

A learner takes them in order. Course 2 assumes course 1. Course 3 assumes course 2.

## What a university learner must already know

Derivatives and the chain rule, and multiplying a small matrix by a vector. Python as in `code-s2` or `code-2-1`:
variables, `if`, loops, lists. The courses remind, they do not reteach secondary school.

## Two audiences, one science

The science is the same in both columns. The job is not.

- **Students** (`audience: "students"`). Written to the student. They derive a step, run the lab, and say what the
  picture means. The project is a small study they can finish on a phone. `tryTomorrow` is something to do, not to teach.
- **Lecturers** (`teach: "university"`, no `audience`). Written to the lecturer. Each lesson adds the misconception to
  expect, a seminar exercise for a class with one phone between two, and how to assess the idea when students can ask a
  chatbot. The project is a seminar or a problem set, not a school worksheet.

## What the phone can and cannot do

Labs stay the Darsi kind: a few kilobytes, seeded, finished in a minute, no network.

- Reuse a lab when it already shows the idea. Say so in the lesson, and use it for the new job.
- A new lab is justified only when no current app shows the step. The new ones are listed under each course. They are
  not built yet.
- Do not train on real faces, real voices or anyone's messages. Face detection uses drawn 8×8 patterns. Music is eight
  made-up notes. A "large" model in these courses is a diagram plus a tiny network the phone can step through.
- Do not pretend a phone step is the MIT Colab lab. The lesson says what was left out (a real dataset, a GPU, many
  epochs) and what the small run still proves.

## Course 1 — Networks and sequences

**Students `ai-d1`.** *How a deep network learns, and how a sequence model decides what to remember.*
**Arabic.** كيف تتعلّم الشبكة العميقة، وكيف يقرّر نموذج المتسلسلة ما يتذكّره.

**Lecturers `ai-u2`.** *Teaching deep networks and sequence models.*
**Arabic.** تدريس الشبكات العميقة ونماذج المتسلسلات.

MIT lecture 1 is the introduction: neurons, depth, loss, gradient descent, backpropagation, regularization.
Lecture 2 is deep sequence modeling: recurrence, its failure on long sequences, attention, and the transformer.
Software lab 1 trains a small network in Python and generates music. On the phone, lesson 4 is that lab, shrunk to
eight notes.

### 1. A stack of neurons — كومة من الخلايا العصبية

- Write a neuron as a weighted sum, a bias and an activation, and say why a stack of them can bend a boundary one
  neuron cannot.
- Compute one forward step by hand on a network with two inputs and one hidden layer.
- **Reuse:** `perceptron`, then `playground`. **New:** none.
- **Lecturers:** the misconception that "more layers always means smarter". A one-phone seminar: the class votes on a
  boundary the single neuron misses, then watches the playground learn it.

### 2. Loss, descent and backprop — الخسارة والنزول والانتشار العكسي

- Define a loss as a number that is large when the answer is wrong, and a gradient as the direction that reduces it.
- Walk one backward step: who to blame, and a small change to a weight.
- Show a step that is too large and one that is too small.
- **Reuse:** `gradient`, `backprop`, `overfit` (regularization as "stop before you memorize"). **New:** none.
- **Lecturers:** students who move every weight the same way, and who think the loss going down means the model is
  right. Assessment: a hand-worked backward step, marked on the arithmetic, not on a chatbot's write-up.

### 3. Sequences and the memory that fades — المتسلسلات والذاكرة التي تخبو

- Represent a sequence as one item at a time, with a hidden state that carries what came before.
- Show a recurrent step, and why a signal from many steps ago fades (the vanishing gradient, as a number getting
  smaller, not as a proof).
- **Reuse:** none that shows recurrence. **New lab `rnn`:** four symbols, a hidden state drawn as a bar, one step at
  a time. A long-range cue (the first symbol decides the last) fades unless the learner shortens the gap.
- **Lecturers:** the misconception that an RNN "reads the whole sentence at once".

### 4. Attention and the transformer — الانتباه والمحوّل

- Score every earlier item, turn the scores into weights, and build a new vector from the weighted sum.
- Place that inside a transformer block: attention, then a small feed-forward, with a residual add so the original
  is not thrown away.
- Generate a short melody as next-note prediction, the phone's version of MIT's music lab: eight pitches, a tiny
  next-note table trained for a handful of steps, then a sample.
- **Reuse:** `attention`, `embeddings`. **New lab `melody`:** eight notes, train a few steps, hear or see the next
  note. It must be obvious that the "song" is a toy.
- **Lecturers:** attention is not understanding. The seminar compares a faded RNN hidden state with an attention
  weight the class can point at.

### Check

Ten questions across the four lessons. At least one hand-worked forward or backward step, one "which architecture"
choice (a single neuron, a deep net, an RNN, attention), and one on what the melody lab did not prove.

## Course 2 — Vision and generation

**Students `ai-d2`.** *How a network sees a picture, and how it learns to invent one.*
**Arabic.** كيف ترى الشبكة الصورة، وكيف تتعلّم أن تخترع صورة.

**Lecturers `ai-u3`.** *Teaching vision networks and generative models.*
**Arabic.** تدريس شبكات الرؤية والنماذج التوليدية.

MIT lecture 3 is deep computer vision: images as tensors, convolution, pooling, a CNN.
Lecture 4 is deep generative modeling: autoencoders, variational autoencoders, GANs, and diffusion.
Software lab 2 builds a facial detection system and asks who it fails for. Darsi keeps that question and drops the
photographs. Detection runs on drawn 8×8 patterns, including patterns that are faces in different proportions, so the
lesson can show a detector that is confident and unfair.

### 1. A picture is a grid of numbers — الصورة شبكة أرقام

- Read a grey image as a matrix, and a colour image as three matrices.
- Slide a 3×3 filter across the grid and say what an edge filter, a blur and a sharpen each do.
- **Reuse:** `convolution`. **New:** none.
- **Lecturers:** students who think the filter "knows" an object. It only mixes neighbours.

### 2. Stacking filters, and who a detector misses — تكديس المرشّحات، ومن يفوته الكاشف

- Stack convolution, a nonlinearity and pooling into one block, and say what each part throws away.
- Train, on the phone, a tiny detector of drawn patterns: face-like against not. Test it on patterns it was not
  trained on, including ones with different proportions.
- Say, in numbers, when the detector is more wrong for one group than another. That is the point of MIT's face lab,
  without anyone's photo.
- **Reuse:** `bias` for the gap, not for a new idea. **New lab `detect`:** 8×8 drawn patterns, a few training steps,
  a score for "face-like", and a split by group so the miss is visible.
- **Lecturers:** never set a class exercise on classmates' photos. The seminar uses the drawn set and writes one
  sentence on what a real detector would need before a school could trust it.

### 3. Squeeze and sample — اضغط ثم خذ عيّنة

- An autoencoder squeezes a picture into a short code and rebuilds it. The code is a lossy summary, not the picture.
- A variational autoencoder keeps a cloud, not one point, so you can sample a new code and decode a new picture.
- Move one coordinate of a 2-number code and watch the decoded 8×8 change smoothly.
- **New lab `vae`:** encode an 8×8 to two numbers, nudge them, decode. No claim that the pictures are photographs.
- **Lecturers:** "the latent space is a map of meaning" is too strong. It is a map of whatever the loss rewarded.

### 4. Adversaries and noise — خصمان وضجيج

- A GAN is two networks: one invents, one judges. Training is a contest, and it can collapse.
- Diffusion adds noise until the picture is gone, then learns one step that removes a little noise. Repeat the step
  and a picture comes back. Show one step, not a thousand.
- Compare the three ideas in one table: autoencoder (rebuild), GAN (fool a judge), diffusion (denoise).
- **New lab `denoise`:** an 8×8, a noise slider, one learned denoise step on a toy. **Reuse:** none of the current
  labs shows this.
- **Lecturers:** a generated picture is not evidence. Assessment asks which of the three made it, and what failure
  each has.

### Check

Ten questions. Include one filter computation, one "which group did the detector miss", and one that matches a
picture's story to autoencoder, GAN or diffusion.

## Course 3 — Decisions, language and scale

**Students `ai-d3`.** *How a network learns from reward, how a language model is trained and changed, and what it
takes to train one for real.*
**Arabic.** كيف تتعلّم الشبكة من المكافأة، وكيف يُدرَّب النموذج اللغوي ويُعدَّل، وما يلزم لتدريبه فعلًا.

**Lecturers `ai-u4`.** *Teaching reinforcement learning, language models, and training at scale.*
**Arabic.** تدريس التعلّم المعزّز والنماذج اللغوية والتدريب على نطاق واسع.

This course takes the last five MIT lectures, because they are one story: use the architectures, then look at what
happens when they leave the lab.

- Lecture 5, deep reinforcement learning: an agent, a reward, value, policy.
- Lecture 6, new frontiers, and software lab 3, fine-tuning a language model.
- Lecture 7, the three laws of AI: safety, evaluation, and keeping a person able to see what the system did.
- Lecture 8, AI for science: a model as a stand-in for a slow experiment.
- Lecture 9, massively parallel training: memory, splitting the work, why one machine is not enough.

Lessons 3 and 4 each carry two lectures. They teach the decision a university student must be able to make, not the
whole guest lecture.

### 1. Learn from reward — التعلّم من المكافأة

- An agent takes an action, the world changes, a reward arrives later. The credit for a win has to travel back
  along the path.
- Distinguish a value (how good it is to be here) from a policy (what to do here).
- Show one update on a grid small enough to do by hand: the charger, a puddle, a few steps.
- **Reuse:** `rl`. **New:** none, unless the current lab cannot show a value and a policy as two different pictures.
  If it cannot, extend it. Do not add a second app for the same grid.
- **Lecturers:** reward is not ethics. A seminar writes a reward that looks right and produces a bad policy.

### 2. A language model, and changing one — نموذج لغوي، وتغييره

- A language model is the transformer from course 1, trained to guess the next token, at a size the lesson only
  describes.
- Fine-tuning changes a model that already exists. The honest small version: freeze every layer but the last, and
  teach that layer a new job with a handful of examples. Say what that cannot do.
- Name two limits from lecture 6 without chasing the year's product names: the model does not know what it does not
  know, and a new skill can crowd an old one.
- **Reuse:** `llm`, `tokens`, `teach` (the top-layer update). **New:** none.
- **Lecturers:** a problem set that asks students to say which weights moved, and which answers the old model would
  now get wrong.

### 3. Laws, tests and a person who can look — قوانين واختبارات وشخص يستطيع أن يرى

- State the course's three duties in plain language, tied to lecture 7 and not to a slogan: do not deploy what you
  cannot test, do not hide the system's actions, do not leave a harmful action with no person responsible.
- Design one evaluation before a model is trusted: a set of cases, a number, and a case it must refuse.
- Connect this to the detector in course 2: a high score on the training patterns is not a law.
- **Reuse:** `evals` if it can hold a small test set and a refusal. If it is only an agent scoreboard, **new lab
  `suite`:** ten cases, a pass line, one case that must be refused, the score updating as the learner marks them.
- **Lecturers:** how to mark a student's claim that "the model passed". The mark is on the test design.

### 4. Science stand-ins, and training that does not fit in one machine — بدائل علمية، وتدريب لا يسعه حاسوب واحد

- A scientific model can be a fast stand-in for a slow measurement: weather, a material, a molecule. It is useful
  where it was tested, and it is not the experiment.
- Training a large network is limited by memory and by time. Data parallelism splits examples across machines.
  Model parallelism splits the network when it does not fit in one machine's memory. One phone is one device, so
  this lesson is a diagram the learner can step, not a second computer.
- Give the one number that matters: a forward and backward step stores activations, so memory grows with the batch
  and the depth, not only with the weights.
- **New lab `split`:** two drawn machines, a batch of four, a network too wide for one of them. The learner chooses
  data parallel or model parallel and sees which one fits. No real cluster.
- **Lecturers:** students who say "we will just use a bigger GPU". The seminar computes, on paper, the memory of
  one layer and finds it does not fit.

### Check

Ten questions. Include one reward-versus-policy item, one "what did fine-tuning change", one evaluation that is
missing a refusal, and one choice between data parallel and model parallel with a reason.

## New labs

Six, all still to design. Each one is a phone app in `apps/web/src/labs/apps/<id>/`, with the usual `meta.ts`,
`index.tsx` and `model.ts`, and tests. None of them calls a server.

| Id | Course | What the learner sees | Reuse instead if |
|---|---|---|---|
| `rnn` | 1, lesson 3 | Four symbols, a hidden-state bar, a cue that fades | — |
| `melody` | 1, lesson 4 | Eight notes, a few training steps, the next note | `nextword` can be extended to notes without a new app |
| `detect` | 2, lesson 2 | 8×8 drawn patterns, a face-like score, a miss by group | `convolution` plus `bias` cannot show the score |
| `vae` | 2, lesson 3 | An 8×8 squeezed to two numbers, nudged, decoded | — |
| `denoise` | 2, lesson 4 | One noise slider and one denoise step on an 8×8 | — |
| `suite` | 3, lesson 3 | Ten cases, a pass line, a required refusal | `evals` already does this |
| `split` | 3, lesson 4 | Two machines, pick data parallel or model parallel | — |

Build a new lab only after checking the "reuse instead" column against the app. `suite` and `melody` are the two
most likely to collapse into an existing app.

## What we will not write

- A PyTorch or Colab track. The code steps, where a course needs one, are the same MicroPython the other university
  courses use, and only for a dozen lines.
- A face dataset, a voice dataset, or scraped text.
- Product names as the lesson. A named system can appear once, as an example, and the idea has to survive without it.
- The MIT videos inside Darsi. Bandwidth, rights, and the lesson has to work with the screen off the network.

## Order of work, when this plan is accepted

1. Confirm the six ids and that university Home will list `ai-d1`…`ai-d3` for students and `ai-u2`…`ai-u4` for lecturers.
2. Design the new labs that survive the reuse check, and add their tests.
3. Write the six unit files from this page, English and Modern Standard Arabic, then the storyboards.
4. Do not narrate or render until a course's text has been read against this page.
