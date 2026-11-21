# IoT: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of October 2026 in
this file; the facts, labs and placement notes at the end are kept from it and brought up to date. What all tracks
share (the Python ladder, the university path, the home of each shared idea) is in `docs/CURRICULUM.md`; how to
write a course is in the `darsi-course` skill.

## The track in one look

A teacher who finishes the track can explain how a device senses, decides and acts, run a class project whose
readings people can trust, and lead a sensor project a school depends on. A school student ends by writing the
rules and the first programs that run a device, and by seeing how devices connect. A university student ends by
designing, testing and defending a whole connected system in simulation, and then putting it on a board. The track
never assumes electronics or networking: every starting course teaches what a sensor is, and what a reading is,
itself. Only the university courses expect something from another track: Python, from their second course on.
IoT is the home of "sensors and readings" for all nine tracks.

- **Track line (en):** Starts from zero: how a device senses, decides and acts. No kit needed. Teachers only read code; university courses need Python from the second course on.
- **Track line (ar):** يبدأ من الصفر: كيف يستشعر الجهاز ما حوله ويقرّر وينفّذ. لا يحتاج إلى أدوات. يقرأ المعلّمون الكود فقط، أما مقررات الجامعة فتحتاج إلى بايثون ابتداءً من المقرر الثاني.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `iot-1-2` Sensors | tell a sensor from the parts that show and act, write a reading someone else can check, and turn a week of readings into a decision | No experience needed. | 4 standard passes |
| 2 Elementary | `iot-2-1` Circuits and microcontrollers | explain what is inside a device: a closed circuit, logic, bits, and a small computer whose program you can trace | `iot-1-2` | 3 standard passes, 1 rewrite |
| 3 Intermediate | `iot-3-1` Data and automation | log readings you can trust, build and test a rule that switches a device, make a battery last, and get the data home | `iot-2-1` | 4 standard passes |
| 4 Advanced | `iot-4-1` Smart school projects | design, pilot, maintain and secure a sensor project with pupils, and write the rules for its data | `iot-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `iot-s1` Things that sense | spot a sensor, say what a machine senses, decides and does, measure well, and keep a connected thing safe | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `iot-s2` Build a circuit | light an LED safely, write a device's rule with switches, count in binary, and read the program in a night light | No experience needed. | 3 standard passes, 1 rewrite |
| Upper secondary (15–18), start | `iot-s3` Make it automatic | write, test and power a device that runs itself, with your first short programs for a virtual board | No experience needed. | 1 rewrite, 3 standard passes |
| Upper secondary, next | `iot-s4` A connected world (moves here from university) | choose how devices talk, keep them safe, and design a connected project for a real problem | `iot-s3` | 4 standard passes |
| University, start | `iot-m1` The whole system: sense, decide, act (new) | trace, describe and design a connected system before anything is built | No experience needed. | 4 new lessons |
| University | `iot-m2` Readings you can trust (new) | keep units and times with every value, and reject bad readings with evidence | `iot-m1`, `code-m6` | 4 new lessons |
| University | `iot-m3` Control that fails safe (new) | build a controller that does not chatter and knows what to do when it knows nothing | `iot-m2`, `code-m6` | 4 new lessons |
| University | `iot-m4` Messages: topics, publish and subscribe (new) | design topics and payloads, and predict who receives a message | `iot-m3`, `code-m6` | 4 new lessons |
| University | `iot-m5` Storing and showing telemetry (new) | store readings so bad rows are refused, and summarise and chart them honestly | `iot-m4`, `code-m6` | 4 new lessons |
| University | `iot-m6` When the network fails (new) | keep measuring through an outage, and count every reading exactly once | `iot-m5`, `code-m6` | 4 new lessons |
| University | `iot-m7` Identity, secrets and privacy (new) | prove who a client is, limit what it may do, and collect less about people | `iot-m6`, `code-m6` | 4 new lessons |
| University | `iot-m8` From parts to a system you can trust (new) | integrate the parts, test how the system fails, and hand it to an operator | `iot-m7`, `code-m7` | 4 new lessons |
| University, hardware | `iot-m9` From the simulator to a real node (new) | run the loop on a board, sample a signal, budget its power, and choose its radio link | `iot-m6`, `code-m6` | 4 new lessons |
| University, capstone | `iot-capstone` A classroom environmental monitor | build, test and defend a whole monitor in simulation, with an optional route on a real or simulated board | `iot-m8`, `code-m7` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `iot-u1` Teaching embedded and IoT systems at university | teach sampling, power and timing, and protocols so that students predict before they measure, and run a capstone whose skills were all taught first | `iot-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **University students get a path of eight courses, from zero.** On 2026-11-15 the user supplied the Darsi
   University draft "IoT: Connected Sensing Systems by Simulation": eight modules and a capstone, in English and
   Arabic. One module becomes one course, `iot-m1` to `iot-m8`: the module's three lessons, then a fourth built on
   its practical task. `iot-m1` needs nothing: its code is read, traced and completed, never written from a blank
   editor, so a student can begin IoT beside Programming. From `iot-m2` on, each course names the Programming
   course it needs. All 32 videos are new: the draft's narration is a short summary per lesson, not a Darsi video.
   Each module's quiz feeds the unit check, and its learner guide ships in the kit as a study guide.
2. **A new course teaches what the simulation leaves out.** The modules are simulation only: there is no board and
   no radio, and sampling and power are met only briefly. Those are what `iot-u1` prepares lecturers to teach. So
   the path gains "From the simulator to a real node", with the working id `iot-m9`: the loop on a virtual board,
   sampling and the ADC, the power budget, and choosing a link. It comes after `iot-m6` and leads to the
   capstone's hardware route.
3. **`iot-s4` keeps its lessons and its id, and moves to upper secondary.** Today's `iot-s4` ("A connected world")
   is school-level: radios, mesh networks, default passwords and a community project suit 15 to 18, not a
   university. An id keeps its content, so the course is not rewritten: it becomes the second upper-secondary
   course, after `iot-s3`. Learners who finished it keep their marks and their certificate for the lessons they
   did, and no media moves. Without it, no school student would ever learn how devices connect.
4. **One capstone, at the end of the university path.** `iot-capstone` sits at level 3 (upper secondary) today, and
   needs GitHub, MQTT and about 15 hours. It moves to university. Its core becomes the draft's capstone, a
   simulated classroom environmental monitor; today's weather station (an ESP32 or the Wokwi simulator, a real
   broker) becomes its optional hardware route.
5. **Code for a board enters the track.** No IoT course has a code step today, and the virtual board is used once,
   in `iot-u1-4`. Now teachers read short board programs from level 2 (order the lines, fill a gap, find the bug).
   Lower-secondary students do the same in `iot-s2-4`. Upper-secondary students write their first short programs
   in `iot-s3`, taught in the course. Nothing is typed at primary, and there is no code at Beginner.
6. **Each school stage can be a first meeting, and is written for its age.** The old plan said students were 12 to
   16. `iot-s1` is for 9 to 12: shorter videos, fewer terms, hooks told to "you". `iot-s2` and `iot-s3` now teach
   "sensor" and "sense, decide, act" themselves, instead of leaning on the stage below.
7. **Labs come after their ideas.** `iot-1-2` used the `adc` lab (bits, samples) and the `decision` lab (weights,
   expected value) before any lesson taught those ideas. The Beginner course now uses `rules`, `sensor`, `quality`
   and `datalog`. `adc` waits for the lessons that teach sampling, and `decision` for `iot-4-1-1`.
8. **Two gaps in the teachers' Advanced course close.** Consent came in lesson 4, after the class had already taken
   readings in lesson 2: it now enters the one-page plan in lesson 1 and the pilot's written test in lesson 2, and
   lesson 4 goes deeper. What a device costs after it is built (batteries, repair, e-waste) was taught nowhere: it
   joins `iot-4-1-3`, `iot-s3-4` and `iot-m9-3`.
9. **Every course says what it expects, and every video gets the standard pass.** No IoT summary has a "Before
   this" line today. Of today's 36 hooks, 5 end on a question; all 36 promises say "Today: …"; ten videos open on a
   definition. Most readings list five key terms: the video introduces four, and the fifth stays in the reading,
   where it is explained.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| A sensor turns one thing in the world into a number; a display shows it; an actuator acts | `iot-1-2-1` | every course |
