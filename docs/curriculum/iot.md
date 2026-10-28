# The IoT track

Seven new courses beside the live `iot-1-2` (Sensors): three for teachers and four for students aged 12–16. The levels,
ids and the shape of a course and a storyboard are in `docs/CURRICULUM.md`; the rules every course keeps are in
`docs/CONTENT.md`.

## How the track builds

| Level | Teachers | Students |
|---|---|---|
| 1 Beginner | `iot-1-2` **Sensors** (live): what a sensor is, reading scales, a rain gauge, from data to a decision | `iot-s1` **Things that sense**: sensors as machine senses, the phone's sensors, measuring well, connected things safely |
| 2 Elementary | `iot-2-1` **Circuits and microcontrollers**: current and LEDs, logic, binary, the microcontroller loop | `iot-s2` **Build a circuit**: the same ideas, built and tried by the student |
| 3 Intermediate | `iot-3-1` **Data and automation**: logging data you can trust, IF/THEN rules, battery and solar power, networks | `iot-s3` **Make it automatic**: rules, thresholds, logging, power |
| 4 Advanced | `iot-4-1` **Smart school projects**: design, pilot, maintain and secure a sensor project; data ethics | `iot-s4` **A connected world**: networks, mesh, IoT security, a community project |

- **Level 1** stays outside the box: what sensors notice and how to read them. **Level 2** opens the box: the circuit, the
  logic and the numbers inside every device. **Level 3** makes devices run on their own, on real school problems.
  **Level 4** puts it all together in a project people depend on, and asks who it is fair to.
- **No kit needed.** Many schools have no electronics. Every lesson has an activity with paper, everyday objects or a
  phone, and kit work is offered beside it: torch bulbs and AA batteries, LEDs and resistors (a few cents each), then a
  microcontroller (Arduino Uno or Nano, ESP32, BBC micro:bit, Raspberry Pi Pico) or a free simulator in a browser
  (MakeCode, Wokwi, Tinkercad Circuits).
- **Safety first, every time:** only batteries in class (mains electricity, 220–240 V, can kill); button batteries away
  from small children; an adult cuts and handles sharp things; lithium batteries never crushed, punctured or left in hot
  sun.
- **Local examples:** school gardens and farms, water tanks and boreholes, rain gauges, solar panels, markets, hot
  classrooms, buses, prepaid electricity meters.
- **The cast** (same as the other tracks): Mr Joseph (computer studies, Kenya) and Mr Okafor (science, Nigeria) lead most
  of the electronics; Amina (primary) and Ms Salma (maths) bring classroom problems; Dr Farah (education lecturer) leads
  ethics and projects. In students' videos they are the students' teachers.

## Facts the courses use

Keep the numbers the same in every course and in the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Circuits:** current flows only round a closed loop. Ohm's law V = I × R. A red LED takes about 2 V (blue about 3 V)
  and wants about 10–20 mA; above about 30 mA it burns out. Resistor = (battery volts − LED volts) ÷ current:
  (3 − 2) ÷ 0.01 = 100 Ω; with 5 V, 220 Ω is the usual choice. The long leg of an LED goes to +.
- **Logic:** switches in series make AND, in parallel make OR; NOT inverts. The two-switch stair light is XOR.
- **Bits:** 8 bits = 1 byte = 0 to 255. A Latin letter takes 1 byte in UTF-8, an Arabic letter 2. One SMS holds
  160 Latin characters but only 70 Arabic ones. Arduino Uno reads analog inputs as 10 bits (0 to 1023, at 5 V); an ESP32
  as 12 bits (0 to 4095, at 3.3 V). A sensor reading is a few bytes; a phone photo is a few million.
- **Microcontrollers:** a whole small computer on one chip, with pins for inputs (buttons, sensors) and outputs (LEDs,
  buzzers, motors through a driver). A program sets up, then loops: read, decide, act, wait. The BBC micro:bit has light,
  temperature, motion and compass sensors, a microphone, buttons, a 5 × 5 LED grid and a radio built in.
- **Data:** every reading gets a time, a unit and a place. Check a sensor against a trusted one before you trust it. A
  DS18B20 temperature sensor reads 85 °C when it has just powered up: a classic glitch. One bad reading moves the average;
  the median barely moves. Keep the raw data and write down what you removed and why.
