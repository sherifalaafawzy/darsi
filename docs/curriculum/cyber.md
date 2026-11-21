# Cyber security: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of October 2026 in
this file; the facts, labs and placement notes at the end are kept from it. What all tracks share (the Python
ladder, the home of each shared idea) is in `docs/CURRICULUM.md`; how to write a course is in the `darsi-course`
skill. The university students' path is built from the user's "Darsi University" drafts (UNI-CYBER, Cybersecurity
and Digital Trust Foundations), which are unreviewed.

## The track in one look

A teacher who finishes the track can keep their own accounts and devices safe, protect pupils' data, and lead a
school's cyber safety. A student ends, at university, able to review a small system defensively: say what matters,
find the weak points, fix two of them and prove the fixes work. Every course teaches defence only. The track never
assumes another track, and no course below the university capstone asks anyone to write code.

- **Track line (en):** Starts from zero: safe passwords, scams, devices and personal data, then how attacks and defences work. No coding; only the university capstone needs Python and a computer.
- **Track line (ar):** يبدأ من الصفر: كلمات مرور آمنة، وكشف الاحتيال، وحماية الأجهزة والبيانات الشخصية، ثم كيف تعمل الهجمات ووسائل الدفاع. لا برمجة فيه، إلا المشروع الختامي الجامعي الذي يحتاج إلى بايثون وحاسوب.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `cyber-1-1` Passwords and phishing | make passphrases, spot a scam message, lock down a phone and run a safe school group | No experience needed. | 4 standard passes |
| 2 Elementary | `cyber-2-1` Protecting devices and data | explain what updates, backups, a second sign-in step and encryption each protect, and set them up | `cyber-1-1` | 3 standard passes, 1 rewrite |
| 3 Intermediate | `cyber-3-1` Privacy and school data | protect pupils' data in lists, apps, photos and incidents | `cyber-2-1` | 4 standard passes |
| 4 Advanced | `cyber-4-1` A cyber-safe school | write the policy, rank the risks, run a drill and plan the teaching for a whole school | `cyber-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `cyber-s1` Safe online: passwords and tricks | make a long password, spot a trick, keep a code to yourself and tell an adult when something goes wrong | No experience needed. | 4 rewrites |
| Lower secondary (12–15) | `cyber-s2` Your digital footprint | see what your posts and your phone give away, share with care and stand up to bullying | No experience needed. | 3 standard passes, 1 rewrite |
| Upper secondary (15–18) | `cyber-s3` How attacks work, and how to defend | explain how malware, tricks on people and password attacks work, and choose the defence for each | No experience needed. | 4 standard passes |
| University, start | `cyber-m1` Cyber security from zero: permission, assets and risk (new) | say what is allowed, what is worth protecting, and which risks come first | No experience needed. | 4 new lessons |
| University | `cyber-m2` Passwords, second steps and recovery (new) | explain how accounts are broken into, and design a safer sign-in and recovery | `cyber-m1` | 4 new lessons |
| University | `cyber-m3` Social engineering and verification (new) | read a message, a sender and a link, and verify a request before acting | `cyber-m2` | 4 new lessons |
| University | `cyber-m4` Hashing, encryption and keys (new) | choose between a fingerprint, encryption, a keyed tag and a signature, and use a fingerprint on files | `cyber-m3` | 4 new lessons |
| University | `cyber-m5` Permissions, updates and backups (new) | review who may do what, decide which update comes first, and prove a backup comes back | `cyber-m4` | 4 new lessons |
| University | `cyber-m6` Networks, TLS and browser trust (new) | trace who carries your data, say what the padlock protects, and read a connection log | `cyber-m5` | 4 new lessons |
| University | `cyber-m7` Safe input, safe queries and other people’s code (new) | check what comes in, keep data apart from code, and audit the code you borrow | `cyber-m6` | 4 new lessons |
| University | `cyber-m8` Logs, triage and telling people (new) | take an incident from the first report to a recovery plan and an honest message | `cyber-m7` | 4 new lessons |
| University, advanced | `cyber-s4` Defenders: cryptography, networks, careers | work stored passwords, key pairs and layers of defence in the labs, and plan a first step into the profession | `cyber-m4`, `cyber-m6` | 1 rewrite, 3 standard passes |
| University, capstone | `cyber-capstone` A defensive review of a small app | scope a review, rank the risks, fix two, prove the fixes and plan recovery | `cyber-m8`, `code-m7` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `cyber-u1` Teaching cyber security at university | teach secure design, cryptography and authentication rigorously, and run offensive labs safely | `cyber-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **University students get a path from zero: eight courses, then a capstone.** Today a university student meets
   the track at `cyber-s4`, which assumes passphrases, two-step sign-in, phishing, what encryption and a key are,
   Caesar's cipher, HTTPS, updates and backups: the three school courses. The user's Darsi University drafts give
   the whole subject in eight modules. Each module becomes one course of four lessons, `cyber-m1` to `cyber-m8`:
   the module's three lessons, and a fourth built on its practical task, which is that lesson's project.
   `cyber-m1` is the starting course and needs nothing.
2. **A module lesson is cut to one outcome.** The drafts give each lesson two outcomes and up to nine terms. Here
   each lesson keeps its main outcome and at most four new terms; the rest goes to its reading and practice. Two
   modules needed more: in `cyber-m1` the second lesson is split in two and the third joins the task; in
   `cyber-m7` output encoding joins lesson 2 and dependency risk becomes lesson 3. Each module's quiz and "Check
   yourself" questions feed the unit check, and its learner guide ships in the kit as a study guide.
3. **Phone first.** The drafts expect a computer with Python for 24 of their 40 exercises and for every task. In
   Darsi every university lesson works on a phone: the idea in the video, a Labs app, and code that is shown and explained with guided
   steps. A computer is needed only for the capstone and for optional exercises in the study guide. Decision 1
   lists what runs where.
4. **`cyber-s4` moves to the end of the university path.** It no longer has to carry the whole subject. It needs
   `cyber-m4` and `cyber-m6`, opens each lesson with a short reminder, and goes further in the labs: stored
   passwords, a key pair made by hand, layers of defence, and careers, which no module covers.
5. **One capstone, built on the drafts' defensive review.** The capstone moves from level 3 (upper secondary) to
   the end of the university path. Its required part becomes the review of a small app the course owns, which
   uses exactly what the eight courses teach and needs only Python. Today's milestones (a practice shop behind a
   proxy, passive scans, detection in logs) stay as an optional second part for students who can run Docker.
6. **The primary course is written again for ages 9 to 12.** `cyber-s1` was written for 12 to 16: it talks about
   email, WhatsApp, social media shops and mobile money, asks for two-step sign-in on WhatsApp (which has an age
   limit), and its videos are longer and denser than a primary video may be. The four topics stay; the examples
   become a game account, a school account and a family phone.
7. **Teachers learn how secrets are kept, in the lessons where they already meet them.** `docs/CURRICULUM.md`
   asks for a teachers' lesson on hashes, encryption and signatures. It joins `cyber-2-1`: the Wi-Fi lesson
   (`cyber-2-1-4`) is rewritten around encryption and keys, with the café as its worked case and Caesar's cipher
   by hand as its class activity. Hashes stay in the backup lesson (`cyber-2-1-2`), which already has the `hash`
   lab. The router set-up that crowded the Wi-Fi video moves to its reading and to the risk lesson. So
   `cyber-4-1-4`, which uses the `caesar` lab, now has an earlier lesson to stand on. Signatures are not taught
   to school teachers: AI security teaches them where it uses them, and `cyber-u1-2` teaches lecturers.
8. **Malware gets a name for teachers; social engineering stays inside phishing.** `cyber-2-1-1` used the word
   malware and the `malware` lab without ever defining it: it becomes a term there. Tricks by phone are already
   part of `cyber-1-1-2`, the lab of `cyber-3-1-4` and the drill in `cyber-4-1-3`, so no lesson is added.
9. **Bullying online has a home.** For students it is `cyber-s2-3`, rewritten so that a photo of a classmate
   going round a group is its worked case; rumours keep one scene, and deepfakes one sentence, because AI and AI
   security teach them. The primary course tells a 9-year-old the same three steps for an unkind message as for
   a trick. Teachers meet it in `cyber-1-1-4` (group rules) and `cyber-4-1-4` (when a pupil tells you).
10. **Nothing is taught twice.** Permissions, backups, passphrases, two-step sign-in and impersonation each
    appear at two teachers' levels. The later lesson opens with "At level 1 you…" and lists only what is new.