| A reading: its number, unit, time and place; a fair comparison | `iot-1-2-2` | `iot-1-2-3`, `iot-1-2-4`, `iot-3-1-1`, `iot-4-1-2` |
| Record, chart, pattern, decide by a rule agreed in advance | `iot-1-2-4` | `iot-3-1-1`, `iot-3-1-2`, `iot-4-1-1` |
| A closed loop; voltage, current, a resistor | `iot-2-1-1` | `iot-2-1-4`, `iot-3-1-3` (mA and mAh) |
| AND, OR and NOT; a truth table | `iot-2-1-2` | `iot-3-1-2` (two conditions in one rule) |
| Bits and bytes; how many values a reading can show | `iot-2-1-3` | `iot-2-1-4`, `iot-3-1-4`, `iot-u1-1` |
| The loop: read, decide, act, wait; a pin; a threshold | `iot-2-1-4` | `iot-3-1-2`, `iot-3-1-3`, `iot-4-1-2` |
| Reading a short program for the virtual board | `iot-2-1-4` | `iot-3-1-2`, `iot-3-1-3`, `iot-u1-4` |
| A data log; an offset; a glitch; the median | `iot-3-1-1` | `iot-4-1-2`, `iot-4-1-3` |
| An IF/THEN rule; two thresholds; fail safe | `iot-3-1-2` | `iot-4-1-2`, `iot-4-1-3` |
| Battery life: capacity divided by average current; sleep | `iot-3-1-3` | `iot-3-1-4`, `iot-4-1-1`, `iot-u1-2` |
| Radios by distance, power and data; gateway; mesh; relay | `iot-3-1-4` | `iot-4-1-1`, `iot-u1-3` |
| A question you can measure; a success measure; a baseline | `iot-4-1-1` | `iot-4-1-2`, `iot-4-1-4` |
| Ask first, and collect only what the question needs | `iot-4-1-1` (one line of the plan) | `iot-4-1-2`; in full in `iot-4-1-4` |
| False alarms and misses | `iot-4-1-2` | `iot-4-1-3` |
| Heartbeat; default passwords; the end of a device's life | `iot-4-1-3` | `iot-4-1-4` |

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A sensor notices one thing and gives a number | `iot-s1-1` | `iot-s2-4` (named in `iot-s2-1`) | `iot-s3-1` | `iot-m1-1`, `iot-m1-2` |
| Sense, decide, act | `iot-s1-1` | `iot-s2-4` | `iot-s3-1` | `iot-m1-1` |
| A reading has a unit; a reading that can't be right | `iot-s1-3` | | `iot-s3-3` | `iot-m2-1`, `iot-m2-4` |
| A closed circuit; a resistor | | `iot-s2-1` | | |
| AND, OR and NOT | | `iot-s2-2` | `iot-s3-1` (two conditions) | |
| Bits; how many values | | `iot-s2-3` | | `iot-m1-2`, `iot-m9-2` |
| The loop on a small computer; a threshold | | `iot-s2-4` | `iot-s3-1`, `iot-s3-2` | `iot-m3-1`, `iot-m9-1` |
| Board code, read | | `iot-s2-4` | `iot-s3-1` | `iot-m9-1` |
| Board code, written | | | `iot-s3-2` (taught here) | `iot-m9-1` |
| Two thresholds; a safe state | | | `iot-s3-2`, `iot-s3-3` | `iot-m1-4`, `iot-m3-1`, `iot-m3-2` |
| Sampling: how often to read | | | `iot-s3-3` | `iot-m2-2`, `iot-m9-2` |
| Battery life; what a device costs after it is built | | | `iot-s3-4` | `iot-m6-4`, `iot-m9-3` |
| Connected things; factory passwords | `iot-s1-4` | | `iot-s4`, lessons 1 and 3 | `iot-m7-2` |
| Radios, gateway, mesh | | | `iot-s4`, lessons 1 and 2 | `iot-m9-4` |
| Publish and subscribe; topics; payloads | | | | `iot-m4` |
| Storing, summarising and charting readings | | | | `iot-m5` |
| Outages, duplicates and gaps | | | | `iot-m6` |
| Permissions; what sensor data shows about people | | | | `iot-m1-3`, `iot-m7-3`, `iot-m7-4` |
| Acceptance tests | | | | `iot-m8-2` |
| Python the course expects | none | none | none (taught here) | none for `iot-m1`; `code-m6` from `iot-m2`; `code-m7` for `iot-m8` |

## The courses

### `iot-1-2` Sensors
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** tell a sensor from a display and an actuator; write a reading someone else can check; run a class rain gauge; turn a week of readings into a decision.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** meet a sensor, read its numbers properly, build one with a class, then use a week of readings to decide.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | What is a sensor? | tell a sensor from a display and an actuator in a device around you, and say what each does | Every evening, the solar lamp outside my classroom switches on by itself. A pupil asked me: sir, who switched it on? Nobody had touched it. So what noticed that it was getting dark? | sensor; signal; display; actuator | rules | S |
| 2 | Reading numbers: units and scales | write a reading that someone else can check: the number, its unit, the time and the place, read at eye level | Same thermometer, same minute. Huda writes thirty, and Karim writes eighty-six. Each is sure the other is wrong. Could they both be right? | unit; scale; eye level; fair comparison | sensor | S |
| 3 | Build a rain gauge | make a bottle rain gauge with a class, and explain why its place, its zero line and its daily reading time matter | Musa says it rained a lot last night. Zainab says it rained only a little. Both families farm, so the answer matters. How can the class find out who is right? | rain gauge; millimetre (mm); funnel; zero line | quality | S |
| 4 | Data in class: record, chart, decide | turn a week of readings into a table and a bar chart, name one pattern, and use it to decide | My pupils read our rain gauge every morning for two weeks. Now the garden club asks me: should we water today? All I have is a page of numbers. How do I turn it into an answer? | data; table; bar chart; pattern | datalog | S |

- **Unit check:** unchanged.
- **Changes:** this is one of the three pack courses. Its people and places are Nigerian-flavoured (Musa, Zainab, Huda, Karim; naira and CFA francs in lesson 2), and it is edited in the unit file and the storyboards, never with `import-packs --force`. The stories are good and stay; only their endings change. The four videos have no lab scene: the standard pass adds one, with the labs above (`sensor`, `adc`, `datalog`, `decision` today). Lesson 1 uses only the lights rule of `rules`, which is the hook's lamp. `quality` speaks of a "batch" of readings: if that gets in the way when the lesson is written, lesson 3 stays with `datalog`. Hooks are told by Mr Joseph, Ms Salma, Ms Amina and Mr Okafor, as today. The summary gains "No experience needed." The id is a leftover from the first curriculum and does not change.

### `iot-2-1` Circuits and microcontrollers
- **For:** teachers, level 2 Elementary
- **Status:** revise
- **After it, you can:** explain why a circuit needs a closed loop and an LED a resistor; predict what AND, OR and NOT give; count in bits; trace the program that makes a chip sense, decide and act.
- **Before this:** `iot-1-2` “Sensors” (IoT, level 1).
- **Python:** shown and explained (lesson 4)
- **The path:** the loop that carries current, switches that decide, numbers as bits, then the chip that puts the three together.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Current, LEDs and resistors | explain why current needs a closed loop, and predict whether an LED will stay dark, light or burn out with a given resistor | A pupil brought me a torch that would not light. It had new batteries and a good bulb. Then I saw one wire hanging loose, a hair from its place. Why does such a tiny gap stop everything? | circuit; voltage; current; resistor | circuit | S |
| 2 | Logic: switches that decide | predict the output of AND, OR and NOT, and write a classroom rule as a truth table | Our classroom fan runs all afternoon, even when the room is empty. I want it on only when it is hot and someone is in the room. A switch cannot think. So how can two switches follow my rule? | logic gate; AND, OR and NOT; truth table | logic | S |
| 3 | Bits and bytes | count in binary up to 255, and predict how many values a reading with a given number of bits can show | My pupils sent a text message in Arabic. It went as three messages, at three times the price. A text of the same length in English went as one. What was the phone counting? | bit; byte; binary; resolution | binary | S |
| 4 | Microcontrollers: sense, decide, act | trace a night-light program line by line, and change the threshold that decides when it is dark | Our corridor is dark by five, and someone always forgets the light. So my pupils built one that switches itself on. Inside is a chip smaller than a bank card. How does a chip know that it is dark? | microcontroller; pin; loop; threshold | board | R |

- **Unit check:** gains two questions on the night-light program; any question that leans on the `adc` lab goes.
- **Changes:** lesson 4 is rewritten around the virtual board. Its lab changes from `adc` to `board`, and its worked case uses the board's own numbers (a reading out of 65,535; the LED on below 20,000) in place of 800 and 300. The reading explains the program line by line; then learners put the lines in order and fill in the threshold. Nobody types a program. Lesson 1 is 466 words and loses 20; "short circuit" and, in lesson 4, "analog input" stay in the readings as the fifth term. Hooks are told by Mr Joseph, Ms Amina, Ms Salma and Mr Okafor.