- **Rules:** IF condition THEN action. Two thresholds stop flicker (hysteresis): fan on above 30 °C, off below 28 °C;
  pump on below 20 % of the tank, off above 90 %. When a sensor fails, the system must fail safe (the pump stops).
- **Power:** 2 AA batteries hold about 2,000–2,500 mAh; a CR2032 coin cell about 220 mAh. Sleeping takes about 0.01 mA,
  a Wi-Fi send about 120 mA for 2 s, a LoRa send about 40 mA for 0.4 s. Battery life (hours) = capacity (mAh) ÷ average
  current (mA). Plan with about 70 % of the label. Much of Africa and the Middle East gets 4–6 hours of full sun a day;
  plan for 3–5 cloudy days.
- **Networks:** Bluetooth Low Energy about 10–30 m (to a phone); Wi-Fi about 30–50 m indoors, needs a router and power;
  mobile (2G/4G, NB-IoT or LTE-M where offered) anywhere with coverage, needs a SIM and a plan, and 2G and 3G are being
  switched off in many countries; LoRa 2–5 km in towns and 10 km or more in open country, a few dozen bytes at a time, very
  little power, through a gateway. A mesh passes messages hop by hop. Collecting an SD card once a week is a network too.
- **Air:** outdoor air has about 420 ppm of carbon dioxide (CO₂). Below about 800 ppm a classroom is well ventilated;
  above about 1,500 ppm, open the windows now.
- **Security:** in 2016 the Mirai malware took over hundreds of thousands of cameras and routers with a list of about 60
  factory passwords, then used them to knock major websites offline. Change default passwords, update, put devices on
  their own network, switch off what you don't use, and send data encrypted (HTTPS).
- **Data protection laws** (examples): Nigeria Data Protection Act 2023, Kenya Data Protection Act 2019, Egypt's Personal
  Data Protection Law 2020, South Africa's POPIA. Children's data needs the most care.

## `iot-2-1` Circuits and microcontrollers (teachers, level 2)

**الدوائر الكهربائية والمتحكّمات الدقيقة.** What's inside every connected device: a circuit that carries current, LEDs
that need a resistor, logic that decides, bits that store numbers, and the tiny computer that runs it all. With kit and
no-kit activities for every lesson.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Current, LEDs and resistors (التيار والصمامات الضوئية والمقاومات) | Explain that current flows only round a closed loop, pushed by the battery's voltage. Light an LED the right way round, with a resistor to limit the current. Use Ohm's law to choose a resistor, and spot a short circuit. | `circuit` | IOT.3, DC.5.1 |
| 2 Logic: switches that decide (المنطق: مفاتيح تتخذ القرار) | Describe AND, OR and NOT with switches and truth tables. Build AND and OR from two switches (in series and in parallel), with kit or on paper. Write a classroom rule (fan, alarm, stair light) as logic. | `logic` | IOT.3, DC.3.4 |
| 3 Bits and bytes (البتات والبايتات) | Count in binary with place values, from 0 to 255. Explain why more bits give finer readings (10 bits = 1,024 levels). Estimate how much data a reading, a message and a photo take. | `binary` | IOT.1, DC.3.4 |
| 4 Microcontrollers: sense, decide, act (المتحكّمات الدقيقة: استشعر، قرّر، نفّذ) | Name the parts of a microcontroller board: power, pins, inputs and outputs. Explain how a program's loop reads a sensor, decides and acts (a night light). Choose a way to start: a simulator, a real board, or unplugged. | `adc` | IOT.3, DC.3.4 |

No-kit activities: a human circuit (a ball passed round a loop of pupils), conductor testing with a torch bulb and two AA
batteries, human logic gates with 1/0 cards, binary dot cards, a pupil "microcontroller" following a program card.

## `iot-3-1` Data and automation (teachers, level 3)