11. **Every course says what it expects, and every video gets the standard pass.** No cyber summary has a
    "Before this" line today. All hooks below end on a question the lesson answers; every promise becomes "By
    the end, you'll be able to…"; a case comes before the first definition; every video names the next lesson.
12. **`cyber-1-1` is a pack course.** Its storyboards are `CY-1-1-n`, it was imported with
    `scripts/import-packs.mjs` (never run it with `--force`), and its examples are Nigerian-flavoured (naira,
    airtime). It gets the standard pass like any other course. Whether its one naira amount stays is the
    user's call: the project notes list it as open.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| Passphrase; one password per account; PIN and one-time code are never shared | `cyber-1-1-1` | `cyber-2-1-3`, `cyber-3-1-1`, `cyber-4-1-1` |
| Phishing; warning signs; check through another channel | `cyber-1-1-2` | `cyber-1-1-4`, `cyber-3-1-4`, `cyber-4-1-3` |
| Screen lock, updates, app permissions, backup, as habits | `cyber-1-1-3` | `cyber-2-1-1`, `cyber-2-1-2`, `cyber-3-1-2` |
| Group admin; two-step verification; impersonation | `cyber-1-1-4` | `cyber-2-1-3`, `cyber-3-1-3` |
| Vulnerability; malware; end of support | `cyber-2-1-1` | `cyber-2-1-2`, `cyber-3-1-4`, `cyber-4-1-2` |
| The 3-2-1 rule; ransomware | `cyber-2-1-2` | `cyber-3-1-4`, `cyber-4-1-2`, `cyber-4-1-3` |
| Hash, a fingerprint of a file | `cyber-2-1-2` | AI security (`aisec-3-1-4`) |
| Two kinds of proof; passkey | `cyber-2-1-3` | `cyber-3-1-1`, `cyber-4-1-1`, `cyber-4-1-2` |
| Encryption; key; HTTPS; end-to-end | `cyber-2-1-4` | `cyber-4-1-2` (an encrypted backup), `cyber-4-1-4` (the secret-codes activity) |
| Personal and sensitive data; collect less | `cyber-3-1-1` | `cyber-3-1-2` to `cyber-3-1-4`, `cyber-4-1-1`, and five other tracks |
| Minimum age; anonymise ("Pupil A") | `cyber-3-1-2` | `cyber-4-1-4` |
| Consent; digital footprint | `cyber-3-1-3` | `cyber-4-1-4` |
| Data incident; contain, report, assess, notify, learn | `cyber-3-1-4` | `cyber-4-1-3` |
| Likelihood times impact; control; owner | `cyber-4-1-2` | `cyber-4-1-3` |

Students (each stage starts again, at its own depth; a blank means the stage does not teach it):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A long password from random words; one for each account | `cyber-s1-1` | | `cyber-s3-3` | `cyber-m2-1` |
| Spot a trick by what it asks for; check another way | `cyber-s1-2` | | `cyber-s3-2` | `cyber-m3-1`, `cyber-m3-3` |
| A code is a key; a second step at sign-in | `cyber-s1-3` | | `cyber-s3-3` | `cyber-m2-2` |
| When it goes wrong: stop, keep it, tell | `cyber-s1-4` | `cyber-s2-3` | `cyber-s3-1` | `cyber-m3-3`, `cyber-m8-3` |
| Being kind; bullying in a group | `cyber-s1-4` | `cyber-s2-3` | | |
| Digital footprint; small details add up | | `cyber-s2-1` | | |
| Permissions; only what the job needs | | `cyber-s2-2` | | `cyber-m5-1` |
| What a network's owner sees; the padlock | | `cyber-s2-4` | `cyber-s3-4` | `cyber-m6-1`, `cyber-m6-2` |
| Malware, updates, backups | | | `cyber-s3-1` | `cyber-m5-2`, `cyber-m5-3` |
| Encryption and keys | | | `cyber-s3-4` | `cyber-m4-2` |
| Permission first; a written scope | | | | `cyber-m1-1` |
| Asset, threat, vulnerability, control; risk | | | | `cyber-m1-2`, `cyber-m1-3` |
| Residual risk | | | | `cyber-m1-4`, then `cyber-m8-3` |
| Fingerprint of a file (hash) | | | | `cyber-m4-1`, then `cyber-m5-4` |
| Keyed tag, signature, stored passwords | | | | `cyber-m4-3`, worked in `cyber-s4-1` and `cyber-s4-2` |
| Data kept apart from code | | | | `cyber-m7-2` |
| Logs, timelines, response | | | | `cyber-m8-1` to `cyber-m8-4` |

## The courses

### `cyber-1-1` Passwords and phishing
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** make a passphrase you can remember and keep codes to yourself; recognise a phishing message and check it another way; switch on the settings that protect a phone; run a school group that keeps pupils' details out.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** your passwords, the messages that try to get them, the phone that holds everything, then the groups where a school talks.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Passphrases you can remember | tell a password a program guesses fast from one it cannot, and make a passphrase you can remember | My password has a capital, a number and a symbol. It is my name, an at sign and my birth year. The website called it strong! So why is it one of the first a thief would try? | passphrase; PIN; one-time code; reusing a password | password | S |
| 2 | Spot a phishing message | recognise a phishing message by its warning signs, and check it through another channel before you act | A text arrived last night, in the ministry’s name. Your salary is on hold: confirm within twenty-four hours. My salary, on hold, by text? How could I find out if it was real, without tapping anything? | phishing; link; attachment; another channel | phishing | S |
| 3 | Lock down your phone | name the six settings that protect a phone and what each one stops, and switch on the ones yours is missing | Three colleagues showed me their phones at break. One has the lock code one-two-three-four, and one a game that reads every message. The third left hers on a bus. What should each of them have set up before today? | screen lock; update; app permission; backup | permissions | S |
| 4 | Safer school WhatsApp groups | set up a school group so that only the right people post, and say what never goes in it | Last night I was added to a huge group I never joined. A parent posted our whole mark sheet in the class group. Then the head teacher messaged me, asking for airtime. Which of these could I have stopped? | admin; two-step verification; privacy setting; impersonation | footprint | S |