### `iot-3-1` Data and automation
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** plan a log and judge which readings to trust; build and test a rule that switches a device; compare ways to make a battery last; choose how the data gets home.
- **Before this:** `iot-2-1` “Circuits and microcontrollers” (IoT, level 2).
- **Python:** shown and explained (lessons 2 and 3)
- **The path:** trust the readings, act on them, keep the device powered, then get its data home.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Logging data you can trust | plan a data log for a school question, test the sensor against a thermometer you trust, and judge which readings to leave out | At seven one morning, our new classroom sensor said eighty-five degrees. The head teacher nearly sent everyone home. The room felt cool. So how do you decide which numbers to believe? | data log; offset; glitch; median | datalog | S |
| 2 | IF/THEN: rules that act | build an IF/THEN rule with two thresholds, test it against a day of readings, and say what it does when its sensor fails | After lunch, my classroom turns into an oven. We have a fan, but nobody remembers it until the pupils are half asleep. What would the room need, to switch it on by itself at the right moment? | IF/THEN rule; two thresholds (hysteresis); fail safe | rules | S |
| 3 | Power: batteries and the sun | estimate how long a sensor's batteries will last, and compare the changes that would make them last a term | We left a soil sensor in the school garden for the holiday. It sent a reading every minute, on two new AA batteries. It died in under three weeks, and the holiday lasted eight. What drained them so fast? | capacity (mAh); average current; sleep mode; cloudy-day reserve | battery | S |
| 4 | Networks: getting the data home | choose a network for a school sensor by distance, power and data, and place a relay where a sensor is cut off | Our water tank sensor works perfectly. But the tank is up a hill, four hundred metres from the office. Our Wi-Fi stops at the staffroom door. So how do its readings get home? | LoRa; gateway; mesh network; relay | mesh | S |

- **Unit check:** one question reads the fan program; the rest unchanged.
- **Changes:** content stays. Lesson 2 gains two guided steps on the virtual board: fill in the second threshold of the fan rule, and find the bug in a pump rule that keeps pumping when its sensor reads 0. Lesson 3 gains one question on a program that sleeps between readings. Each reading explains its lines first. The median gets a two-sentence reminder in lesson 1 (its home is `data-1-1-3`), with IoT's own case: one glitch moves the average and not the median. Lesson 3's reading adds a line on rechargeable cells and on what a dead battery costs. "Reference", "range" and "solar panel" are plain words in the videos. Hooks are told by Ms Salma, Ms Amina, Mr Okafor and Mr Joseph.

### `iot-4-1` Smart school projects
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design a sensor project from a school problem; pilot and place it; plan its upkeep, its security and its end; write the rules for its data.
- **Before this:** `iot-3-1` “Data and automation” (IoT, level 3).
- **Python:** none
- **The path:** start from the problem, test small, keep it alive and safe, then answer for its data.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Start from a problem | design a project from a school problem: a question you can measure, a success measure, and a one-page plan agreed with the people it affects | A school near us was given a box of smart sensors. A year later, the box is still in a cupboard. Nobody there is lazy, and the sensors work. So what was missing on the day it arrived? | measurable question; success measure; baseline; decision matrix | decision | S |
| 2 | Pilot, place and test | design a pilot with a written test, place a sensor where it measures what you mean, and set an alert by weighing false alarms against misses | We built ten air sensors before we had tested one. All ten went on windowsills, beside open windows. They reported fresh air while the pupils inside yawned. What should we have done before building the other nine? | pilot; written test; false alarm; miss | threshold | S |
| 3 | Keep it running and secure | write the upkeep and security plan for a project: how a silent failure shows, who holds the passwords, and what happens to its parts at the end | All holiday, our garden sensor said the soil was fine. Every day it showed the same number: forty percent. We came back to dead seedlings. How can a screen say fine while the plants die? | heartbeat; silent failure; recalibration; default password | malware | S |
| 4 | Data ethics: fair, safe and honest | evaluate what a project's data could show about people, and write its data rules: what, why, who agreed, who sees it, when it is deleted | Our air sensors showed which rooms were empty, and when. One room was empty most afternoons. The head teacher asked me whose room it was. The sensors only measure air, so should I tell him? | data minimisation; consent; purpose; retention | footprint | S |

- **Unit check:** unchanged, plus one question on consent before a pilot.
- **Changes:** the lessons keep their order. Lesson 1's one-page plan gains a line: what we will collect, who has agreed, who will see it. Lesson 2's written test starts with "the people in the room were told, and agreed". Lesson 4 then spends its time on what only it adds: what readings show about people, how long data is kept, honest reporting. It opens with a two-sentence reminder of "share the task, not the child" (its home is `cyber-3-1-1`). Lesson 3 gains the end of a device's life: repair before replacing, boards reused, batteries taken to a collection point. Its reminder on passwords names `cyber-1-1`. Hooks are told by Ms Salma, Mr Okafor, Mr Joseph and Ms Amina.

### `iot-u1` Teaching embedded and IoT systems at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach sampling, the power budget and protocols so that students predict before they measure; sequence labs so every capstone skill is taught first; assess team hardware work fairly.
- **Before this:** `iot-3-1` “Data and automation” (IoT, level 3), or you already teach the subject.
- **Python:** shown and explained (the virtual board, lesson 4)
- **The path:** signals into numbers, energy and deadlines, how devices talk, then the capstone that joins them.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Sampling, Nyquist and the ADC | design a lab in which students predict an alias before they measure it, and size an ADC's step for a sensor | My students built a pulse monitor. On a healthy volunteer, it showed twelve beats a minute. The circuit was fine, and so was the code. So where did the other sixty beats go? | Nyquist rate; aliasing; quantisation step | adc | S |
| 2 | Real-time and the power budget | set a power-budget exercise that students must defend with measurements, and teach when a set of tasks meets its deadlines | A student team promised a field sensor that runs for a year. Two AA cells, they said. It died after nine days, with every part working as designed. What had they left out of the sum? | duty cycle; hard real-time; utilisation | battery | S |
| 3 | IoT protocols: MQTT, CoAP and LoRa | teach publish and subscribe, and have students justify a link and a protocol for a brief by range, energy and data | A cooperative asked us to monitor soil moisture across forty hectares. There is no Wi-Fi, no mains power, and the nearest mobile mast is eight kilometres away. Which network would you choose? | broker; QoS; LoRaWAN | mesh | S |
| 4 | Designing an IoT capstone | sequence labs so that each skill the capstone needs is taught before it, and assess team hardware work with a rubric | Last year our department bought forty development kits. We set the capstone in week one. By week six, half the teams were still debugging a blinking light. What had we skipped? | scaffolding; peer assessment; analytic rubric | board | S |

- **Unit check:** unchanged.
- **Changes:** the stories are strong. Two explained themselves and now end on the question; lesson 4's first sentence was too long for the speech bubble. Each promise lists three topics: it becomes one thing the lecturer can do. All four videos open on a definition: a case comes first. Lesson 4 points to the students' path (`iot-m1` to `iot-m8`, then `iot-m9` and the capstone) as a worked example of scaffolding. Hooks are told by Dr Okafor (1 to 3) and Prof Farah (4), as today.

### `iot-s1` Things that sense
- **For:** students, primary (9–12)
- **Status:** revise
- **After it, you can:** spot the sensors around you; say what a machine senses, decides and does; measure and write a reading well; keep a connected thing safe.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** machines that notice, the sensors in a phone, measuring well yourself, then connected things and how to stay safe.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Machines that notice | spot a sensor in a machine around you, and say what it senses, what decides and what acts | You walk up to the shop door with both hands full. The door slides open before you touch it. Nobody pressed a button. So what noticed you? | sensor; reading; controller | rules | S |
| 2 | The sensors in your phone | name three things a phone senses, and explain that a photo is a grid of numbers | Turn a phone on its side, and the video turns too. Hold it to your ear, and the screen goes dark. You never told it to. So how does the phone know? | motion sensor; nearness sensor; pixel | pixels | S |
| 3 | Measure it right | read a scale, write a measurement with its number and its unit, and spot a reading that can't be right | Three friends measure the same desk. Kemi writes seventy, Tunde writes seven hundred, and Grace writes twenty-eight. Nobody made a mistake. So how can one desk have three lengths? | unit; scale; glitch | datalog | S |
| 4 | Connected things, safely | say what makes a thing connected, and do two things that keep it safe: change the factory password, and allow only what an app needs | Sara’s aunt bought a small camera to watch her shop at night. A week later, a friend sent her a link. It showed the shop, live, for anyone to see! How did strangers get in? | Internet of Things; factory password; permission | permissions | S |

- **Unit check:** unchanged, after a check that no question uses a term the videos drop ("actuator", "megapixel", "botnet").
- **Changes:** an age pass, for 9 to 12. The writing is already simple (sentences of 8 words on average), but each video is about 415 words: it comes down to 370 at most, with no sentence over 14 words. Terms drop from five to three a lesson: "actuator" becomes "the part that acts", "accelerometer" and "proximity sensor" become "motion sensor" and "nearness sensor", carbon monoxide becomes "a gas you can't see or smell", and "botnet" goes. Hooks were a teacher's own stories; they are now told to "you" or about a child. Lesson 1's lab changes from `sensor` (noise, averaging, false alarms) to `rules`, with the fan rule only. Phones are "a phone at home, with a grown-up", and the reading says once that many apps are for ages 13 and over.