**البيانات والأتمتة.** Turn a school problem into data and action: log readings you can trust, write IF/THEN rules that
switch things on, make a battery last a term, and choose how the data travels home. The running problems: a classroom
that is too hot after lunch, the school water tank, the garden over the holidays.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Logging data you can trust (تسجيل بيانات يمكن الوثوق بها) | Plan a data log: what to measure, where, how often, with a time and unit on every reading. Check a sensor against a reference before trusting it. Clean glitches openly, and use the median when a few bad readings would drag the average. | `datalog` | IOT.1, DC.1.2 |
| 2 IF/THEN: rules that act («إذا/فإن»: قواعد تتحكّم في الأجهزة) | Write automation rules as IF condition THEN action, with sensible thresholds. Use two thresholds so devices don't flicker, and make the system fail safe. Test rules against a day of data and judge comfort against energy. | `rules` | IOT.3, DC.3.4, DC.5.1 |
| 3 Power: batteries and the sun (الطاقة: البطاريات والشمس) | Estimate battery life from capacity and average current. Explain why sleeping and sending less often make a sensor last longer. Size a small solar panel and battery for a sensor that runs all year. | `battery` | IOT.3, DC.5.1 |
| 4 Networks: getting the data home (الشبكات: إيصال البيانات إلى وجهتها) | Compare Bluetooth, Wi-Fi, mobile networks and LoRa by range, power, data and cost. Choose a network for a school sensor from its distance, power and data needs. Explain how gateways and relays (a mesh) carry messages beyond one radio's reach. | `mesh` | IOT.2, DC.5.1 |