- **Unit check:** unchanged.
- **Changes:** the content stays. Mr Okafor, Ms Salma, Mr Joseph and Ms Amina tell the same four stories; each now ends on a question the lesson answers (two ended on a statement, and lesson 1's second check asked about a bank call, not the hook). The first teaching scene of lessons 2 and 4 is a definition: a case comes first. Lesson 4's lab (`footprint`) shows why pupils' details stay out of big groups; its prompt says so. The summary gains "No experience needed."

### `cyber-2-1` Protecting devices and data
- **For:** teachers, level 2 Elementary
- **Status:** revise
- **After it, you can:** explain what a security update fixes and how malware gets in; keep three copies, one of them unplugged and tested; explain why a second proof stops a thief; explain how encryption with a key hides what you send.
- **Before this:** `cyber-1-1` “Passwords and phishing” (Cyber security, level 1).
- **Python:** none
- **The path:** what gets in, what comes back after a loss, what proves it is you, and how a secret stays secret on someone else's network.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Updates close the door | explain what a security update fixes and how malware gets in, and set a device to update itself | Every morning my phone says: update ready. Every morning I press Later. The phone works fine! So what am I leaving open? | vulnerability; malware; end of support | malware | S |
| 2 | Back it up: lose a phone, not your work | explain why three copies beat one, and keep one copy that malware cannot reach and that you have tested | My phone slipped into a bucket of water at break. It held three years of class photos, my marks and every parent’s number. The phone is dead. Is everything on it gone too? | the 3-2-1 rule; ransomware; hash | hash | S |
| 3 | Two-step sign-in and passkeys | explain why a second proof stops a thief who has your password, and choose the strongest second step you can use | Last night my phone showed a warning. Someone was trying to sign in to my email, with the right password. They still could not get in. What stopped them? | two-step sign-in; authenticator app; passkey; SIM swap | twofactor | S |
| 4 | Wi-Fi and the padlock: how secrets are kept | explain how encryption with a key hides what you send from whoever runs the network, and predict what they can still see | I’m marking at a café, on the free Wi-Fi. I’ve just typed my password into the school portal. The café owner runs this network. So what did he just see? | encryption; key; HTTPS; end-to-end encryption | wifi | R |

- **Unit check:** two questions change with lesson 4: one asks what a key does, one what the café owner still sees.
- **Changes:** lesson 1 defines malware in one sentence with an example (a cracked program from a shared stick) before the lab shows it spreading; "cracked software" stays in plain words. Its video says home computers get Windows 10 fixes until October 2027 and its reading says October 2026: check the date and make them agree. Lesson 2 keeps the hash as the last step of its worked case (three copies, one unplugged, then check the copy by its fingerprint), so the lab continues the video. Lesson 3 opens with "At level 1 you set a PIN on WhatsApp". Lesson 4 is rewritten: Ms Amina's pupils pass a note in a shifted alphabet (show), then encryption and key are named, then the café is worked in the `wifi` lab; end-to-end encryption in chat apps and "the padlock means private, not honest" widen it. Money over mobile data and "a network's name proves nothing" stay; VPNs and the router set-up (admin password, WPA2 or WPA3, a guest network) move to the reading. The class activity becomes Caesar's cipher on paper. The summary names `cyber-1-1`.

### `cyber-3-1` Privacy and school data
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** apply "collect less, protect more" to the lists and forms a school really uses; check an app or an AI tool before a class uses it; judge which photos are safe to post; handle a data incident in five steps.
- **Before this:** `cyber-2-1` “Protecting devices and data” (Cyber security, level 2).
- **Python:** none
- **The path:** what pupils' data is, what you hand to apps, what you show the public, and what to do on the day it goes wrong.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Pupils’ data: collect less, protect more | sort what a school holds into needed, sensitive and not needed, and choose the safest way to share a result or a list | The results are out, and the parents’ group is waiting. One tap would post forty names and forty marks. But would I want other families reading my own child’s mark? So how should the results go out? | personal data; sensitive data; collect less (data minimisation); data protection law | breach | S |
| 2 | Apps, permissions and AI tools in class | check an app or an AI tool against four questions before a class uses it, and give it only the data its job needs | A colleague showed me a free quiz app. My pupils loved it. Then I read what it asks for: their location, their contacts and the microphone. What should I have checked before the first lesson? | minimum age; anonymise; private window | permissions | S |
| 3 | Social media, pupils’ photos and you | judge whether a pupil’s photo is safe to post, and fix it when it is not | Sports day was wonderful, and I took forty photos. Tonight I want to post the best ones on the school page. Parents will see them, and so will strangers. Which photos are safe to post? | consent; location tag; digital footprint | footprint | S |
| 4 | When data goes wrong: handling an incident | apply the five steps to a data incident in the right order, starting with what stops the damage | My phone was in my bag on the bus this morning. Now it is gone. It holds the class groups, pupils’ numbers and photos of their marks. What do I do in the next hour? | data incident; contain; regulator; incident log | social | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1 is the home of pupils' data for teachers in every track. It already teaches from zero; its recap gains the line the other tracks quote, "share the task, not the child", and lesson 2 applies it to AI tools ("Pupil A"). Lesson 2 opens with "At level 1 you switched off a torch app's permissions"; permission is no longer a new term there, and impersonation is no longer one in lesson 3. Lesson 4's worked case becomes the one its lab shows: a call from "IT support" gets a teacher's code, her email starts sending scams, and the five steps follow. The summary names `cyber-2-1`.

### `cyber-4-1` A cyber-safe school
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** write a one-page policy colleagues will follow; rank a school's risks and give each an owner; run an incident drill; plan cyber safety teaching across subjects and ages.
- **Before this:** `cyber-3-1` “Privacy and school data” (Cyber security, level 3).
- **Python:** none
- **The path:** write the rules, decide what to fix first, rehearse the bad day, then teach the whole school.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A one-page cyber safety policy | write a one-page policy with colleagues, with password rules taken from current guidance | Our school has rules for staying safe online. They fill twelve pages, in a folder, in the head teacher’s cupboard. Nobody has read them, and I’m the one in charge of them! What would make people read them? | cyber safety policy; cyber lead; acceptable use agreement | password | S |
| 2 | Risk assessment: what could go wrong? | score a school’s risks by likelihood and impact, and give the top ones a control, an owner and a date | A power cut last term killed our office computer. It was two weeks before exams, and the papers were only on it. We had worried about hackers all year. So how should a school decide what to worry about first? | asset; likelihood and impact; control; risk register | decision | S |
| 3 | Incident drills: practise before it happens | run a 30-minute drill with four roles, and turn what it reveals into changes with owners | At seven in the morning, a parent phoned me. Why is the school page selling cheap laptops? It had been taken over in the night. Who should do what, and who should speak to parents? | tabletop exercise; inject; communications lead; no-blame culture | phishing | S |
| 4 | Teaching cyber safety across the school | plan a term of short cyber safety activities across subjects and ages, and respond safely when a pupil tells you about harm | Every year we hold one cyber safety assembly. The pupils love it. A month later, one of them sent her sign-in code to a stranger in a game. So what would have made it stick? | spiral curriculum; safeguarding lead; sextortion; disclosure | caesar | S |

- **Unit check:** unchanged.
- **Changes:** Ms Salma, the school's cyber lead, tells lessons 1 to 3 and Mr Okafor lesson 4; the stories stay and each ends on a question. Passphrase is no longer a new term in lesson 1. In lesson 2 the school router that still has the password it came with becomes one of the worked risks (it left `cyber-2-1-4`). In lesson 3 the turns of the drill's story are called injects: "update" already means a software fix in this track. Lesson 4's lab prompt opens with "At level 2 you hid a note by shifting letters; now crack one by counting letters, to prepare the maths activity." The summary names `cyber-3-1`.

### `cyber-u1` Teaching cyber security at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach secure design through threat models of systems students use; teach key exchange, signatures and password storage with labs on made-up data; run offensive teaching under written rules, on an isolated lab, assessed by write-ups.
- **Before this:** `cyber-3-1` “Privacy and school data” (Cyber security, level 3), or you already teach the subject. Lesson 2 uses powers and remainders.
- **Python:** none
- **The path:** design before attack, secrets agreed in public, passwords stored so a leak is not a disaster, then the rules that make teaching attack safe.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Security principles and threat modelling | teach secure design through a threat model of a system students use, and assess the diagram and threat table they produce | Our department left a folder of student records open to the internet. Nobody hacked anything. A default setting was never changed. Which of my lectures should have prevented that? | fail-safe defaults; least privilege; trust boundary; STRIDE | breach | S |
| 2 | Public-key cryptography | teach key exchange and signatures with numbers small enough to work by hand, and correct the idea that encryption proves who sent a message | My students open the university portal every morning. Each browser agrees a secret with a server it has never met. The whole campus network can listen. So how does the secret stay secret? | discrete logarithm problem; digital signature; man-in-the-middle | publickey | S |
| 3 | Hashing, passwords and authentication | teach why fast hashes are wrong for passwords, with a lab on made-up accounts that measures the difference | A student team stored their app’s passwords the way my slides showed. In a class exercise the table leaked. One laptop recovered half the passwords in an afternoon. What had my slides left out? | salt; memory-hard function; phishing-resistant MFA | hash | S |
| 4 | Ethics, safe labs and CTF assessment | write the rules of engagement and build the isolated lab that offensive teaching needs, and assess with write-ups as well as flags | A keen student tried last week’s scan on the live campus network. Within minutes, security had disabled his account and phoned me. He thought he was doing his homework. What had my course failed to give him? | rules of engagement; cyber range; responsible disclosure | phishing | S |

- **Unit check:** unchanged.
- **Changes:** each hook becomes the lecturer's own case, told in the first person and ended on a question (three ended on a statement; one first sentence had 28 words). Each promise lists three topics: it becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a case comes first. Lesson 1's video speaks about ten terms; it keeps four. Its lab line describes a breach look-up the `breach` lab does not have: it names the real buttons. The readings are 180 to 220 words, under the 220 to 320 a reading needs. The summary gains its "Before this".

### `cyber-s1` Safe online: passwords and tricks
- **For:** students, primary (9–12)
- **Status:** rewrite
- **After it, you can:** make a long password from random words and keep it secret; spot a trick before you tap; say why a code is never passed on; do the right three things when something goes wrong.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** your password is a key, tricks try to get it, a code is a second key, and when something goes wrong you tell.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A password is a key | make a long password from random words, and say why you keep it secret, even from your best friend | Your friend says his password is super safe. It is his name and the year he was born. His profile shows his name, and a photo of his birthday cake! So how fast could a stranger guess it? | passphrase; guessing program | password | R |
| 2 | Spot the trick | spot three warning signs in a message, and say what to do before you tap | A message pops up in your game. You have won ten thousand free diamonds! Just type your password before midnight. How can you tell if it is real? | scam; warning sign; trusted adult | phishing | R |
| 3 | A code is a key too | say why you never read out or pass on a code that comes to a phone, and who to tell when one arrives | You are playing on your mum’s phone. A message arrives with six numbers in it. Then a player you like writes: oops, those numbers are mine, please send them! What happens if you do? | one-time code; two-step sign-in | twofactor | R |
| 4 | When something goes wrong, tell | do the three steps when something online goes wrong or feels wrong: stop, keep it, tell a trusted adult | Dina sits next to you in class. Her tablet is at home. But three friends just got a message from Dina: send me your game password! So who wrote it? | hacked account; report | breach | R |

- **Unit check:** rewritten with the lessons: ten questions about game accounts, school accounts and a family phone, none about email, mobile money or social media.
- **Changes:** all four lessons are written again for 9 to 12, and the title says "tricks", a word a 9-year-old uses. Videos are 2:15 to 2:45 (280 to 370 words; today's have 408 to 420), sentences have 14 words or fewer, and each hook is told to "you" about a child that age (today the teacher tells a story about "a student"). Nothing asks a child to open an account with an age limit: two-step sign-in is switched on "with a grown-up, on a family or a game account", and the age limit is said once ("many apps, WhatsApp among them, are for 13 and over"). Password managers, passkeys, backup codes, recovery settings and mobile money helplines leave; they return at upper secondary and university. Lesson 4 gives the same three steps for a hacked game account, a trick you fell for and an unkind message, and says "be kind". Check that the `breach` lab's words suit a 9-year-old; if not, lesson 4 uses the `password` lab's second task. The summary gains "No experience needed."

### `cyber-s2` Your digital footprint
- **For:** students, lower secondary (12–15)
- **Status:** revise
- **After it, you can:** see what a stranger can piece together from a profile; decide which apps may know where you are; decide what to pass on about other people, and help someone bullied in a group; say who can see what you do on a network.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** what you leave on purpose, what your phone gives away, what you pass on about others, and who is watching on the way.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Every post leaves a trace | find the small details in a profile that add up, and test a post before you share it | Mona’s class tries a test on her public posts. In five minutes they know her school, her birthday and her way home. She never wrote any of those down. So how did they work it out? | digital footprint; active footprint; passive footprint; screenshot | footprint | S |
| 2 | Who knows where you are? | decide which apps may use your location, and share it only with the people and for the time you choose | Ali says nobody knows where he goes after school. Then he opens his chat app. A dot on a map has followed him for three days, for his whole class group to see. Who let his phone tell? | permission; GPS; live location; approximate location | permissions | S |
| 3 | Share with care | decide whether to pass on a photo or a post about someone else, and say what you would do when a classmate is bullied in a group | A photo of Karim asleep in class is going round. By lunch, forty people have passed it on. Each of them only tapped once. So who hurt Karim? | consent; cyberbullying; rumour | factcheck | R |
| 4 | Who else is watching? | say what a Wi-Fi network’s owner, a website and an advert tracker can each see, and choose what to do on public Wi-Fi | Sara is on the free Wi-Fi at a café near school. She signs in to her favourite app and messages a friend. The café owner runs that network. So what can he see? | HTTPS; tracker; private browsing; fake hotspot | wifi | S |

- **Unit check:** one question on fakes becomes a case about a photo passed round a class group.
- **Changes:** the hooks are told about someone the learner's age (today a teacher says "I found a stranger's school…"); lesson 4's hook answered itself ("Good question. Let's find out"). Lesson 3 is rewritten: its worked case is the photo of a classmate (ask first; a mean post is not passed on; support the person, keep the messages, report, tell an adult), rumours keep one scene and the first check, and deepfakes get one sentence, since `ai-s2-3` and `aisec-s2-1` teach them. No lab is about kindness: the `factcheck` lab practises "is it true?", and the project works the bullying case on paper. This lesson is the students' home for netiquette and cyberbullying. The summary gains "No experience needed."

### `cyber-s3` How attacks work, and how to defend
- **For:** students, upper secondary (15–18)
- **Status:** keep
- **After it, you can:** explain how malware gets in and what stops it; name the trick a caller or a message is playing; explain how a leaked password is used and defend against it; encrypt and crack a message by hand, and say why modern encryption holds.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** attacks on devices, on people, on passwords, and then the one defence that is pure mathematics.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Malware: how it gets in | explain how malware gets onto a phone, and choose the defence that stops each way in | Your classmate installs a modded game: free coins, every level unlocked. A week later his phone is full of pop-ups, and his data bundle is gone. He never broke any lock. So what did he let in? | malware; trojan; ransomware; update (patch) | malware | S |
| 2 | Social engineering: hacking people | name the trick a caller or a message is playing on your feelings, and check it through another channel | A caller says he is from the school’s IT team. He knows your name, he is polite, and he is in a hurry. He only needs your password to fix your account. Is he real, and how could you tell? | social engineering; pretext; bait; another channel | social | S |
| 3 | Attacks on passwords, and the defences | explain how a leaked password is tried on other accounts, and defend yours with a unique passphrase and a second step | Your password is long, strange and full of symbols. You use it everywhere, because it is so strong. Then a small gaming forum you joined years ago gets hacked. Why is your email now in danger? | password leak; credential stuffing; passphrase; two-step sign-in | password | S |
| 4 | Secret messages: encryption basics | encrypt and crack a message with Caesar’s cipher, and explain why modern encryption cannot be cracked by trying every key | A note lands on your desk. Every word in it is nonsense, but your friend swears it is a message. She gives you one clue: the number three. How do you read it? | encryption; key; ciphertext; end-to-end encryption | caesar | S |

- **Unit check:** the review found about one question on lesson 2: move one from lesson 3.
- **Changes:** the course already starts from zero for a 16-year-old, with two gaps. Lesson 3 tells learners to turn on two-step sign-in and never says what it is: it becomes a term there, and "brute force" becomes plain words ("trying every combination"). Lesson 1 names five kinds of malware in one video (470 words): it keeps trojan and ransomware; virus, worm and spyware go to the reading. Hooks are told to "you"; lesson 4 defined encryption before showing the note, and promised the answer inside the hook. The summary gains "No experience needed."

### `cyber-m1` Cyber security from zero: permission, assets and risk
- **For:** students, university
- **Status:** new
- **After it, you can:** decide whether an activity is allowed under a written scope; say what a group must protect and from what; rank its risks; choose protections people will really use, and say what risk remains.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** permission first, then what is worth protecting, then how to weigh the risks, then a plan people will follow.
- **Phone or computer:** phone only. The drafts' programs (a scope checker, a risk register) become tables worked by hand.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Permission first | decide whether an activity is inside a written scope, and explain why good intentions do not make it allowed | Your classmate asks a favour. She wants you to try a few passwords on her university email, to see if it is strong. She owns the account, and she said yes. So why should you still say no? | authorisation; scope; deny by default; responsible disclosure | — | N |
| 2 | Assets, threats and weak points | tell an asset, a threat, a vulnerability and a control apart in a real case | Your robotics society keeps its member list in a shared folder. Anyone with the link can open it, and the link sits in an old group chat. Nothing bad has happened yet. So where is the weak point? | asset; threat; vulnerability; control | breach | N |
| 3 | Three needs, and how big is the risk | say which of three needs a failure broke, and rank risks by likelihood and impact with your reasons | Three bad weeks hit your robotics society. Its member list goes public, an invoice’s bank details are altered, and the shared files vanish before the fair. Nothing was stolen. So what went wrong each time? | confidentiality; integrity; availability; risk register | decision | N |
| 4 | A plan people will follow | choose protections within the effort people will give, and record the risk that remains with an owner and a date | Your society’s president sets a new rule. Every officer must change their password each month. By March, every password is the society’s name plus a number. So is the society any safer? | friction; residual risk | password | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them society cases to decide.
- **Changes:** new, from Module 1. Module lesson 2 carries nine terms, so it is split: the four words (lesson 2), then the three needs and the risk score (lesson 3). Module lesson 3, on usability, joins the task as lesson 4: its project is the threat model of the made-up Darsi Robotics Society (scope, asset table, ranked risks, a plan within a friction budget, what remains). Lesson 1 has no Labs app: its lab scene is a second worked case, a list of requests checked against a scope. The `breach` lab in lesson 2 names two-step sign-in; the prompt explains it in a clause.

### `cyber-m2` Passwords, second steps and recovery
- **For:** students, university
- **Status:** new
- **After it, you can:** explain how passwords fail, and choose length, a different one for each account and a manager; compare second steps by what each stops; find the weakest way into an account and design a safer recovery.
- **Before this:** `cyber-m1` “Cyber security from zero: permission, assets and risk” (Cyber security, university).
- **Python:** shown and explained
- **The path:** how a password fails, what a second proof adds, the other way in behind every login, then three whole policies compared path by path.
- **Phone or computer:** phone only. The policy checker, the one-time code and the lock-out simulation are shown and explained; the `twofactor` lab makes real codes from the time.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How passwords fail | explain how guessing and reuse break a password, and choose length, a different password for each account and a manager over symbol rules | The student portal wants a capital, a number and a symbol. You type Welcome2026 with an exclamation mark, and it says: strong. Thousands of students typed something very like it. So who is that rule protecting? | authentication; credential stuffing; passphrase; password manager | password | N |
| 2 | A second proof, and its limits | explain how a code from your phone is made, and compare second steps by what each one stops | At midnight your phone asks: are you signing in? You are in bed, signing in to nothing. It asks again, and again. What happens if you tap yes, just to make it stop? | factor; multi-factor authentication (MFA); authenticator app; passkey | twofactor | N |
| 3 | Recovery: the other way in | find the weakest path into an account, sign-in or recovery, and say how to strengthen it | Your email has a long password and a code from your phone. The reset link asks only one thing: the name of your first school. Your first school is on your public profile. So how strong is your account, really? | account recovery; weakest path; backup codes | — | N |
| 4 | Three account policies, compared | compare account policies path by path, and design a recovery with a notice, a delay and a checked help desk | The student portal locks an account after five wrong passwords. The night before results, you mistype yours five times. You are locked out until the office opens. Is there a rule that stops a guesser, but not you? | lockout; throttling | breach | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them accounts to judge.
- **Changes:** new, from Module 2. Lock-out and throttling move from module lesson 3 to lesson 4, where the three policies of the made-up student portal are compared; the project is that comparison and a recovery flow in numbered steps. Online and offline guessing, and password spraying, are in the readings. Every password in the course is made up.

### `cyber-m3` Social engineering and verification
- **For:** students, university
- **Status:** new
- **After it, you can:** name the lever a message is pulling; read where a sender's address and a link really lead; verify a request through a channel you already had; sort a set of messages and write a checklist a busy person can follow.
- **Before this:** `cyber-m2` “Passwords, second steps and recovery” (Cyber security, university).
- **Python:** shown and explained
- **The path:** how people are persuaded, how to read a sender and a link, why the request decides, then eight messages and a checklist.
- **Phone or computer:** phone only. Links are read as text and never opened; nothing is ever sent.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How social engineering works | name the lever a message is pulling, and explain why a clean-looking message can still be the dangerous one | Your society’s treasurer gets an email from the president’s real address. It is polite, well written, and asks her to pay an invoice to new bank details. Nothing in it looks wrong. So what should make her stop? | social engineering; persuasion lever; phishing; payment fraud | phishing | N |
| 2 | Where does this link really go? | find the name that controls a link by reading it from the right, and spot a lookalike | A message from IT Service Desk gives you a link. Its address begins with portal dot darsi dot example, exactly like the real portal. It goes on a little longer after that. So whose site is it? | display name; host; domain; lookalike domain | phishing | N |
| 3 | Verify through a channel you already had | check any request for money, codes or data through contact details you already had, and say what to do after a mistake | The bank’s fraud team phones you. They know your name and your last payment, and they give you a number to call back. You call it, and the same friendly voice answers. Have you just checked who they are? | out-of-band verification; process control; blame-free reporting | social | N |
| 4 | Eight messages and a checklist | sort messages into report, verify, check or fine, with the evidence for each, and write a checklist a busy officer can follow | Your society’s inbox has eight new messages. One asks for gift cards, one changes a supplier’s bank details, and one is only the timetable. An officer has ten minutes before class. Which does she deal with first, and how? | triage; verification checklist | classifier | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them messages to judge.
- **Changes:** new, from Module 3. Attachments, the mail checks (SPF, DKIM, DMARC) and names in other alphabets are in lesson 2's reading and practice. The `phishing` lab is used twice with different jobs: the levers in each message (lesson 1), then only the sender's address and the link's host (lesson 2). The `classifier` lab in lesson 4 shows what a rule-follower misses, which is one of the task's questions. Learners never write or send a phishing message, and the course says why: without authorisation, a "test" on classmates is deception.

### `cyber-m4` Hashing, encryption and keys
- **For:** students, university
- **Status:** new
- **After it, you can:** use a fingerprint to detect a change, and say what a match does not prove; explain what a key does and why home-made scrambling fails; choose between a fingerprint, encryption, a keyed tag and a signature for a job.
- **Before this:** `cyber-m3` “Social engineering and verification” (Cyber security, university).
- **Python:** shown and explained
- **The path:** detect a change, hide the content, prove who made it, then do it on three real files and explain the result.
- **Phone or computer:** phone. The `hash`, `caesar` and `supplychain` labs do the work, and SHA-256 also runs in the phone's Python (`hashlib.sha256`). The keyed tag and the slow password hash are shown, not run.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Fingerprints of data: hashing | use a SHA-256 fingerprint to tell whether a file changed, and say what a matching fingerprint does not prove | Your society’s treasurer sends the budget file to the committee. On the way, one figure changes from nine hundred to nine thousand. The file’s name and date look the same. How could the committee know? | cryptographic hash; digest; one-way; avalanche effect | hash | N |
| 2 | Encryption and keys | explain how a key hides content and gives it back, tell one shared key from a public and private pair, and say where a key must not be kept | A classmate writes his own program to scramble the society’s member list. The scrambled file looks like pure noise, and his program turns it back perfectly. He is proud of it. What has his test not shown him? | encryption; key; symmetric encryption; public-key cryptography | caesar | N |
| 3 | The right tool: fingerprint, key or signature | choose between a fingerprint, encryption, a keyed tag and a signature for a job, and give the reason | Your society keeps a list of file fingerprints, to catch changes. The treasurer spots a gap: whoever can edit the files can edit the list too. Every check would still pass. What is the list missing? | HMAC; digital signature; salt; password hash | supplychain | N |
| 4 | Three files, one change | list the fingerprints of a set of files, find which one changed, and explain to the officers what the result shows and what it cannot | You add one space to the end of the society’s minutes. Nobody could ever see it on screen. The file’s fingerprint changes completely. Is that a false alarm, or the tool doing its job? | manifest | hash | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them "which tool for this job?".
- **Changes:** new, from Module 4. Lesson 3's main outcome is choosing the tool; how a site stores passwords (a salt and a slow hash) is in its reading and practice, and is worked in the lab in `cyber-s4-1`. Authenticated encryption, "the method is public, the key is secret" and key care are in lesson 2's reading. The draft's home-made cipher stays labelled a deliberate teaching error; in the video, the `caesar` lab plays its part: scrambled text that looks safe and is cracked in a minute. The `supplychain` lab speaks of a downloaded AI model; the prompt says "a downloaded file". The project is the task: a manifest of three files, two changes, what a rewritten manifest hides, and a restore.

### `cyber-m5` Permissions, updates and backups
- **For:** students, university
- **Status:** new
- **After it, you can:** compare the access people have with what their role needs; decide which update comes first; design a backup plan and prove with a drill that it comes back.
- **Before this:** `cyber-m4` “Hashing, encryption and keys” (Cyber security, university).
- **Python:** shown and explained
- **The path:** who may do what, which holes are already known, what comes back after a loss, then a drill that proves it.
- **Phone or computer:** phone for the lessons. The restore drill on real folders needs a computer; on a phone it is a guided drill on three short texts. File permission bits are shown for Linux and macOS only, as the draft ran them.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Only what the role needs | compare the access each person has with what their role needs, and remove what is left over, starting with people who have left | Last year’s treasurer left the society in June. In November, her account can still open the member list and the bank folder. She has done nothing wrong, and nobody has complained. So why is that a risk? | least privilege; role; separation of duties; file permission | permissions | N |
| 2 | Updates: closing known holes | match what you run against published fixes, and decide which update comes first | Your laptop has asked to update for three weeks. You press Later every time, because it works fine. This week the maker published exactly which hole that update closes. Who else has just read that notice? | patch; advisory; inventory; end of life | malware | N |
| 3 | Backups that come back | design a backup plan with three copies, one of them offline, and say how much recent work you could lose and how fast you must be back | Your whole project is in a folder that syncs to the cloud. A week before the deadline, half of it is deleted by mistake. You open the cloud copy: deleted there too. So was that ever a backup? | 3-2-1 rule; retention; RPO; RTO | malware | N |
| 4 | A restore drill | run a restore drill: check the backup before you trust it, restore to a separate place, verify, and only then replace the live files | Your society has made a backup every week for two years. Nobody has ever tried to get a file back from it. On Monday a folder is damaged. What will the officers find out in the next hour? | restore drill; staging | hash | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them plans or access tables to judge.
- **Changes:** new, from Module 5. Comparing versions as numbers, not text (1.10 against 1.9), is a practice question in lesson 2. The `malware` lab serves two lessons with different jobs: "Devices kept updated" (lesson 2), then "Devices with a backup" and "Unplug the infected devices" (lesson 3). The project is the task: a backup with a manifest, a damaged live copy, a check before restoring, a restore that is verified, and a one-page recovery note.

### `cyber-m6` Networks, TLS and browser trust
- **For:** students, university
- **Status:** new
- **After it, you can:** trace a request from your phone to a site and say what each party on the way can see and change; say what the padlock protects and what it leaves visible; tell whether two addresses are the same origin; read a connection log fairly.
- **Before this:** `cyber-m5` “Permissions, updates and backups” (Cyber security, university).
- **Python:** shown and explained
- **The path:** who carries your data, what the padlock promises, what the browser keeps apart, then a real log to read.
- **Phone or computer:** phone only. The logs are short tables read by hand. No scan, capture or connection is made anywhere in the course.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How data travels, and who is on the way | trace a request from your phone to a site, and mark at each boundary what that party can see and change | You open the student portal on the library’s free Wi-Fi. Before the page appears, your phone has already asked a stranger’s computer a question, in plain view. What did it ask, and who could read it? | packet; IP address; DNS; trust boundary | mesh | N |
| 2 | What the padlock promises | say what TLS protects on the way and what it leaves visible, and read a certificate warning | A page asks for your student login. The address bar shows a padlock, and the browser gives no warning. The site belongs to a scammer. How can both be true? | TLS; certificate; certificate authority; metadata | wifi | N |
| 3 | The browser’s own walls | tell whether two addresses are the same origin, and explain what stops one page reading another | You are signed in to the student portal in one tab. In the next tab, a page you do not trust is open. Both run in the same browser. So what stops that page reading your grades? | origin; same-origin policy; cookie; mixed content | — | N |
| 4 | Read the society’s connection log | read a connection log with the personal details removed, and turn what you find into questions to check, not accusations | The society’s lab network keeps a log of connections. One line shows the old booking site: no padlock, a password form, every Tuesday evening. The log cannot show what was typed. So what can you fairly say to the officers? | connection log; plaintext connection | wifi | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them "who can see this?".
- **Changes:** new, from Module 6. Reading a DNS log is lesson 1's practice; connection logs are lesson 4, with the task as its project (a diagram with every boundary marked, a table of connections, three findings phrased as questions, a note on which log fields are personal data). Extensions and VPNs are lesson 3's reading and practice; lesson 3 has no Labs app, so its lab scene is a second worked case. The certificate checks are a simplified model, as the draft says.

### `cyber-m7` Safe input, safe queries and other people’s code
- **For:** students, university
- **Status:** new
- **After it, you can:** write allow-list rules for a form and say where the check must run; explain why pasted text is read as code, and repair it with parameter binding; audit a list of borrowed code; prove a repair with ordinary cases.
- **Before this:** `cyber-m6` “Networks, TLS and browser trust” (Cyber security, university).
- **Python:** shown and explained
- **The path:** check what comes in, keep it apart from your code, check the code you borrow, then repair one program and prove the repair.
- **Phone or computer:** phone for the lessons: real SQL runs in the `sqlplay` lab, and the repair is a guided step (find the line, fill the gap). The runnable repair with its unit tests uses Python's `sqlite3`, which the phone's Python does not have: it is an optional exercise on a computer, for learners who have done `code-m7`.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Validating input | write allow-list rules for the fields of a form, and say where the check must run | A new member tries to join your society online. The form refuses her name, three times. Her name is Amal, written in Arabic, as on her student card. Who made the mistake: Amal, or the form? | validation; allowlist; normalisation | quality | N |
| 2 | Keep data apart from code | explain why text pasted into a query is read as code, and repair the query with parameter binding | The society’s loan tracker works for every member except one. When Sean O’Brien searches for his loans, it crashes. His name is spelled correctly, and he has typed nothing strange. So what is the program doing with his name? | query; injection; parameter binding; output encoding | sqlplay | N |
| 3 | Other people’s code | audit a list of borrowed code for loose versions, known warnings and lookalike names, and decide what to fix first | Your project needs a free add-on called tablekit. You type its name from memory, with one extra t. Your flatmate stops you before you press Install. What would that one letter have put on your laptop? | dependency; pinning; typosquatting | supplychain | N |
| 4 | Repair it, and prove it | repair a query that pastes text, and show with a table of ordinary cases that the repair works and nothing else broke | You have fixed the loan tracker, and Sean O’Brien can search again. Your teammate asks one question before she accepts the fix. How do you know you did not break it for everyone else? | regression test | sqlplay | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them forms or queries to judge.
- **Changes:** new, from Module 7. Module lesson 3 holds two ideas, so it is split: output encoding joins lesson 2 as its "where else" (the same mistake, at the point where data is shown on a page), and dependency risk becomes lesson 3. No attack string appears anywhere: the defect is shown with a real name that has an apostrophe, and the project's six test cases are all ordinary (a plain name, O'Brien, an Arabic name, a name with an underscore, an unknown name, a name with spaces round it). Package names are made up, and the course says not to install them.

### `cyber-m8` Logs, triage and telling people
- **For:** students, university
- **Status:** new
- **After it, you can:** say what a useful log records and what it must never hold; build one timeline from sources with different clocks; respond to an incident in order and write an honest message; triage a whole incident and plan the recovery.
- **Before this:** `cyber-m7` “Safe input, safe queries and other people’s code” (Cyber security, university).
- **Python:** shown and explained
- **The path:** record the right things, read the signals, respond in order and say it plainly, then one incident from the first report to the recovery plan.
- **Phone or computer:** phone. The three logs of the task are short enough to merge by hand; the timeline program is shown and explained.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Logging that helps, and does not harm | say what a useful log entry records, and what must never be written to a log | The society’s app writes down every sign-in. A helper asks for the file, and you are about to send it. Then you see a line that holds a member’s password in full. What else is in there? | log entry; UTC offset; structured log; redaction | — | N |
| 2 | Signals and timelines | build one timeline from sources with different clocks, and separate what the logs show from what you only suspect | An account fails to sign in six times, then succeeds. It is three in the morning, and an alert fires. The owner says she had just changed her password. How do you find out which story is true? | triage; signal; timeline; hypothesis | — | N |
| 3 | Respond, tell people, say what remains | apply the response steps in order, and write a message that says what is known, what is not, and what readers should do | The treasurer’s account has sent a fake announcement to every member. You have locked the account, and the fake post is deleted. The committee asks: is it over? What would you want to know before you say yes? | containment; eradication; severity; blameless review | decision | N |
| 4 | Triage the treasurer incident | order the events of an incident from three logs, rate its severity, and write a recovery plan in which every action has an owner and a check | A member reports an odd announcement from the treasurer’s account. You have three logs, each kept by a different clock. The committee meets in two hours. What do you tell them first? | recovery plan; time to detect | — | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself", at least four of them log lines or messages to judge.
- **Changes:** new, from Module 8. Three lessons have no Labs app that fits (no lab reads a security log): their lab scenes are second worked cases on the draft's made-up logs. Lesson 3 uses the `decision` lab for the maths of a severity score and of risk before and after a fix. Legal duties after a breach are general in the draft: the lesson says "follow your institution's procedure and your country's law", as the teachers' courses do.

### `cyber-s4` Defenders: cryptography, networks, careers
- **For:** students, university
- **Status:** revise
- **After it, you can:** trace how a site checks a password it never keeps, and show what a salt changes; make a key pair by hand and break a signature by changing one letter; place layers of defence on a network; plan a legal first step into a security job.
- **Before this:** `cyber-m4` “Hashing, encryption and keys” and `cyber-m6` “Networks, TLS and browser trust” (Cyber security, university).
- **Python:** none
- **The path:** stored passwords, two keys, layers of defence, then the people who do this for a living.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Fingerprints of data: hashing | trace sign-up and sign-in on a site that never keeps your password, and show in the lab what a salt and a slow hash change when a table leaks | The student portal’s password table leaks overnight. It holds no passwords: only a fingerprint and a random value for each student. By morning some accounts are open, and some are not. What decided which? | slow hash | hash | R |
| 2 | Locks and keys: public-key cryptography | make a small key pair by hand, lock a message with the public key, and show that a signature fails when one letter changes | A download site offers the campus app’s update. It has the right name, the right logo and the right size. Your phone refuses to install it. How did your phone know it was not from the real maker? | public key; private key; key pair | publickey | S |
| 3 | Networks and the defenders who watch them | place layers of defence on a network you use, and say which layer catches what the others miss | The campus network has a strong front gate, and it is working. One morning a laptop already inside starts sending odd traffic to the records server. The gate never sees it. So what should have stood in the way? | firewall; defence in depth; network segmentation; security operations centre | mesh | S |
| 4 | Careers in cyber security | name the main security jobs and what each does in a day, and choose a legal place to practise | A friend wants to work in security. He says he will practise on the university’s website, to build his skills. He means well, and he is good with computers. Where can he practise without ending his career before it starts? | ethical hacker; capture the flag (CTF) | classifier | S |

- **Unit check:** the questions that only repeat `cyber-m4` and `cyber-m6` are replaced by cases from the labs.
- **Changes:** the course keeps its four topics and its labs, and stops carrying the whole subject. Each lesson opens with one scene of reminder ("In “Hashing, encryption and keys” you used a fingerprint to catch a change") and spends its time on what the modules leave out: the salt switch and the sign-in in the `hash` lab; a key pair from 61 and 53; a firewall, separate networks and the team that watches the logs; the jobs, and capture-the-flag events. Lesson 1 changes most, because `cyber-m4` now teaches what a hash is: it is a rewrite. Two video checkpoints still speak of school ("a student's mark in the school's records", "tell a teacher"), and lesson 4's video still says "girls and boys", "a computing club" and "the school website": all are re-voiced for a university. Dr Farah's first job, today's hook of lesson 4, becomes its first example. Until `cyber-m4` and `cyber-m6` exist, the course stays as it is, and its summary says in plain words what it expects.

### `cyber-capstone` Capstone: a defensive review of a small app
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** write the scope of a review, model the assets and threats of a small app, rank at least five risks with evidence, fix two of them, prove the fixes with tests, plan and test a restore, and report what risk remains.
- **Before this:** `cyber-m8` “Logs, triage and telling people” (Cyber security, university) and `code-m7` (Programming, university: functions, lists, files and tests).
- **Python:** rung 2: reading a 94-line program, changing functions and writing unit tests

- **Changes:** it moves from level 3 (upper secondary) to the end of the university path. Its required part becomes the drafts' capstone: a defensive review of the made-up Robotics Society's booking app, which the course owns and which runs only on the learner's own computer (about 12 hours; Python 3.10 or newer, nothing to install; ordinary inputs only, no attack strings). It keeps today's three-part shape (description, starter, submission with `check.py` evidence), so the starter repository gains the app, its smoke tests and checks for the new milestones. Today's milestones (the practice shop behind nginx, the passive scans, `detect.py`, the runbook; about 17 hours, Docker or Codespaces) become an optional second part, "with real tools". The texts speak to a university student: "no school site" becomes "no campus or public site", and the "Arabic parent poster" becomes a poster for students. Text only here; the starter repository is another repository.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `cyber-1-1` | Teachers, Beginner | Kept. 4 standard passes. A pack course (`CY-1-1-n`). Gains "No experience needed." |
| `cyber-2-1` | Teachers, Elementary | Revised. 3 standard passes; the Wi-Fi lesson is rewritten around encryption and keys. Names `cyber-1-1`. |
| `cyber-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `cyber-2-1`. |
| `cyber-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `cyber-3-1`. |
| `cyber-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `cyber-s1` | Students, primary | Rewritten for ages 9 to 12: the same four topics, new videos. |
| `cyber-s2` | Students, lower secondary | Revised. 3 standard passes; "Share with care" is rewritten around a photo passed round a group. |
| `cyber-s3` | Students, upper secondary | Kept. 4 standard passes. Two-step sign-in is taught where it is used. |
| `cyber-s4` | Students, university, advanced | Revised and moved after the eight new courses. Names `cyber-m4` and `cyber-m6`. |
| `cyber-capstone` | Students, university, capstone | Moves from level 3 to the end of the university path; rebuilt on the drafts' defensive review. Text only. |
| (new) `cyber-m1` to `cyber-m8` | Students, university | New: eight courses of 4 lessons and a unit check, from the Darsi University drafts. |

## Work, in order

**The university drafts are not ready to narrate.** They say so themselves: no faculty or subject review, no review
of the Arabic, no phone or screen-reader check, and every program was run on Linux only (Module 5's file
permission example is for Linux and macOS; Windows was not tested). Their narration scripts are summaries of 90 to
200 words with no hook, not Darsi videos, and their Arabic is Modern Standard Arabic, while Darsi videos speak
Egyptian Arabic. Their legal content is general. They name Harvard's CS50 and Cisco's course as optional reading
only, and state that no rights were cleared. So each course below is reviewed by a person who teaches the subject
before its storyboards are written, and the hooks and outcomes in this plan are the starting point for that review.

1. **`cyber-m1` and `cyber-m2`, new** (8 lessons): the first thing a university student sees. Until they exist,
   `cyber-s4` is the only university course, and it starts in the middle.
2. **`cyber-s4`, the school sentences** (text and a few re-voiced lines): the two checkpoints and lesson 4's
   wording, now, without waiting for the full pass.
3. **`cyber-m3` to `cyber-m8`, new** (24 lessons), in order, each after its review.
4. **`cyber-s4`, then the capstone** (1 rewrite, 3 standard passes; text and the starter repository).
5. **`cyber-4-1` and `cyber-u1`, standard pass** (8 lessons): the other courses published today.
6. **`cyber-1-1`, `cyber-2-1`, `cyber-3-1`** (11 standard passes, 1 rewrite): the teachers' ladder, in order.
7. **`cyber-s3`, `cyber-s2`, `cyber-s1`** (7 standard passes, 5 rewrites): the school stages, oldest first.
8. **Text only:** every summary's last line; the capstone's level; the Windows 10 dates in `cyber-2-1-1`; the
   placement questions (see Reference).

In all: 29 standard passes, 7 rewrites, 32 new lessons, and the capstone's text. Narration is about $2.14 for both
languages. The writing and the reviews, not the narration, are the cost.

## Decisions for the user

1. **Phone first for the eight university courses?** Recommended: yes. Every lesson then works on the phone a
   student already has; a computer is needed for the capstone and for optional exercises only. What runs where:

   | Course | On the phone | Needs a computer |
   |---|---|---|
   | `cyber-m1` | everything: tables by hand; `breach`, `decision`, `password` | nothing |
   | `cyber-m2` | everything: `password`, `twofactor`, `breach`; programs shown and explained | nothing |
   | `cyber-m3` | everything: `phishing`, `social`, `classifier`; links read as text | nothing |
   | `cyber-m4` | `hash`, `caesar`, `supplychain`; SHA-256 in the phone's Python | the keyed tag and the slow password hash as running code |
   | `cyber-m5` | `permissions`, `malware`, `hash`; a guided restore drill on short texts | the drill on real folders; file permission bits |
   | `cyber-m6` | everything: `mesh`, `wifi`; logs read by hand | nothing |
   | `cyber-m7` | SQL in `sqlplay`; the repair as a guided step | the runnable repair and its unit tests (Python's `sqlite3`) |
   | `cyber-m8` | the three logs merged by hand; `decision` | the timeline program, if wanted |
   | Capstone | reading the brief | all of it: Python 3.10 or newer, or GitHub Codespaces |

   The phone runs MicroPython with `hashlib.sha256` and a small `csv`, and SQL through SQLite, with no network and
   a 3-second limit. Its Python and its SQL are separate, so a Python program there cannot run a query; whether
   its Python has `hmac`, `datetime`, `unicodedata` or `unittest` was not checked. The optional computer exercises need Python up to `code-m6` (files, CSV and JSON); those of
   `cyber-m7`, and the capstone, need `code-m7` (tests). Cost of yes: the drafts' computer exercises ship in the
   study guide as extras, and six lessons (`cyber-m1-1`, `cyber-m2-3`, `cyber-m6-3`, three in `cyber-m8`) have
   no Labs app. The other choice is a computer course, which a student with only a phone cannot follow.
2. **Which capstone?** Recommended: one capstone with two parts. The required part is the drafts' defensive
   review (about 12 hours, Python only), because it uses what the eight courses teach. Today's Juice Shop
   project stays as an optional second part for students who can run Docker or Codespaces. Cost: the capstone's
   texts, and new milestones in the starter repository. The other choices: keep today's capstone alone (it needs
   tools no course teaches), or drop it (its starter repository is already built).
3. **Keep `cyber-s4` after the eight courses?** Recommended: yes, for now. It is published, its labs go further
   than the modules do, and careers is taught nowhere else. But lessons 1 to 3 will overlap `cyber-m4` and
   `cyber-m6`; when those are live, look again, and fold lessons 1 to 3 into them if learners find them
   repetitive. Cost now: 1 rewrite and 3 standard passes, about $0.10.
4. **Rewrite `cyber-s1` for ages 9 to 12?** Recommended: yes. The smaller fix (one line about age limits) leaves
   videos written for teenagers in front of 9-year-olds. Cost: 4 rewrites, about $0.16.
5. **Keep today's `cyber-s1` lessons for lower secondary?** They were written for 12 to 16 and suit that stage
   as they are, and `cyber-s2` teaches privacy but not passwords, scams or two-step sign-in: a 13-year-old who
   starts there meets none of them until upper secondary. Recommended: yes, later, as a second lower-secondary
   course (a working id would be `cyber-s2-0`), with a standard pass. It is not counted in the work above. Cost:
   4 standard passes, about $0.08, and a new course id.
6. **How much cryptography for school teachers?** Recommended: what this plan does: encryption and keys in
   `cyber-2-1-4`, hashes in `cyber-2-1-2`, no new lesson. The other choice is a second Elementary course,
   `cyber-2-2` “How secrets are kept” (encryption, hashes, key pairs and signatures, adapted from the students'
   lessons). It would serve teachers of upper-secondary computing, AI security level 3 and lecturers on their
   way to `cyber-u1`. Cost: 4 new lessons, about $0.16.

## Reference

Kept from the plan of October 2026 where still true. That plan said students are 12 to 16: the stages are now
primary (9–12), lower secondary (12–15), upper secondary (15–18) and university.

### How the courses talk about security

- **Defence only.** Every course teaches how to protect yourself, your pupils, your school or a system you are
  allowed to review. When a lesson explains how an attack works, it says why, so the learner can see the defence.
  A hook is a near miss someone caught, never an attack to copy. No lesson contains an attack string, a scan or a
  live target, and the university courses repeat the rule in every course: only material the course owns.
- **No fear, no blame.** Being tricked is not stupid; scammers are professionals. Reporting early is praised.
- **No legal advice** beyond "check your country's law and your ministry's or institution's rules".
- **The cast.** Teachers' videos: Mr Joseph (computer studies, the colleague others ask for help), Ms Amina
  (primary), Mr Okafor (science), Dr Farah (education lecturer), and Ms Salma (maths), who is the school's cyber
  lead at level 4. In students' videos they are the students' teachers, and the hook is about someone the
  learner's age. In `cyber-u1` the hooks are a lecturer's own cases.
- **The made-up world of the university courses** is the drafts': the Darsi Robotics Society, its treasurer and
  president, the student portal `portal.darsi.example`, an old booking site, a loan tracker. Every address uses a
  reserved name (`.example`, `.test`), every network address is a documentation address, and every password,
  package and log is made up.

### Facts to keep straight

Checked October 2026, except where a line says otherwise.

- **Windows 10** left normal support on 14 October 2025. After that a Windows 10 computer gets security updates
  only through Microsoft's Extended Security Updates. The earlier plan says home computers are covered to
  12 October 2027; the reading of `cyber-2-1-1` says 13 October 2026 and its video says October 2027. Not
  verified for this plan: check Microsoft's page before the pass, and do not quote more detail than the dates.
- **Password guidance** (NIST SP 800-63B, revision 4, 2025): length over symbols (at least 15 characters when a
  password is used alone, 8 with two-step sign-in), no forced regular changes (change on evidence of a leak), no
  composition rules, check new passwords against leaked and common ones, allow pasting and password managers.
- **Passkeys** (sign in with the phone's fingerprint, face or PIN) work with Google, Microsoft, Apple and WhatsApp
  accounts and can't be phished: a passkey only works on the real site.
- **WhatsApp two-step verification** is a six-digit PIN (Settings, Account, Two-step verification); it stops
  someone who got your SMS code from moving your number to their phone. WhatsApp's minimum age is 13 in most
  countries.
- **Data protection laws:** Kenya's Data Protection Act 2019, Nigeria's Data Protection Act 2023, Egypt's
  Personal Data Protection Law 151 of 2020, South Africa's POPIA. Many set a deadline, often 72 hours, to report a
  serious breach to the regulator; the school leader decides that, so staff tell them at once.
- **Al-Kindi** (Baghdad, 9th century) wrote the first known description of breaking ciphers by counting letters.
- **Guessing:** four random words from a 7,776-word list give about 3.6 × 10¹⁵ possibilities; eight lower-case
  letters about 2 × 10¹¹, which a computer guessing ten billion a second tries in about twenty seconds; five
  random words would take it about ninety years.
- **Post-quantum cryptography:** NIST published the first standards in August 2024, and browsers and messaging
  apps have started using them.
- **In the university drafts:** SHA-256 gives 256 bits, written as 64 characters; MD5 and SHA-1 are not for
  security; a one-time code changes every 30 seconds (RFC 6238); current guidance is TLS 1.2 or 1.3; passwords
  are stored with a salted slow function (argon2id, scrypt, bcrypt or PBKDF2), and real systems use a maintained
  library, never home-made code. The drafts' password code is for teaching only.

### Competencies

DigComp 2.2 (`apps/web/src/content/competencies.ts`): DC.1.2 evaluating information, DC.2.6 digital identity,
DC.3.4 programming, DC.4.1 protecting devices, DC.4.2 protecting personal data and privacy, DC.4.3 health and
well-being, DC.5.1 solving technical problems, DC.5.3 creatively using digital technologies. DC.2.5 (netiquette)
has no lesson today; `cyber-s2-3` and `cyber-s1-4` take it if the code is added.

### Labs across the track

Teachers meet `password`, `phishing`, `permissions` and `footprint` at level 1; `malware`, `hash`, `twofactor` and
`wifi` at level 2; `breach`, `permissions`, `footprint` and `social` at level 3; `password`, `decision`, `phishing`
and `caesar` at level 4; `breach`, `publickey`, `hash` and `phishing` in `cyber-u1`. Students meet `password`,
`phishing`, `twofactor` and `breach` (primary); `footprint`, `permissions`, `factcheck` and `wifi` (lower
secondary); `malware`, `social`, `password` and `caesar` (upper secondary). The university courses use `breach`,
`decision`, `password`, `twofactor`, `phishing`, `social`, `classifier`, `hash`, `caesar`, `supplychain`,
`permissions`, `malware`, `mesh`, `wifi`, `quality` and `sqlplay`, then `hash`, `publickey`, `mesh` and
`classifier` in `cyber-s4`. A lab met again comes with a new job, which the lab step's prompt names. Four of these
labs come from other shelves and speak of other things (`supplychain` of an AI model, `quality` of rain gauges,
`sqlplay` of pupils and marks, `mesh` of farm sensors): the prompt says in a clause what stands for what.

### Placement

The cyber questions are in `apps/web/public/content/placement.json` (27 of them; there is no
`content/placement/cyber.json`). When this plan is carried out: the primary questions must be ones a 9-year-old can
answer after the new `cyber-s1` (check the wording of today's three); the university questions for students must
follow the eight courses and `cyber-s4`, and separate a university student from a school pupil; `cyber-u-2` was
replaced on 2026-11-04 by a STRIDE question, which `cyber-u1-1` teaches.