### `iot-s2` Build a circuit
- **For:** students, lower secondary (12–15)
- **Status:** revise
- **After it, you can:** light a bulb and an LED safely; write a device's rule with AND, OR and NOT; count in binary; read and change a night-light program.
- **Before this:** No experience needed.
- **Python:** shown and explained (lesson 4)
- **The path:** make it light up, make switches decide, count the way a chip counts, then meet the chip and its program.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Make it light up | light a bulb with a battery and a wire, explain why the loop must be closed, and say why an LED needs a resistor | Amani has a battery, a bulb and one wire. She touches the wire to the bulb: nothing. She moves the wire a little, and the bulb lights! What changed? | circuit; conductor and insulator; resistor; short circuit | circuit | S |
| 2 | Switches that decide | fill in a truth table for AND, OR and NOT, and write the rule for a real device | Your class wants a fan with a rule. It should run only when it is hot and someone is in the room. But a switch cannot think. So how can a machine follow that rule? | AND, OR and NOT; truth table; logic gate | logic | S |
| 3 | Talk in binary | count to 31 in binary on your fingers, and work out how many values a number of bits can hold | How high can you count on one hand? Most people say five. Your teacher says thirty-one, with the same five fingers. How is that possible? | bit; binary; place value; byte | binary | S |
| 4 | Meet the microcontroller | read a night-light program on the virtual board, put its lines in order, and change the number that decides when it is dark | The street light outside your school comes on by itself at dusk. Nobody presses a switch, and nobody watches the sky. So who decides when it is dark enough? | sensor; microcontroller; loop; threshold | board | R |

- **Unit check:** gains two questions on the night-light program; any question that leans on MakeCode or the `adc` lab goes.
- **Changes:** lesson 1 says in one scene where the course is going: a night light needs something to notice the dark, a tiny computer to decide, and a lamp, and all three need a circuit. Lesson 4 is rewritten: it teaches "sensor" itself (a 13-year-old who starts here never met `iot-s1`), and its program moves from MakeCode in a browser to the virtual board on the phone, with the board's numbers: 16 bits, so 0 to 65,535, which ties back to lesson 3. Learners order the lines and fill in the threshold; nobody types. The paper flowchart stays as the project's first half. "KB and MB" and "flowchart" stay in the readings.

### `iot-s3` Make it automatic
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** write and test rules that run a device; choose its thresholds; plan what it logs and what it does with a bad reading; make its battery last; write short programs for a virtual board.
- **Before this:** No experience needed, only school maths (the mean and the median). If you have done “First Python”, the code will be familiar.
- **Python:** rung 1, taught here
- **The path:** a device with one rule, the number in the rule, the readings it can't trust, then the battery that keeps it going.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | IF this, THEN that | write an IF/THEN rule for a device, join two conditions with AND or OR, and test the rule through a day | On Friday, the last one out of your classroom forgot the fan. It ran all weekend, with nobody in the room. No person was there to notice. So what could have switched it off? | sensor; microcontroller; rule; condition | rules | R |
| 2 | When should it switch? | choose a threshold from real readings, say which mistake costs more, and stop a device flicking on and off with two thresholds | The new tank alarm at your school beeped six times on Monday. Every time, the tank was fine. By Thursday the tank really was dry, and nobody even looked up. What was wrong with that alarm? | threshold; false alarm and miss; hysteresis | threshold | S |
| 3 | A device that remembers | plan a data log: how often to read, what to write with each reading, and what the device does with a reading it can't trust | At six one morning, your school’s garden sensor recorded eighty-five degrees. The tomatoes would have cooked! By seven it said twenty-two. So which of its readings can you trust? | data logger; noise; glitch; fail safe | sensor | S |
| 4 | Power from batteries and the sun | work out how long a battery will last, and change how often a device sends so that it lasts a year | Your club’s garden sensor sends a reading every ten seconds. Watching it live is exciting, for four days. Then two brand-new batteries are flat. What used them up so fast? | capacity (mAh); average current; sleep mode; charge controller | battery | S |

- **Unit check:** two questions read or finish a short board program.
- **Changes:** lesson 1 is rewritten to start from zero for a 16-year-old: two scenes show what a person would do about the fan (notice, decide, switch) and name the three parts a device needs, before the first rule. "Fail safe" moves from lesson 1's reading to lesson 3, where a reading can't be trusted. Board code arrives one construct at a time, each explained in the reading first: lesson 1 orders the lines of a rule (`if`, `else`); lesson 2 finds the flicker bug, then adds the second threshold in a short program (`elif`); lesson 3 fills in a logging loop (`while True`, `print`, `time.sleep`); lesson 4 changes how long the loop sleeps. Lesson 4's reading adds what a device costs after it is built: spent batteries and e-waste. Hooks were teachers' own stories and are now told to "you".

### `iot-s4` A connected world
- **For:** students, upper secondary (15–18)
- **Status:** move (from university to upper secondary, with the same four lessons)
- **After it, you can:** choose how a device talks; design a mesh for a real place; lock a connected device down; design a connected project for a problem near you.
- **Before this:** `iot-s3` “Make it automatic” (IoT, upper secondary).
- **Python:** none
- **The path:** how one device talks, how many devices pass a message on, how they are attacked and kept safe, then a project of your own.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How things talk | choose a radio for a device by how far, how much power and how much data, and follow a reading from the device to an app | Your club builds a sensor for the school garden. On the desk, its readings reach your phone. Out in the garden: nothing arrives. The sensor still works, so what went wrong? | range; gateway; LoRa; encryption | wifi | S |
| 2 | Pass it on: mesh networks | draw a mesh for a real place, find the device that is cut off, and add a relay to rescue it | A sensor in the far field cannot reach the school office. Its radio carries two hundred metres, and the office is six hundred away. A bigger radio costs too much. So how else can its message get there? | mesh network; hop; relay; single point of failure | mesh | S |
| 3 | Keep connected things safe | check a connected device, with its owner's permission: a new long password, updates on, unused features off | The new camera at your school gate came with the password admin. The installer shrugged: they all do. So who else, anywhere in the world, already knows the way in? | default password; botnet; passphrase | password | S |
| 4 | Your connected project | design a connected device for a real problem as sense, decide, act, connect, and compare two designs with a weighted score | Every rainy season, the road to Musa’s school floods. Last year a minibus drove into the water at the low bridge and stuck. Nobody could see how deep it was. What could have warned the driver in time? | success measure; weighted score; trade-off | decision | S |

- **Unit check:** unchanged, plus one question on lesson 3, which the review found thin.
- **Changes:** the course keeps its four lessons, its videos and its id, and moves from level 4 (university) to level 3, as the second upper-secondary course. Its framing ("with your family's permission", "ask someone at home") fits 15 to 18, and never fitted a university. Each lesson gets the standard pass: the hooks are told to "you" and end on a question, and lesson 1's second check asks the hook's question (why nothing arrives in the garden) instead of a new one about cameras. Lesson 3's reminder on passwords names `cyber-s1`. The summary gains its "Before this" line. The "s4" in the id is a leftover, like `iot-1-2`. The course is published today: it changes level when `iot-m1` is published, so university students are never left without a course.

### `iot-m1` The whole system: sense, decide, act
- **For:** students, university
- **Status:** new
- **After it, you can:** trace a connected system's data and control paths; describe a sensor by what it can and cannot tell you; give each person the least data they need; design a room air monitor with a safe state for every actuator.
- **Before this:** No experience needed.
- **Python:** shown and explained
- **Phone or computer:** all of it runs on the phone, and none of it needs Python yet. The design is drawn on paper. Its code is read, traced and completed: the design as two short lists is explained line by line, then learners put its lines in order, fill in a missing flow, and predict what the draft's `check_design` prints.
- **The path:** follow the chain, question the sensor, decide who sees what, then design the whole monitor and check it.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | From the sensor to the person, and to the fan | trace a connected system's data path and its control path, from the sensor to the people and to the actuator | A small white box appears on your lecture room wall. Next to it, a fan. In the middle of a lecture, the fan starts by itself. What told it to, and who else is listening to that box? | sensor; controller; actuator; data path and control path | rules | N |
| 2 | What a sensor can and cannot tell you | describe a sensor by what it measures, its unit, range, resolution and sampling interval, and spot a reading that is the converter's limit, not the room | The dashboard shows two hundred and eighty degrees in your seminar room. Nobody is on fire, and the sensor is not even warm. So where did that number come from? | measurand; range; resolution; analogue-to-digital converter | adc | N |
| 3 | Who needs which data | draw a system's boundary and zones, and give each stakeholder the least data they need | The air monitor in your seminar room sends a number every minute. The facilities office wants every reading from every room, for ever. The lecturer just wants to know when to open a window. Who should get what? | system boundary; zone; stakeholder; aggregated data | footprint | N |
| 4 | Design the air monitor | design a room air monitor: a diagram that passes the course's three checks, a safe state and an override for every actuator, and a risk register | The monitor’s little computer crashes at two in the morning. Its last order to the heater was: on. The building is empty until eight. What should the heater do, when nobody is telling it anything? | safe state; human override; risk register | board | N |