No-kit activities: a paper log on a rota and the free phyphox phone app (it logs and exports CSV), rule cards that pupils
act out through a "school day", battery-life sums on the board, a playground radio game (pupils pass a note only to
someone within arm's reach).

## `iot-4-1` Smart school projects (teachers, level 4)

**مشاريع المدرسة الذكية.** Lead a real sensor project with your pupils: start from a school problem, design and pilot a
sensor network, keep it running and secure, and use its data fairly and honestly.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Start from a problem (ابدأ من مشكلة) | Turn a school problem into a measurable question and a success measure. Choose sensors, power and network by weighing needs, cost and upkeep with the people affected. Write a one-page project plan with roles for pupils. | `decision` | IOT.3, DC.5.3, DC.5.1 |
| 2 Pilot, place and test (جرّب وركّب واختبر) | Pilot one sensor node before building many, with a written test. Place sensors where they measure what you mean. Set alert thresholds that balance false alarms against missed problems. | `threshold` | IOT.1, IOT.3, DC.1.2 |
| 3 Keep it running and secure (حافظ على عمله وأمانه) | Plan maintenance: batteries, cleaning, recalibration, and a heartbeat that shows a silent failure. Secure devices: new passwords, updates, a separate network, only the data needed. Hand the system over so it outlives the project team. | `malware` | IOT.4, DC.4.1, DC.5.1 |
| 4 Data ethics: fair, safe and honest (أخلاقيات البيانات: العدل والأمان والصدق) | Decide what data a project really needs, and what it could reveal about people. Plan consent, access and how long data is kept, with extra care for children. Share results honestly with the school community, uncertainty included. | `footprint` | DC.4.2, IOT.4, DC.1.2 |

Running examples: the water tank that runs dry without warning, stuffy classrooms (CO₂), the school garden over the
holidays.

## `iot-s1` Things that sense (students, level 1)

**أشياء تستشعر.** Discover the sensors around you, in your phone, at home and in town: what they notice, how they turn
the world into numbers, how to measure well yourself, and how to stay safe with connected things.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Machines that notice (آلات تلاحظ) | Explain what a sensor does: it notices something and turns it into a number. Match your senses to sensors that do a similar job, and find senses machines have that you don't. Follow how a device senses, decides and acts. | `sensor` | IOT.1 |
| 2 The sensors in your phone (المستشعرات في هاتفك) | Name at least four sensors in a phone and what each is for. Explain that a camera is millions of light sensors that make a grid of numbers. Measure something with a phone sensor app. | `pixels` | IOT.1, DC.5.3 |
| 3 Measure it right (قِس بدقة) | Read a scale carefully: the unit, eye level and what each small step is worth. Record a measurement with its number, unit, time and place. Spot a reading that can't be right, and say what to do about it. | `datalog` | IOT.1, DC.1.2 |
| 4 Connected things, safely (الأشياء المتصلة بأمان) | Explain what makes a thing part of the Internet of Things: a sensor, a small computer and a connection. Give examples at home, at school and in town. Protect yourself: permissions, default passwords, and what you share. | `permissions` | IOT.2, IOT.4, DC.4.2 |

## `iot-s2` Build a circuit (students, level 2)

**ابنِ دائرة كهربائية.** Get your hands on electronics: make an LED light up safely, use switches to make decisions, count
in binary like a computer, and meet the microcontroller, the tiny computer inside smart devices.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Make it light up (اجعلها تضيء) | Build a complete circuit with a battery, wires and a bulb or LED. Sort materials into conductors and insulators by testing them. Explain why an LED needs a resistor and why a short circuit is dangerous. | `circuit` | IOT.3, DC.5.1 |
| 2 Switches that decide (مفاتيح تتخذ القرار) | Explain AND, OR and NOT with switches and lights. Fill in a truth table for a simple rule. Design the logic for a real device, like a fan or an alarm. | `logic` | IOT.3, DC.3.4 |
| 3 Talk in binary (تكلّم بالنظام الثنائي) | Count from 0 to 31 in binary with place values. Explain that every reading, message and photo is stored as bits. Work out why more bits mean more detail but more data. | `binary` | IOT.1, DC.3.4 |
| 4 Meet the microcontroller (تعرّف على المتحكّم الدقيق) | Say what a microcontroller is and where you find one. Explain a program that reads a sensor, decides and acts, again and again. Write a night-light program as blocks or a flowchart. | `adc` | IOT.3, DC.3.4 |

## `iot-s3` Make it automatic (students, level 3)

**اجعلها تعمل وحدها.** Make devices that look after themselves: write IF/THEN rules, choose when they should switch, make
them log what they sense, and power them with batteries and the sun.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 IF this, THEN that (إذا حدث هذا، فافعل ذاك) | Write a rule as IF a condition THEN an action. Combine conditions with AND and OR to make better rules. Test rules through a day and fix the ones that go wrong. | `rules` | IOT.3, DC.3.4 |
| 2 When should it switch? (متى يجب أن يعمل؟) | Choose a threshold for a rule from real readings. Explain false alarms and misses, and decide which costs more. Use two thresholds so a device doesn't flick on and off. | `threshold` | IOT.3, DC.5.1 |
| 3 A device that remembers (جهاز يتذكّر) | Decide how often a device should take readings for a job. Explain why every reading is a little wrong, and how averaging helps and costs. Plan a data log with times and units. | `sensor` | IOT.1, DC.1.2 |
| 4 Power from batteries and the sun (طاقة من البطاريات والشمس) | Explain why a device's radio uses more battery than anything else. Make a battery last longer by sleeping and sending less often. Describe how a small solar panel keeps a sensor running. | `battery` | IOT.3, DC.5.1 |

## `iot-s4` A connected world (students, level 4)

**عالم متصل.** See how billions of things talk: radios and networks, mesh networks that pass messages along, keeping
connected devices safe from attackers, and a connected project for your community.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 How things talk (كيف تتحدّث الأشياء) | Compare Bluetooth, Wi-Fi, mobile networks and LoRa by range, power and data. Follow a sensor reading from the device to an app, and say who handles it on the way. Choose a network for a device from what it needs. | `wifi` | IOT.2, DC.4.2 |
| 2 Pass it on: mesh networks (مرّرها: الشبكات المتشابكة) | Explain how a mesh passes messages hop by hop to a gateway. Find the weak points in a network and fix them with relays. Say why a mesh keeps working when one device fails. | `mesh` | IOT.2, DC.5.1 |
| 3 Keep connected things safe (احمِ الأشياء المتصلة) | Explain how attackers take over devices with default passwords, and what a botnet is. Secure a device: a new strong password, updates, and only the features you use. Decide what a device should and shouldn't collect. | `password` | IOT.4, DC.4.1, DC.4.2 |
| 4 Your connected project (مشروعك المتصل) | Turn a problem in your community into a connected design: sense, decide, act, connect. Weigh designs fairly against cost, power, safety and privacy. Present the design so others can judge and improve it. | `decision` | IOT.3, DC.5.3 |

## Labs across the track

Teachers meet `sensor`, `adc`, `datalog` and `decision` at level 1, then `circuit`, `logic`, `binary`, `adc` (level 2),
`datalog`, `rules`, `battery`, `mesh` (level 3) and `decision`, `threshold`, `malware`, `footprint` (level 4). A lab met
again at a higher level comes with a harder task (`adc` at level 2: how many bits; `datalog` at level 3: the median and
the record of what was removed; `decision` at level 4: weights agreed with the people affected).