- **Unit check:** 10 questions from the module's quiz and its "Check yourself" questions, at least four of them designs to judge.
- **Changes:** from module 1 of the draft. Its first lesson held more than four new ideas, so it is split: the chain and its two kinds of path open the course; boundaries and zones move to lesson 3, beside the stakeholders; safe states move from the draft's lesson 2 to lesson 4, where the practical task needs them. The draft asks for Python before module 1; this course does not, so the lists and dictionaries in its examples are code to read, each line explained. The task is lesson 4's project in a version with no code to write: the diagram, the access table, the risk register and the assumptions note, with the design checked by hand against the three rules. The draft's Python model is an optional extra for those who already write lists and dictionaries. The school examples become a lecture room, a seminar room and the facilities office.

### `iot-m2` Readings you can trust
- **For:** students, university
- **Status:** new
- **After it, you can:** keep a unit and a UTC time with every value; choose how often to sample; label what was measured, estimated or missing; reject impossible readings with evidence.
- **Before this:** `iot-m1` “The whole system” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 3
- **Phone or computer:** the lessons' code steps run on the phone: convert a unit and refuse an unknown one, compare two UTC times, validate a reading, label a value. The draft's sensor simulator needs one change first (the phone's `random` has no `Random` class). The full task (a generated series, an evidence file written to disk, tests of your own) is for a computer.
- **The path:** what must travel with a number, how often to take it, how sure you are of it, then what to do with the ones you can't believe.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A number needs a unit and a time | keep a unit and a UTC time with every reading, and convert only for display | The chemistry lab’s monitor raises a heat alert: seventy-five degrees. Everyone inside feels fine. The program has no bug, and the sensor is working. So what does seventy-five mean? | unit; UTC; ISO 8601; time zone | datalog | N |
| 2 | How often, and how noisy | choose a sampling interval that can catch the shortest event you care about, and say what smoothing costs | Someone opens a window in your lecture room for four minutes. The air clears, and the window closes again. The monitor’s chart for that hour shows nothing at all. How can a sensor miss the only thing that happened? | sampling interval; noise; moving average; lag | sensor | N |
| 3 | Measured, estimated or missing | label every value as a measurement, an estimate or missing, and apply a two-point calibration | A sensor in the library is silent for two hours. A helpful script fills the gap with averages. Now every value in the file looks the same. Which ones did a sensor actually measure? | calibration; quality label; estimate; missing value | quality | N |
| 4 | Clean a series, and keep the evidence | write rules that reject impossible readings, justify each constant, and keep an evidence log of every rejection | Your script deletes every strange reading from last week’s data. The chart looks perfect now. Then facilities ask: was the sensor in room B12 ever faulty? What can you tell them? | validation rule; saturated value; evidence log | datalog | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them readings to judge.
- **Changes:** from module 2. This is the first IoT course in which university students write Python. Each draft lesson has two outcomes; the video takes the first, and the second (converting with validation, the median against the mean, calibration drift) goes to the reading and the practice. The median gets one sentence and an example (its home for students is `data-s2-4`). `datalog` is met twice: in lesson 1 to read rows with their unit and hour, in lesson 4 to leave glitches out and keep the record.

### `iot-m3` Control that fails safe
- **For:** students, university
- **Status:** new
- **After it, you can:** stop a controller chattering with two thresholds; write it as a state machine with a state for missing data; set who wins when sources disagree; build and test a fan controller.
- **Before this:** `iot-m2` “Readings you can trust” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 3
- **Phone or computer:** all of the lessons run on the phone: the controller is a few functions, and its trace is a list in the step. The draft's task uses a class and a test file; on the phone it uses functions, and the tests are the step's own. The class and a test file of your own are for the full task on a computer, after `code-m7` and `code-m8`.
- **The path:** one threshold fails, a state machine fixes it, a priority order keeps people in charge, then you build the controller.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | One threshold chatters | explain why one threshold chatters on noisy readings, and choose two thresholds whose gap is wider than the noise | In one lecture, the room’s fan switches on and off fourteen times. The air is neither good nor bad. Its rule is simple: fan on at one thousand. So why can it not make up its mind? | threshold; chatter; hysteresis; deadband | sensor | N |
| 2 | A state for "I don't know" | write a controller as a state machine with a state for missing data, and add a dwell time | The air sensor in your lab stops answering at ten o’clock. The controller reads the silence as zero. Zero means perfect air, so the fan stays off all day. What should a controller do when it hears nothing? | state machine; NO_DATA state; dwell time | board | N |
| 3 | Who wins: the guard, the person or the rule | write a controller's priority order (interlock, human override, data check, automatic rule), and read a decision log | A technician opens the fan’s guard to clean the blades. At that moment, the room’s air turns bad. The automatic rule and the lecturer’s panel both say: fan on. Who should win? | stale data; interlock; priority order; decision log | rules | N |
| 4 | Build the fan controller | build a simulated fan controller, test its exact boundaries, and justify each constant with one risk | Your fan controller works on every reading you tried. Then the reading is exactly one thousand: the threshold itself. Half the class says on, half says off. What did your design say, and where is it written? | named constant; boundary value; state diagram | threshold | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them traces to follow.
- **Changes:** from module 3, lesson for lesson. The fan is a value in memory, and every video says so once: real equipment needs qualified people and hardware interlocks.

### `iot-m4` Messages: topics, publish and subscribe
- **For:** students, university
- **Status:** new
- **After it, you can:** explain how a broker joins publishers and subscribers; design topics and predict who receives a message; agree a payload schema and reject what breaks it; run a producer and a consumer.
- **Before this:** `iot-m3` “Control that fails safe” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university). Networking is taught here from the beginning.
- **Python:** rung 3
- **Phone or computer:** the lessons run on the phone: matching a topic against a filter and checking a payload with `json` are code steps, and the simulated broker is given in the step. Classifying addresses is done as questions (the phone's Python has no `ipaddress`). The draft's optional lab with a real broker needs a computer, and its authors never ran it.
- **The path:** one broker in the middle, names for the messages, an agreement on what a message says, then both ends running together.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | One broker in the middle | explain how a publisher reaches subscribers it has never heard of, through a broker at an address and a port | Two teams share the lab’s temperature sensor. One wants a live chart, and the other wants an alarm at thirty degrees. The sensor cannot know who is listening. So how do both get every reading? | IP address; port; broker; publish and subscribe | mesh | N |
| 2 | Topics and wildcards | design topic names for a building, and predict exactly which subscriptions receive a message | Your sensor publishes a reading every minute. The broker accepts every one, without a single error. Your dashboard, subscribed all day, shows nothing. Where did sixty messages an hour go? | topic; wildcard; retained message | new: mqtt | N |
| 3 | Agree what a message says | define a payload schema, and send every payload that breaks it to a dead-letter list with a reason | A sensor sends the temperature as text: twenty-four point five C. The broker delivers it happily. The dashboard tries to add it to a number, and crashes. Whose job was it to stop that message? | payload schema; sequence number; consumer; dead-letter list | quality | N |
| 4 | A producer, a consumer and a pile of bad messages | run a producer and a consumer through a broker, count what was accepted and rejected, and trace who received one message | Your consumer rejects a broken message and logs the reason. But a second program, subscribed to everything, received that message too. Nobody invited it. So who decides who may listen? | producer; message trace | new: mqtt | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them "who receives this?".
- **Changes:** from module 4. Lesson 2 of the draft also explains QoS, Last Will, keep-alive and sessions: the video keeps topics and wildcards, and the reading says what real MQTT adds and what the simulator leaves out, in the draft's own table. QoS comes back in `iot-m6-3`, where duplicates make it matter. Lesson 1 borrows `mesh` to show many devices reaching one gateway. Lessons 2 and 4 want a Labs app that does not exist yet (decision 4); until it does, their lab step is `stream`, the receiving end of a sensor's messages.

### `iot-m5` Storing and showing telemetry
- **For:** students, university
- **Status:** new
- **After it, you can:** store readings in a table that refuses bad rows; summarise by hour without losing units, time or coverage; draw a chart that hides nothing; report a day honestly.
- **Before this:** `iot-m4` “Messages” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university). No database knowledge is needed.
- **Python:** rung 3; SQL taught here
- **Phone or computer:** on the phone, the table rules and the hourly summary are SQL steps (the phone has SQLite), and the text chart is a Python step. Calling the database from Python and writing the chart as an SVG file need a computer.
- **The path:** keep the readings, summarise them, show them, then put one honest page in front of a decision-maker.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Six facts for every stored reading | store readings in a table whose rules refuse a bad row: a missing value, a wrong format, a duplicate | Someone types the words “812 ppm” into your file’s value column. The file saves it without a complaint. Next week, your average comes out wrong. What should have said no? | telemetry; constraint; primary key; placeholder | sqlplay | N |
| 2 | A summary that still means something | summarise readings by hour with count, minimum, mean, maximum, unit and coverage, and avoid the mean of means | The report on room B12 says: eight to nine, excellent air. The sensor was offline for forty of those sixty minutes. Nobody lied, and the sum is right. So what is the report hiding? | aggregation; coverage; mean of means | datalog | N |
| 3 | Honest charts | draw a chart that states what, where, when, the unit and the time zone, and leaves missing data visible | The chart on the facilities screen shows a huge spike at three. Three in the morning, or three in the afternoon? The axis has numbers, and nothing else. What must a chart say before anyone acts on it? | axis label; reference line; visible gap | chartpick | N |
| 4 | Store, summarise and chart a day | store a day of readings, summarise and chart it, and say which decisions it can and cannot support | Facilities want one page: how was the air in block A yesterday? You have a full day of readings, and three hours with almost none. What goes on the page, and what must it admit? | hourly summary; low-coverage flag | sqlplay | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them summaries or charts to judge.
- **Changes:** from module 5, lesson for lesson. The day boundary (a reading at 21:30 UTC belongs to the next day in a campus at UTC+3) goes to lesson 2's reading and practice. "Mean, median and honest charts" has its home in the Data track (`data-s2-4`): these lessons give a two-sentence reminder and spend their time on what telemetry adds, coverage and visible gaps.

### `iot-m6` When the network fails
- **For:** students, university
- **Status:** new
- **After it, you can:** design an outbox that survives an outage; retry without causing a storm; find duplicates and gaps and store each reading once; replay after an outage and prove the count.
- **Before this:** `iot-m5` “Storing and showing telemetry” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 3
- **Phone or computer:** the lessons run on the phone, on a simulated clock: the outbox is a list, the backoff schedule a loop, and duplicates are found with a dictionary. An outbox saved to a file that survives a power cut, and a consumer backed by a database, need a computer.
- **The path:** keep what you could not send, try again without crowding, count each reading once, then run a whole outage.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Keep it, then send it | design a bounded outbox for a device, and choose what it drops when it is full | The campus Wi-Fi goes down from two until five. Your sensors keep measuring all afternoon. At five the network returns, and the dashboard shows a three-hour hole. Where did three hours of readings go? | store and forward; outbox; drop policy | mesh | N |
| 2 | Try again, but not all at once | schedule retries with exponential backoff, a cap and jitter, and explain how a retry storm starts | Thirty sensors in one building lose the network together. Each one tries again every five seconds. When the network returns, all thirty hit it in the same second. How do you stop sensors from acting like a crowd? | exponential backoff; jitter; retry storm | stream | N |
| 3 | Count every reading once | use a device id and a sequence number to find duplicates and gaps, and store every reading exactly once | Your sensor sends reading number four. The server stores it, but its reply is lost on the way. So the sensor sends number four again. How many fours does your daily total count? | acknowledgement; duplicate; gap; idempotent | pipeline | N |
| 4 | Outage and replay | simulate an outage and a replay within a resend budget, and prove every reading is stored once or reported missing | Your sensor’s outbox holds sixty readings. It measures once a minute. The network has just been down for three hours. Which readings survive, and what should the sensor say about the rest? | replay; resend budget; resource budget | battery | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them timelines to work through.
- **Changes:** from module 6. The draft's third lesson joins two ideas, duplicates and resource budgets: the video keeps duplicates and gaps, and the budgets (battery, bandwidth, buffer) move to lesson 4, where the task has a resend budget and the `battery` lab shows the sums. Every budget prints its assumptions: the draft's numbers are illustrations, not datasheet values.

### `iot-m7` Identity, secrets and privacy
- **For:** students, university
- **Status:** new
- **After it, you can:** find the trust boundaries in a system; keep secrets out of files; give each client only the permissions its job needs; review a configuration for what it exposes about the system and about people.
- **Before this:** `iot-m6` “When the network fails” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 3
- **Phone or computer:** on the phone: the permission check, a SHA-256 fingerprint and an HMAC tag are code steps (`hashlib` and `hmac` are there). The configuration file and environment variables are shown and explained, with guided steps: the phone's Python has no `configparser` or `secrets`, and a step has no environment to set. The scripted review of the toy configuration needs a computer. Every secret in the course is a fake that starts with DUMMY.
- **The path:** who is this really, where do secrets live, what may each client do, then a whole configuration to review.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A name is only a claim | mark the trust boundaries that data and commands cross, and tell a claimed identity from a proven one | A program on someone’s laptop announces: I am sensor twelve. It sends a reading: the air in room twelve is perfect. The real sensor twelve says the opposite. Which one does your system believe, and why? | trust boundary; authentication; authorisation | wifi | N |
| 2 | Secrets do not belong in files | move a secret out of a file into the environment, and say what a salted hash and an HMAC tag each protect | A classmate posts her project code on a forum, for help. Line twelve of her settings file holds the broker’s password. Two hundred people read that post. What should have been on line twelve? | secret; environment variable; salted hash; HMAC tag | hash | N |
| 3 | Allow only what the job needs | write deny-by-default permissions for each client, and test one action that must pass and one that must be refused | The dashboard in the corridor only shows numbers. One day, a message from it switches the fans off in every room. It was never built to give orders. So why did the broker obey? | least privilege; deny by default; access-control list | permissions | N |
| 4 | Review a configuration | review a configuration for secrets, open access and data about people, fix it, and name two risks the fix leaves | One office’s air readings show every arrival and every break. They also show a visit at five past six, on no timetable. Nobody installed a camera. Who should be able to see that line? | data minimisation; retention period; findings table | password | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them "allow or deny?".
- **Changes:** from module 7. The draft's third lesson joins permissions and privacy: the video keeps permissions, and privacy (what CO₂ shows about people, minimisation, retention) becomes the teaching of lesson 4, whose task already removes personal fields and sets a retention period. Hashes and personal data have their homes in the Cyber security track: each gets one sentence and an example here, and the lessons spend their time on what IoT adds: a device that can be impersonated, and readings that show when people are present. The hooks are near misses in a simulator, never an attack to copy.

### `iot-m8` From parts to a system you can trust
- **For:** students, university
- **Status:** new
- **After it, you can:** write the contracts between parts; test how a system fails with tests that can fail; give an operator indicators, a runbook and an incident record; report honestly what a simulation proves.
- **Before this:** `iot-m7` “Identity, secrets and privacy” (IoT, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3
- **Phone or computer:** on the phone: an acceptance test is a function with `assert`, run against a small monitor given in the step, and one mutant is caught. The full suite against the draft's 288-line monitor, the printed traceability matrix and the demo run are for a computer.
- **The path:** join the parts, break them on purpose, hand the system to the person who must run it, then prove it in both directions.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Parts that pass can fail together | write the contract for each interface, and explain a normal run from the event log | Your sensor code passes all its tests. Your dashboard code passes all its tests. Together, they show nothing: one writes ppm in small letters, the other expects capitals. Whose bug is it? | interface contract; integration; event log | pipeline | N |
| 2 | Tests that can fail | write a Given/When/Then acceptance test for a requirement, inject a fault, and prove the test can fail | You break your own validator, on purpose. Now it accepts any reading at all. You run your tests, and every one still passes. So what have those tests been checking? | requirement; acceptance test; fault injection; mutant | bugs | N |
| 3 | Someone has to run it | define health indicators with alert rules an operator can act on, and write a runbook entry and an incident record | At seven in the morning, the caretaker’s screen turns orange. It says: no valid reading for ten minutes. She is not an engineer, and you are asleep. What should the screen tell her to do? | health indicator; alert rule; runbook; incident record | threshold | N |
| 4 | Prove it, in both directions | write an acceptance suite with a traceability matrix, and report a normal run and a failure run honestly | Your simulated monitor passes forty tests. The dean asks one question: can we install it in every lecture hall next month? Your tests are green, and your fan is a variable. What can you honestly promise? | traceability matrix; demo report | board | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them test results to judge.
- **Changes:** from module 8, lesson for lesson. Its reference system (`monitor_system.py`, 288 lines) is too long for a phone step: the steps use a cut-down monitor with the same behaviour, and the full file is for the computer task and the capstone.

### `iot-m9` From the simulator to a real node: boards, signals, power and radio
- **For:** students, university
- **Status:** new
- **After it, you can:** run a controller's loop on a board; choose a sampling rate and convert raw counts; budget a node's power; choose the radio link for a deployment.
- **Before this:** `iot-m6` “When the network fails” (IoT, university) and `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 2
- **Phone or computer:** all of it runs on the phone: the `board` lab and code steps with a board (one download of 0.3 MB), then `adc`, `battery` and `mesh`. A real board is optional, on USB power only.
- **The path:** put the logic on a board, read its signals properly, keep it alive on a battery, then get its data home.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | The loop on a real board | run a controller's loop on a virtual board: read a pin, decide, drive an output, sleep | The lab hands you a board the size of a biscuit. Your controller passed every test in the simulator. This board has no screen, no keyboard and no files. So how will your program read the room? | microcontroller; pin; MicroPython; node | board | N |
| 2 | From a signal to numbers | choose a sampling rate for a repeating signal, predict the alias when it is too low, and convert raw counts to a value with its unit | A classmate films the ceiling fan in your lecture hall. On her phone, the blades turn slowly backwards. The real fan is spinning fast, and forwards. So what is the camera getting wrong? | sampling rate; aliasing; quantisation step | adc | N |
| 3 | The power budget | build a power budget from a node's active and sleep currents, and choose how long it may sleep before it misses its deadline | A wireless mouse runs for a year on one AA cell. Your phone begs for a charger every night. Both have a radio, and both are switched on all day. So how does the mouse last so long? | capacity (mAh); average current; duty cycle; deadline | battery | N |
| 4 | Choosing a link | choose a link for a deployment by range, data rate and energy, and place relays so that no node is cut off | Your project puts soil sensors across the university farm. There is no Wi-Fi out there, and no power. The nearest building is two kilometres away. So how does a reading get from the field to your laptop? | data rate; LoRa; mesh network; relay | mesh | N |

- **Unit check:** new: 10 questions, at least four of them deployments to decide.
- **Changes:** a new course, the ninth on the university path and the only one not taken from the drafts. The course teaches what the simulation cannot, and what `iot-u1` prepares lecturers to teach: lesson 2 is `iot-u1-1` for students, lesson 3 is `iot-u1-2`, lesson 4 is the link half of `iot-u1-3` (MQTT itself is in `iot-m4`). Each lesson opens on the module it grows from: lesson 1 on the fan controller of `iot-m3`, lesson 2 on the sampling interval of `iot-m2-2` and the counts of `iot-m1-2`, lesson 3 on the budget of `iot-m6-4`. Volts and amps are explained where they first appear. Lesson 3 carries what a device costs after it is built: a node that lasts ten years on one pair of cells throws away far fewer batteries than one that lasts a month. Nothing is addressed to "your class" or "someone at home".

### `iot-capstone` Capstone: a classroom environmental monitor
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** build a classroom environmental monitor in simulation (nodes, messages, storage and a dashboard, a safe controller, an outage and its replay, a threat model, an acceptance suite) with one command that reproduces a normal run and a failure run. On the optional route, run the node on an ESP32 or its free simulator with a real broker.
- **Before this:** `iot-m8` “From parts to a system you can trust” (IoT, university) and `code-m7` “Tests and debugging” (Programming, university). The hardware route also needs `iot-m9`.
- **Python:** rung 3 (classes help: `code-m8` “Classes and reproducibility”)
- **Phone or computer:** a computer with Python 3.10 or newer, and a free GitHub account. The phone is for reading the brief and sending each milestone.

- **Changes:** it moves from level 3 (upper secondary) to the end of the university path, and its title changes from "a classroom weather station". The two capstones are one project seen twice: both are a room monitor with readings, messages, storage and a dashboard, an alert with safety rules, tests and a release, in five milestones. So they combine. The required core is the draft's brief: simulation only, the standard library only, its five milestones (design; data and devices; messaging, storage and dashboard; failure and security; tests, demo and report), its boundaries (no real building systems, no real secrets, no scanning) and its marks out of 100. Today's parts stay as the hardware route for those who took `iot-m9`: the ESP32 with MicroPython or Wokwi, a real broker, the comparison with Open-Meteo, and SAFETY.md with USB power only. The GitHub template, `check.py` and the milestone steps stay as the way work is handed in. Text only, but the starter repository and its checks are rebuilt around the new milestones.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `iot-1-2` | Teachers, Beginner | Kept. 4 standard passes; a lab scene in each video; three labs change. Gains "No experience needed." |
| `iot-2-1` | Teachers, Elementary | Revised. 3 standard passes; lesson 4 rewritten around the virtual board. Names `iot-1-2`. |
| `iot-3-1` | Teachers, Intermediate | Kept. 4 standard passes; guided board steps in lessons 2 and 3. Names `iot-2-1`. |
| `iot-4-1` | Teachers, Advanced | Kept. 4 standard passes; consent enters lessons 1 and 2; end of life enters lesson 3. Names `iot-3-1`. |
| `iot-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `iot-s1` | Students, primary | Revised for ages 9 to 12. 4 standard passes. |
| `iot-s2` | Students, lower secondary | Revised. 3 standard passes; lesson 4 rewritten around the virtual board. |
| `iot-s3` | Students, upper secondary, start | Revised. Lesson 1 rewritten to start from zero; 3 standard passes; first board programs. |
| `iot-s4` | Students, upper secondary, next | Moves from level 4 to level 3, with its four lessons and its id. 4 standard passes. Names `iot-s3`. |
| `iot-capstone` | Students, university, capstone | Moves from level 3 to level 4; its brief joins the draft's capstone and today's weather station. Text only. |
| (new) `iot-m9` | Students, university, hardware | New: "From the simulator to a real node", 4 lessons and a unit check. |
| (new) `iot-m1` to `iot-m8` | Students, university | Eight new courses from the Darsi University draft: 32 lessons and 8 unit checks. |

## Work, in order

The Darsi University draft is source material, not finished courses. No lecturer and no Arabic reader has reviewed
it. It is simulation only: no hardware, no real MQTT and no TLS were tested. Its code was run on Linux with Python
3.13 only, never in the phone's Python. Its narration is a summary per lesson. Its Arabic is Modern Standard Arabic,
which suits the course text after a review; the videos need Egyptian Arabic written fresh. So each module gets a
subject review before its course is written, and every code step is run in the phone's sandbox by the units test.

1. **`iot-m1`, new** (4 lessons): the first thing a university student should see, and university courses are the
   ones published today.
2. **`iot-4-1` and `iot-u1`, standard pass** (8 lessons): the two published teachers' courses.
3. **`iot-m2` to `iot-m8`, new** (28 lessons), in order, each after its review. Decision 4 (the `mqtt` lab) is
   needed before `iot-m4`.
4. **`iot-m9`, new** (4 lessons), and the capstone's brief and starter repository. `iot-s4` changes level once
   `iot-m1` is published.
5. **`iot-1-2`, then `iot-2-1` and `iot-3-1`** (11 standard passes, 1 rewrite): the teachers' ladder, in order.
6. **`iot-s3`, `iot-s4`, `iot-s2`, `iot-s1`** (14 standard passes, 2 rewrites): the school stages.
7. **Text only:** the last line of every summary; the guided board steps in `iot-3-1`; consent in `iot-4-1-1` and
   `iot-4-1-2`; placement (below); the track line on the track's card.

In all: 33 standard passes, 3 rewrites and 36 new lessons in 18 courses, and the capstone's text. Narration is about
$2.22 for both languages.

## Decisions for the user

1. **Let the first university course need no Python?** Recommended: yes, as in every track. `iot-m1` says "No
   experience needed": its code is read, traced and completed, and its project has a version with no code to
   write. A student can then begin IoT beside Programming. From `iot-m2` on, each course names the Programming
   course it needs: `code-m6`, then `code-m7` for `iot-m8`. Cost: nothing more; the small programs of module 1
   become an optional extra. The other choice is the draft's own bar, Python before module 1: `iot-m1` would then
   name `code-m5`.
2. **Phone or computer for the university courses?** The draft assumes a computer with Python 3. Recommended:
   every lesson runs on the phone (code steps in the phone's Python, SQL steps, the Labs apps), and each course's
   task is done there in its core, with the written parts as the project. The full tasks and the capstone need a
   computer, and each course says which parts. Cost: every example is adapted to the phone's Python and run there.
   It has `json`, `datetime`, `hmac`, `unittest` and SHA-256, but no `sqlite3`, `configparser`, `ipaddress`,
   `statistics` or `secrets`; it stops a program after 3 seconds; and it has never run the draft's code. Small app
   work would help: the draft's two helpers (a sensor simulator and a broker simulator, 147 lines) added to the
   phone's Python library, as the virtual board was.
3. **Keep `iot-s4` as it is, one stage down, and add the hardware course under a new id?** Recommended: yes. An id
   keeps its content: learners who finished `iot-s4` keep their marks and their certificate for the lessons they
   did, and no media moves between ids. So `iot-s4` moves to upper secondary unchanged, and "From the simulator
   to a real node" is a new course, `iot-m9`: the ninth university course, written here, not taken from the
   drafts. Cost: 4 new lessons and 4 standard passes (about $0.24), and a level number. The other choice is the
   in-place rewrite: `iot-s4` becomes the hardware course, and its present lessons move to a new id.
4. **Build a Labs app for publish and subscribe (`mqtt`)?** Topics, wildcards, who receives, a retained message:
   the draft's broker simulator with a face. It would serve `iot-m4-2`, `iot-m4-4`, `iot-u1-3` and the capstone.
   Recommended: yes. Cost: one Labs app (model, screen, tests), no narration. Without it, the two lessons use
   `stream` and a code step.
5. **One capstone or two?** Recommended: one, `iot-capstone`, with the simulated monitor as its required core and
   the weather station as its hardware route. Cost: the brief and the starter repository are rewritten; its level
   changes from 3 to 4. Two capstones would mean a second id, template and review queue.
6. **How code enters below university.** Teachers read board programs and never type (levels 2 and 3). Students
   read them at lower secondary and write short ones at upper secondary, taught in the course. Recommended: as
   planned. The other choice names `code-2-1` for `iot-3-1` and `code-s2` for `iot-s3`, and adds full code steps.
7. **The pack course's flavour.** `iot-1-2` keeps its Nigerian names and stories. The one money example (naira and
   CFA francs, lesson 2) is still open in `ar-lingo.md`. Recommended: keep the names; make the price example a
   plain "two hundred what?" with no currency named. Cost: one sentence in two languages.

## Reference

Kept from the plan of October 2026 and brought up to date. The rules every course keeps are in `docs/CONTENT.md`.

### How the courses talk about IoT

- **No kit needed.** Many schools have no electronics. Every school lesson has an activity with paper, everyday
  objects or a phone, and kit work is offered beside it: torch bulbs and AA batteries, LEDs and resistors, then a
  board (Arduino, ESP32, BBC micro:bit, Raspberry Pi Pico) or the virtual board in Labs. No-kit activities already
  in the courses: a conductor hunt with a torch bulb, human logic gates with 1 and 0 cards, binary dot cards, a
  pupil who plays the microcontroller with a program card, rule cards acted through a school day, battery-life
  sums, a playground radio game.
- **Safety first, every time.** Only batteries in class (mains electricity can kill); button batteries away from
  small children; an adult cuts and handles sharp things; lithium batteries never crushed, pierced or left in hot
  sun. The university courses never connect code to a real building system, to mains equipment or to a network
  they do not own.
- **Honest about simulation.** In `iot-m1` to `iot-m8` the fan is a value in memory and the broker is a simulator
  inside one program. A simulation proves logic, not hardware. The courses say so, and `iot-m9` and the capstone's
  hardware route are where a board comes in.
- **Local examples:** school gardens and farms, water tanks and boreholes, rain gauges, solar panels, markets, hot
  classrooms, buses, prepaid meters. On campus: lecture halls, labs, the library, hostels, the university farm, the
  facilities office.
- **The cast:** Mr Joseph (computer studies) and Mr Okafor (science) lead most of the electronics; Ms Amina
  (primary) and Ms Salma (maths) bring classroom problems; Dr Farah (education lecturer) leads ethics and projects.
  In students' videos they are the students' teachers.

### Facts the courses use

Keep the numbers the same in every course and as the Labs apps show them (`apps/web/src/labs/apps/*/model.ts`).

- **Circuits:** current flows only round a closed loop. Ohm's law V = I × R. A red LED takes about 2 V (blue about
  3 V) and wants about 10 to 20 mA; above about 30 mA it burns out. Resistor = (battery volts − LED volts) ÷
  current: (3 − 2) ÷ 0.01 = 100 Ω; with 5 V, 220 Ω is the usual choice. The long leg of an LED goes to +.
- **Logic:** switches in series make AND, in parallel make OR; NOT inverts. The two-switch stair light is XOR.
- **Bits:** 8 bits = 1 byte = 0 to 255. A Latin letter takes 1 byte in UTF-8, an Arabic letter 2. One SMS holds
  160 Latin characters but only 70 Arabic ones. A sensor reading is a few bytes; a phone photo is a few million.
- **The virtual board** (the `board` lab and code steps with a `board`): a drawn Raspberry Pi Pico that runs
  MicroPython. An LED on pin 15, a buzzer on 16, a button on 14, a light sensor on 26, a temperature sensor on 27.
  `read_u16()` gives 0 to 65,535 (16 bits): light from dark to full sun, temperature from 0 °C to 50 °C. The three
  examples are Blink, Night light (LED on below 20,000) and Heat alarm (buzzer above 35 °C until the button is
  pressed). Python is one download of 0.3 MB. A real Arduino Uno reads 10 bits (0 to 1,023) and an ESP32 12 bits.
- **Microcontrollers:** a whole small computer on one chip, with pins for inputs (buttons, sensors) and outputs
  (LEDs, buzzers, motors through a driver). A program sets up, then loops: read, decide, act, wait.
- **Data:** every reading gets a time, a unit and a place. Check a sensor against a trusted one before you trust
  it. A DS18B20 temperature sensor reads 85 °C when it has just powered up: a classic glitch. One bad reading moves
  the average; the median barely moves. Keep the raw data and write down what you removed and why.
- **Rules:** IF condition THEN action. Two thresholds stop flicker: fan on above 30 °C, off below 28 °C; pump on
  below 20 % of the tank, off above 90 %. When a sensor fails, the system must fail safe (the pump stops).
- **Power:** 2 AA batteries hold about 2,000 to 2,500 mAh; a CR2032 coin cell about 220 mAh. Sleeping takes about
  0.01 mA, a Wi-Fi send about 120 mA for 2 s, a LoRa send about 40 mA for 0.4 s. Battery life (hours) = capacity
  (mAh) ÷ average current (mA). Plan with about 70 % of the label. Much of Africa and the Middle East gets 4 to 6
  hours of full sun a day; plan for 3 to 5 cloudy days.
- **Networks:** Bluetooth Low Energy about 10 to 30 m; Wi-Fi about 30 to 50 m indoors, and it needs a router and
  power; mobile networks anywhere with coverage, with a SIM and a plan (2G and 3G are being switched off in many
  countries); LoRa 2 to 5 km in towns and 10 km or more in open country, a few dozen bytes at a time, through a
  gateway. A mesh passes messages hop by hop. Collecting an SD card once a week is a network too.
- **Air:** outdoor air has about 420 ppm of carbon dioxide. Below about 800 ppm a room is well aired; open the
  windows above 1,000 ppm; above 1,500 ppm the air is already poor (decided in `ar-lingo.md`, 2026-11-01).
- **Security:** in 2016 the Mirai malware took over hundreds of thousands of cameras and routers with a list of
  about 60 factory passwords. Change default passwords, update, put devices on their own network, switch off what
  you don't use, and send data encrypted.
- **Data protection laws** (examples): Nigeria Data Protection Act 2023, Kenya Data Protection Act 2019, Egypt's
  Personal Data Protection Law 2020, South Africa's POPIA. Children's data needs the most care.
- **The university courses' running example** (from the draft; illustrations, not datasheet values): a room air
  monitor that measures CO₂, temperature and humidity and may switch a simulated fan. The CO₂ sensor reads 400 to
  5,000 ppm in steps of 1, every 60 seconds. A 10-bit converter over 0 to 3.3 V has 1,024 counts, about 3.2 mV a
  step. One threshold at 1,000 ppm switches the fan 14 times in 42 minutes; on at 1,000 and off at 900 switches it
  twice. A reading older than 180 seconds is stale. The priority order is interlock, human override, data check,
  automatic rule. Topics look like `school1/blockA/room12/co2`; MQTT's ports are 1883, and 8883 over TLS. A
  summary flags hours with coverage below 75 %. Every secret is a fake that starts with DUMMY.

### The Darsi University draft

"IoT: Connected Sensing Systems by Simulation", prepared 2026-11-08 (`docs/CURRICULUM.md` says where the files
are): eight modules of three lessons, each with a
learner guide in English and Arabic, exercises on paper and on a computer, a quiz, a practical task with marks out
of 20, narration summaries and tested solutions; a capstone brief with a marking guide; two helper programs (a
sensor simulator and a broker simulator). In a course, the three lessons and the task become four lessons; the quiz
and "Check yourself" questions feed the unit check; the learner guide ships in the kit as a study guide; the
instructor's solutions stay out of the kit. Its own list of limits is in its README: simulation and not MQTT, no
hardware, no TLS, no review by people, no measured learning, no capstone solution by design.

### Labs across the track

Teachers meet `rules`, `sensor`, `quality` and `datalog` at level 1; `circuit`, `logic`, `binary` and `board` at
level 2; `datalog`, `rules`, `battery` and `mesh` at level 3; `decision`, `threshold`, `malware` and `footprint`
at level 4; `adc`, `battery`, `mesh` and `board` in `iot-u1`. Students meet `rules`, `pixels`, `datalog` and
`permissions` (primary); `circuit`, `logic`, `binary` and `board` (lower secondary); `rules`, `threshold`,
`sensor` and `battery`, then `wifi`, `mesh`, `password` and `decision` (upper secondary). The university courses
use the IoT labs again with harder tasks, and borrow from other tracks where a module has no IoT lab: `sqlplay`
and `chartpick` (`iot-m5`), `stream` and `pipeline` (`iot-m6`), `hash` and `permissions` (`iot-m7`), `bugs`
(`iot-m8`). In those lessons the worked case is in the code steps, and the lab is a second look at the idea. A lab
met again comes with a harder task: `rules` at level 3 trades comfort against the bill; `datalog` at level 3 keeps
the record of what was removed; `board` in `iot-m9` runs the learner's own controller.

### Placement

The IoT questions are in `apps/web/public/content/placement.json` only; there is no `content/placement/iot.json`
yet. Three fixes are waiting. The level-3 question `iot-s3-2` ("which is an example of automation?") is primary level.
`iot-t2-3` says "input, processing, output" where the course says "sense, decide, act". And the students' three
level-4 questions (mesh, default passwords, a river project) test `iot-s4`, which moves to level 3: they move with
it, and one can replace `iot-s3-2`. Level 4 for students then needs three new questions that a learner can answer
after `iot-m1` to `iot-m8`, such as a reading without a unit, a controller with no state for missing data, and
who receives a message on a topic.
