# Cyber security: the plan

Seven new courses join the live Beginner course for teachers, `cyber-1-1` Passwords and phishing. `docs/CURRICULUM.md`
has the framework, the levels and the shape of a course; this page is what each cyber course teaches.

Every course teaches **defence only**: how to protect yourself, your pupils and your school, never how to attack. When
a lesson explains how an attack works (students' levels 3 and 4), it says why, so the learner can see the defence.

| | Teachers | Students (12–16) |
|---|---|---|
| 1 Beginner | `cyber-1-1` Passwords and phishing (live) | `cyber-s1` Safe online: passwords and scams |
| 2 Elementary | `cyber-2-1` Protecting devices and data | `cyber-s2` Your digital footprint |
| 3 Intermediate | `cyber-3-1` Privacy and school data | `cyber-s3` How attacks work, and how to defend |
| 4 Advanced | `cyber-4-1` A cyber-safe school | `cyber-s4` Defenders: cryptography, networks, careers |

The teachers' path goes from your own accounts (1), to your devices and files (2), to your pupils' data (3), to the
whole school (4). The students' path goes from safe habits (1), to what you leave online (2), to how attacks work (3),
to how defenders work, and how to become one (4).

**Competencies** are DigComp 2.2 (`apps/web/src/content/competencies.ts`): DC.1.2 evaluating information, DC.2.6
digital identity, DC.3.4 programming, DC.4.1 protecting devices, DC.4.2 protecting personal data and privacy, DC.4.3
health and well-being, DC.5.1 solving technical problems, DC.5.3 creatively using digital technologies.

**Labs** are apps in `apps/web/src/labs/apps/`. A course uses each app once; across the levels some come back with a new
job (the lab step's prompt says what to try this time).

**Cast.** Teachers' videos: Mr Joseph (computer studies, the colleague others ask for help) leads level 2, Dr Farah and
Ms Amina level 3, Ms Salma (the school's cyber lead) level 4. Students' videos: the same people as the students'
teachers, talking to the student: Mr Joseph and Ms Salma (levels 1 and 3), Ms Amina and Mr Okafor (level 2), Dr Farah
(level 4).

**Facts to keep straight** (checked October 2026):
- Windows 10 left normal support on 14 October 2025. Since then a Windows 10 computer gets security updates only if it
  is enrolled in Microsoft's Extended Security Updates: for home computers that now runs to 12 October 2027 (extended
  in June 2026); organisations pay for theirs. A school computer still on Windows 10 needs that, Windows 11 (if it can
  run it) or another supported system, or to be kept away from email, banking and pupils' records. Don't quote more
  detail than that: the programme's terms change.
- Password guidance (NIST SP 800-63B, revision 4, 2025): length over symbols (at least 15 characters when a password is
  used alone, 8 with two-step sign-in), no forced regular changes (change on evidence of a leak), no composition rules,
  check new passwords against leaked and common ones, allow pasting and password managers.
- Passkeys (sign in with the phone's fingerprint, face or PIN) work with Google, Microsoft, Apple and WhatsApp
  accounts and can't be phished: a passkey only works on the real site.
- WhatsApp two-step verification is a six-digit PIN (Settings → Account → Two-step verification); it stops someone
  who got your SMS code from moving your number to their phone.
- Data protection laws: Kenya's Data Protection Act 2019, Nigeria's Data Protection Act 2023, Egypt's Personal Data
  Protection Law 151 of 2020, South Africa's POPIA. Many set a deadline, often 72 hours, to report a serious breach to
  the regulator; the school leader decides that, so staff tell them at once. Never give legal advice beyond "check your
  country's law and your ministry's rules".
- Al-Kindi (Baghdad, 9th century) wrote the first known description of breaking ciphers by counting letters.
- Four random words from a 7,776-word list give about 3.6 × 10¹⁵ possibilities; eight lower-case letters about
  2 × 10¹¹.
- Post-quantum cryptography: NIST published the first standards in August 2024, and browsers and messaging apps have
  started using them.

---

## cyber-2-1 Protecting devices and data (teachers, Elementary)

**Summary.** Keep phones and school computers updated, back up what matters with the 3-2-1 rule, turn on two-step
sign-in and passkeys, and use Wi-Fi safely at school, at home and in town.

### cyber-2-1-1 Updates close the door
- **Objectives:** explain what a security update fixes and why delay is risky; turn on automatic updates for the
  phone's system and apps; check whether a device still gets security updates, and what to do when it doesn't.
- **Points:** an update patches a hole criminals already know about; once a fix is out, attackers study it, so the
  unpatched are the target. Automatic updates, overnight on the charger and Wi-Fi (saves data). Restart to finish. The
  phone's "security update" date (Settings → About phone). Official app stores only; no "modded" apps or cracked
  software from shared USB sticks. Windows 10 (above). An unsupported device: replace, upgrade, or keep it off email,
  banking and pupils' records. Built-in protection (Microsoft Defender, Google Play Protect) stays on.
- **Checkpoint idea:** the update is ready during a lesson: best time is tonight on the charger and Wi-Fi.
- **Lab:** `malware`: raise the share of updated devices and watch the outbreak stop.
- **Competencies:** DC.4.1, DC.5.1

### cyber-2-1-2 Back it up: lose a phone, not your work
- **Objectives:** apply the 3-2-1 rule to a teacher's files; set up an automatic backup of the phone and of WhatsApp
  chats; test that a backup can really be restored; explain why one copy must stay unplugged.
- **Points:** phones get lost, stolen and dropped in water; laptops die; ransomware locks files and asks for money
  (don't pay; restore). 3-2-1: three copies, on two kinds of storage, one away from school. What to back up: marks,
  registers, lesson plans, exam papers, photos, contacts. Sync is not a backup on its own (a deletion syncs too), but
  version history helps. A drive left plugged in gets locked with the rest. Test a restore. Encrypt or lock backups that
  hold pupils' data; label and lock away USB drives. How a computer knows a copy is exact: it compares fingerprints
  (hashes).
- **Checkpoint idea:** ransomware locks the office computer: the USB drive unplugged after Friday's backup saves you.
- **Lab:** `hash`: make the fingerprint of a file and its copy; change one letter and the copy no longer matches.
- **Competencies:** DC.4.1, DC.4.2

### cyber-2-1-3 Two-step sign-in and passkeys
- **Objectives:** explain the three kinds of factor; turn on two-step sign-in for email and WhatsApp; compare SMS
  codes, authenticator apps, sign-in prompts and passkeys; keep backup codes safe.
- **Points:** something you know, something you have, something you are. A stolen password alone stops working.
  Weakest to strongest: SMS codes (SIM swap, phishing), authenticator apps (codes made from the time, every 30
  seconds), sign-in prompts (never approve one you didn't start), passkeys and security keys (can't be phished). Backup
  codes on paper at home. A real service never asks you for the code. SIM swap: the phone suddenly shows "No service"
  for no reason: call your operator. Start with the email account: it resets everything else.
- **Checkpoint idea:** a sign-in prompt you didn't start: deny it, then change the password.
- **Lab:** `twofactor`: sign in with a code from the pretend phone and watch the thief with your password get stuck.
- **Competencies:** DC.4.1, DC.4.2

### cyber-2-1-4 Safe Wi-Fi at school, at home and in town
- **Objectives:** describe what the owner of a public Wi-Fi network can see; choose when to use mobile data instead;
  set up a home or school router safely (admin password, WPA2/WPA3, updates, a guest network).
- **Points:** on public Wi-Fi the owner sees which sites you visit; HTTPS hides what's inside; anyone can name a hotspot
  "Free_Bus_Station_WiFi" (fake hotspots). Payments, mobile money and pupils' marks: mobile data. Turn off auto-join and
  forget networks. A VPN hides your traffic from the café but its company sees it: avoid unknown free VPN apps. Router:
  change the default admin password, WPA2 or WPA3 with a long Wi-Fi password, update it, a guest network for visitors and
  pupils, apart from the office. A phone hotspot gets a password and is turned off after use.
- **Checkpoint idea:** paying a bill at the bus station with two look-alike free networks: use mobile data.
- **Lab:** `wifi`: plain HTTP, then HTTPS, then a VPN: what the café owner can read each time.
- **Competencies:** DC.4.1, DC.4.2

### Check
Ten graded questions over the four lessons (updates, backups, two-step sign-in, Wi-Fi), including one order step (the
3-2-1 backup routine or the steps after a lost phone) and one scenario.

---

## cyber-3-1 Privacy and school data (teachers, Intermediate)

**Summary.** Protect pupils' personal data the way data protection laws expect, choose apps and AI tools that respect
it, share photos and posts safely, and handle a data incident calmly when it happens.

### cyber-3-1-1 Pupils' data: collect less, protect more
- **Objectives:** recognise personal and sensitive data in school records; apply the main principles of data protection
  (purpose, collect less, accuracy, keep only as long as needed, security, people's rights); find the weak points in
  how a school shares results and registers.
- **Points:** personal data is anything that identifies a pupil: name, photo, phone, address, marks, attendance; health,
  religion and family situation are sensitive. Children's data needs extra care. The laws above share the same ideas.
  School examples: results posted with full names in a parents' group; a register photo on social media; forms asking
  for what isn't needed; spreadsheets of pupils' phone numbers in personal email; files shared with "anyone with the
  link"; paper records in an unlocked cupboard. Habits: share with named people, use initials or numbers, delete what you
  no longer need, lock devices and cupboards, shred.
- **Checkpoint idea:** sharing exam results: each parent gets only their own child's result.
- **Lab:** `breach`: one leaked staff password opens many accounts, and the pupils' records with them.
- **Competencies:** DC.4.2

### cyber-3-1-2 Apps, permissions and AI tools in class
- **Objectives:** check an educational app or AI tool before using it with a class (who makes it, what data it takes,
  minimum age, settings); set app permissions to only what is needed; use AI tools without giving away pupils' data.
- **Points:** many apps and chatbots set a minimum age, often 13, and younger teens need a parent's permission. Free
  apps often pay for themselves with data. Permissions: a quiz app needs none of camera, contacts or location; "only
  while using the app"; approximate location; review in Settings and remove unused apps. School accounts for pupils, not
  their personal numbers. Never paste names, marks, health or behaviour notes into a chatbot: use "Pupil A"; check its
  settings for using chats for training. Shared computers and cyber cafés: private window, sign out, never "remember
  me".
- **Checkpoint idea:** a free quiz app asks for location, contacts and the microphone: allow none of them.
- **Lab:** `permissions`: four apps; allow only what each really needs.
- **Competencies:** DC.4.2, DC.4.1

### cyber-3-1-3 Social media, pupils' photos and you
- **Objectives:** decide whether a pupil photo can be posted and how (consent, no names with faces, no routine-revealing
  details); keep personal and professional accounts apart; spot and report an account pretending to be the school.
- **Points:** parents' consent first (the school's form); groups or backs, no full names with faces; check the background
  (name lists on the board, the school sign, the time); phone photos can carry their location (turn off location tags).
  A pupil's footprint is made of small details that add up. Your accounts: personal ones private, no pupils as friends,
  official channels for school messages. Fake school pages asking parents for fees: report, warn parents on the official
  channel. Search your own name once a term.
- **Checkpoint idea:** which sports-day photo to post: the team from behind, no names.
- **Lab:** `footprint`: six harmless-looking posts by a pupil, and what a stranger can piece together.
- **Competencies:** DC.4.2, DC.2.6

### cyber-3-1-4 When data goes wrong: handling an incident
- **Objectives:** recognise a data incident; follow the five steps (contain, report, assess, notify, learn); keep a short
  incident log; support a no-blame culture so people report early.
- **Points:** incidents: marks sent to the wrong group, a lost phone with pupils' contacts, a hacked email sending scams,
  a lost USB drive with exam papers, ransomware. Contain: delete for everyone at once, ask recipients to delete, lock or
  erase the lost phone remotely, change passwords, unplug an infected computer. Report the same day to the head teacher
  or data lead. Assess: what data, whose, how harmful. Notify the people affected and, if serious, the regulator (the
  leader decides; often within 72 hours). Learn: one change so it doesn't happen again. Don't hide it, don't delete the
  evidence, don't pay, don't argue with the attacker. Many incidents begin with a call or message asking for a code.
- **Checkpoint idea:** the marks list went to the parents' group by mistake: delete it for everyone now, then tell the
  head teacher.
- **Lab:** `social`: a "support" call asking for your code, the way many incidents begin.
- **Competencies:** DC.4.2, DC.5.1

### Check
Ten graded questions: data principles, permissions and AI tools, photos and accounts, the incident steps (an order step)
and a scenario.

---

## cyber-4-1 A cyber-safe school (teachers, Advanced)

**Summary.** Lead your school's cyber safety: write a one-page policy with colleagues, assess and rank the risks,
rehearse an incident before it happens, and build cyber safety into teaching across subjects and years.

### cyber-4-1-1 A one-page cyber safety policy
- **Objectives:** draft a one-page policy that covers roles, accounts, devices, data, groups and incidents; write
  password rules that follow current guidance; get staff, pupils and parents to agree to it.
- **Points:** people follow what they can read: one page, plain words, reviewed every year. A named cyber lead. Accounts:
  long passphrases, unique, never shared; two-step sign-in on email and school accounts. Devices: screen lock, updates,
  approved apps. Data: collect less, share with named people, backups. Groups: official groups with two admins, no
  pupils' personal data. Incidents: report the same day, no blame. Password rules from NIST 2025 (above), not "change it
  every month with a symbol". Write it with staff, sign it, display it, teach it to new staff.
- **Checkpoint idea:** which password rule belongs in a modern policy: long passphrases, change only after a leak.
- **Lab:** `password`: test the policy's rule: why length beats symbols.
- **Competencies:** DC.4.1, DC.4.2

### cyber-4-1-2 Risk assessment: what could go wrong?
- **Objectives:** list the school's information assets; score risks by likelihood and impact on a 3 × 3 grid; choose a
  control (prevent, detect, recover) with an owner and a date for the top risks; keep a simple risk register.
- **Points:** risk = likelihood × impact. Assets: pupil records, exam papers, fee records, staff email, the school's
  social media page, the office computer. Threats: phishing, lost phones, ransomware, old unsupported computers, power
  cuts and floods, misuse by insiders. Fix the high-high first, not the dramatic. Controls: prevent (two-step sign-in),
  detect (someone checks the page and the alerts), recover (backups, recovery codes, a paper contact list). A register:
  risk, likelihood, impact, score, control, owner, review date.
- **Checkpoint idea:** which risk first: an office phone with pupils' contacts and no screen lock.
- **Lab:** `decision`: weigh options with a decision matrix and expected value, the maths behind likelihood × impact.
- **Competencies:** DC.4.1, DC.5.1

### cyber-4-1-3 Incident drills: practise before it happens
- **Objectives:** run a 30-minute tabletop exercise with staff; give each person a role; test the contact list, the
  backups and who speaks to parents; turn what you learn into changes.
- **Points:** a drill is a story told in three updates ("injects"). Roles: incident lead, communications lead (the only
  voice to parents), technical help, record keeper. Scenarios: the school page hacked and posting fake fee links;
  ransomware on the office computer two days before exams; a teacher's WhatsApp taken over and asking parents for money.
  Questions: who do we call, where is the backup, what do we tell parents, what if the internet is down (a paper contact
  card). After: three lessons learned, and the policy and contacts updated. A staff "spot the scam" round, by
  agreement and without shaming anyone.
- **Checkpoint idea:** during the drill, who tells parents what's happening: the communications lead, on the official
  channel.
- **Lab:** `phishing`: the staff round: judge eight messages, then talk through the signs.
- **Competencies:** DC.5.1, DC.4.2

### cyber-4-1-4 Teaching cyber safety across the school
- **Objectives:** plan cyber safety little and often across subjects and year groups; match activities to pupils' ages;
  respond safely when a pupil reports online harm; involve parents.
- **Points:** a spiral: short activities every term, not one assembly a year. Subjects: maths (ciphers, counting
  password combinations), languages (the wording of scams), science (how networks carry messages), social studies
  (rights and laws), art (posters). Ages: younger pupils "ask an adult, keep private things private"; older ones privacy
  settings, two-step sign-in, scams, footprint. When a pupil reports bullying, threats or someone asking for images:
  listen, believe, don't blame, never ask for or forward images, keep the evidence they already have, report to the
  safeguarding lead the same day; blackmail is never paid. Parents: one tip a month in the official group.
- **Checkpoint idea:** which plan works best: short activities in many subjects every term.
- **Lab:** `caesar`: a maths-and-language activity pupils love: hide a message, then crack one by counting letters.
- **Competencies:** DC.4.3, DC.2.6

### Check
Ten graded questions: the policy, risk scoring (likelihood × impact), the drill roles, teaching and safeguarding, with an
order step (the incident steps or the risk process) and a scenario.

---

## cyber-s1 Safe online: passwords and scams (students, Beginner)

**Summary.** Make passwords nobody can guess, spot scams before they catch you, keep your accounts locked with two-step
sign-in, and know exactly what to do when something goes wrong.

### cyber-s1-1 Passwords nobody can guess
- **Objectives:** explain how attackers guess passwords; make a passphrase from random words; use a different password
  for every account; keep passwords secret, even from friends.
- **Points:** a password is the key to your games, chats, school account and email. Attackers try the common ones first
  (123456, names, birthdays, football teams) and computers try billions. Long beats complicated: three or four random
  words. One account, one password; the email password matters most because it resets the others. Never share a
  password with friends (a parent or guardian helping you is different). Shared phones and café computers: sign out,
  never save the password. Keep them in a password manager or a notebook kept safe at home.
- **Checkpoint idea:** which is hardest to guess: four random words.
- **Lab:** `password`: see how an attacker would guess yours, and how long it would take.
- **Competencies:** DC.4.1, DC.4.2

### cyber-s1-2 Spot the scam
- **Objectives:** name the warning signs of a scam message; recognise the scams aimed at young people (free data, free
  game coins, giveaways, easy money jobs, fake shops); do the right thing: stop, check, report, tell.
- **Points:** too good to be true; hurry; asks for a code, password or payment; a link you didn't expect; a sender that
  doesn't match. Scams use your favourite games and stars. Check another way: the official app, a trusted adult. Report
  and block; warn your friends. Being tricked isn't stupid: scammers are professionals.
- **Checkpoint idea:** "Free 10 GB of data: tap and enter your number and PIN": scam.
- **Lab:** `phishing`: eight messages by text, chat and email: scam or safe?
- **Competencies:** DC.4.2, DC.1.2

### cyber-s1-3 Codes are keys: two-step sign-in
- **Objectives:** explain two-step sign-in; turn it on for email, WhatsApp and games with a trusted adult; never share a
  one-time code; keep backup codes safe; know what a passkey is.
- **Points:** password plus a code or a prompt on your phone: a stolen password alone isn't enough. The code is a key
  for you alone: "I sent my code to your number by mistake" is how accounts are stolen. WhatsApp's six-digit PIN.
  Backup codes on paper at home. Passkeys: unlock with your fingerprint or face, nothing to steal.
- **Checkpoint idea:** a game friend sent "their" code to your phone and asks for it: don't send it.
- **Lab:** `twofactor`: sign in with a real code, and watch a thief with the password get stuck.
- **Competencies:** DC.4.1, DC.4.2

### cyber-s1-4 When something goes wrong
- **Objectives:** recognise the signs of a hacked account; take the recovery steps in order; act fast after a scam;
  tell a trusted adult, and help a friend who was tricked.
- **Points:** signs: messages you didn't send, a changed password, sign-in alerts, friends saying you asked for money.
  Steps: tell a trusted adult; change the password (and anywhere you reused it); turn on two-step sign-in; sign out of
  other devices; check the recovery email and phone; warn friends; report through the app's recovery page. Paid or sent a
  code: tell an adult at once and call the mobile money company; keep screenshots; never pay "recovery" people. It's not
  your fault.
- **Checkpoint idea:** a friend got a strange link "from you": change your password and tell an adult.
- **Lab:** `breach`: one leak, many accounts: what reusing a password costs, and what saves you.
- **Competencies:** DC.4.2, DC.4.3, DC.5.1

### Check
Ten graded questions over passwords, scams, codes and recovery, with an order step (the recovery steps) and a scenario.

---

## cyber-s2 Your digital footprint (students, Elementary)

**Summary.** Everything you do online leaves a trace. See what yours says, control who knows where you are, share
other people's photos and news with care, and find out who else is watching your data trail.

### cyber-s2-1 Every post leaves a trace
- **Objectives:** tell active from passive footprints; explain why posts are hard to delete; see how small details add
  up to find a person; use a test before posting.
- **Points:** active: posts, comments, photos; passive: location, searches, likes, what you watch. Screenshots and shares
  last; "delete" doesn't delete other people's copies. School uniform + bus stop + birthday + pet's name (a common
  security question) adds up. The test: would I be fine if my grandmother, my head teacher and a stranger saw it? Your
  footprint can help you too: a project, a kind comment, a skill.
- **Checkpoint idea:** which detail is safest to share publicly: your favourite book.
- **Lab:** `footprint`: six posts by a pupil, and what a stranger can piece together.
- **Competencies:** DC.2.6, DC.4.2

### cyber-s2-2 Who knows where you are?
- **Objectives:** explain how a phone knows its location; manage app permissions (only while using, approximate
  location); share live location only with family, for a set time; remove location from photos.
- **Points:** GPS, Wi-Fi and mobile masts; apps ask for location, camera, microphone and contacts; allow only what an app
  needs; review permissions and delete unused apps. Live location (chat apps, maps): family only, for a set time, then
  check it stopped. Photos can carry where they were taken. A torch app needs no location.
- **Checkpoint idea:** a torch app asks for location and contacts: allow neither.
- **Lab:** `permissions`: four apps, allow only what each needs.
- **Competencies:** DC.4.2, DC.4.1

### cyber-s2-3 Share with care: photos, friends and fakes
- **Objectives:** ask before posting someone's photo; check a post before sharing it (source, date, other trusted
  sources, how it makes you feel); recognise edited and AI-made fakes; stand up for someone being bullied online.
- **Points:** consent: ask, and respect "no". Never share private or embarrassing images of others; for under-18s it can
  be a crime. Fakes: edited photos, AI voices and videos, old pictures with new stories. Strong feelings (anger, fear)
  are a warning sign. Check the official source before sharing. Bullying: don't forward, support the person, report,
  keep evidence, tell an adult.
- **Checkpoint idea:** a shocking post says school is closed tomorrow: check the school's official channel first.
- **Lab:** `factcheck`: mark each claim correct, wrong or needing a source.
- **Competencies:** DC.1.2, DC.4.3, DC.2.6

### cyber-s2-4 Who else is watching? Wi-Fi, trackers and your data
- **Objectives:** explain what a Wi-Fi owner, a website and an advert tracker can learn about you; use HTTPS, mobile data
  and privacy settings to share less; know what private browsing does and doesn't do.
- **Points:** the network sees which sites you visit; HTTPS hides what's inside; trackers follow you across sites to
  show adverts; free apps are often paid for with your data. Take control: a private account, who can message you, ads
  personalisation off, location history off. Private browsing stops the phone saving history, nothing more. Public
  Wi-Fi is fine for reading, not for signing in to important accounts or paying.
- **Checkpoint idea:** does private browsing hide what you do from the café's Wi-Fi: no.
- **Lab:** `wifi`: what the café owner can read with HTTP, HTTPS and a VPN.
- **Competencies:** DC.4.2, DC.4.1

### Check
Ten graded questions over footprints, location, sharing and tracking, with an order step (checking a post before
sharing) and a scenario.

---

## cyber-s3 How attacks work, and how to defend (students, Intermediate)

**Summary.** Find out how malware gets in, how attackers trick people, how passwords are attacked, and how encryption
keeps secrets, so you can see each defence and why it works.

### cyber-s3-1 Malware: how it gets in
- **Objectives:** describe viruses, worms, trojans, ransomware and spyware; name the ways malware gets onto phones and
  computers; choose the defences (updates, official stores, backups, built-in protection); know what to do if a device
  is infected.
- **Points:** "modded" apps and cracked games from outside the store; USB sticks shared in cyber cafés; attachments; fake
  "your phone has 3 viruses" pop-ups. Defences: updates, official stores, Google Play Protect or Defender on, no
  "install from unknown sources", backups. Signs: battery drain, pop-ups, apps you didn't install, data used up. Infected:
  disconnect, tell the IT teacher or an adult, change passwords from a clean device, restore from a backup.
- **Checkpoint idea:** "Your phone has 3 viruses! Install this cleaner now": a fake alert; close it.
- **Lab:** `malware`: watch an infection spread across a school's devices, and stop it.
- **Competencies:** DC.4.1, DC.5.1

### cyber-s3-2 Social engineering: hacking people
- **Objectives:** explain social engineering; name the tricks (authority, urgency, fear, flattery, a gift, curiosity, a
  made-up story); recognise them by phone, chat, in games and in person; respond: slow down, check another way, say no.
- **Points:** it's easier to trick a person than to break a computer. "I'm from IT", "your account will be banned",
  "you're our winner", a USB stick labelled "Exam answers", someone following you into the computer room. Defence: a
  pause, a check through another channel, never codes or passwords, "no" is allowed, tell an adult.
- **Checkpoint idea:** a USB stick labelled "Exam answers" in the computer room: don't plug it in, hand it to a teacher.
- **Lab:** `social`: "IT support" calls about a virus and needs your code.
- **Competencies:** DC.4.2, DC.4.3

### cyber-s3-3 Attacks on passwords, and the defences
- **Objectives:** explain guessing, word lists, trying every combination and reusing leaked passwords (credential
  stuffing); compare how many possibilities short and long passwords have; describe how websites and you defend.
- **Points:** attackers try common passwords and word lists first, then every combination; each extra character
  multiplies the possibilities (the numbers above). Leaks: an email and password from one site are tried on many others.
  Websites lock after too many tries, store fingerprints instead of passwords (level 4) and check new passwords against
  leaked lists. Your part: long unique passphrases, a password manager, two-step sign-in, and checking with an adult
  whether your email appeared in a leak.
- **Checkpoint idea:** why reuse matters: the leaked password is tried on your other accounts.
- **Lab:** `password`: see how an attacker would guess it, and what makes it last.
- **Competencies:** DC.4.1, DC.4.2

### cyber-s3-4 Secret messages: encryption basics
- **Objectives:** explain encryption, keys and decryption; use a Caesar cipher and crack one by counting letters;
  explain why modern encryption can't be cracked by trying every key; say where encryption protects you every day.
- **Points:** Caesar: shift each letter; the key is the shift; few keys, so try them all. Al-Kindi's letter counting.
  Modern keys are so many that trying them all would take longer than the age of the universe. End-to-end encryption in
  chat apps; HTTPS; a phone with a screen lock encrypts its storage.
- **Checkpoint idea:** encrypt "CAT" with shift 1: "DBU".
- **Lab:** `caesar`: hide a message, then crack one by counting letters.
- **Competencies:** DC.4.2, DC.3.4

### Check
Ten graded questions over malware, social engineering, password attacks and encryption, with an order step and a
scenario.

---

## cyber-s4 Defenders: cryptography, networks, careers (students, Advanced)

**Summary.** Look inside the tools defenders use: fingerprints of data, locks and keys, and networks that keep messages
flowing. Then meet the people who do this work, and plan your own first steps into it, legally and ethically.

### cyber-s4-1 Fingerprints of data: hashing
- **Objectives:** describe a hash function (fixed length, same input same hash, tiny change new hash, one-way); explain
  how websites store passwords as hashes; use hashes to check that a file wasn't changed.
- **Points:** SHA-256 makes 64 hexadecimal characters from anything. Websites store the hash (with a salt, and a slow
  hash) and compare at sign-in. A leak of hashes still matters: attackers hash common passwords and compare, so long
  unique passphrases still matter. Downloads publish their hash so you can check them.
- **Checkpoint idea:** change one letter: the fingerprint changes completely.
- **Lab:** `hash`: make real SHA-256 fingerprints.
- **Competencies:** DC.4.2, DC.3.4

### cyber-s4-2 Locks and keys: public-key cryptography
- **Objectives:** explain the key-sharing problem and how a public and a private key solve it; explain digital
  signatures; say what the HTTPS padlock does and doesn't prove.
- **Points:** a padlock anyone can close (public key) and a key only you have (private key); RSA rests on multiplying
  big primes being easy and factoring hard. Signatures prove who sent a message and that it wasn't changed. The padlock
  means the connection is encrypted with the real owner of that address, not that the site is honest: scam sites have
  padlocks too. Chat apps' security codes compare keys. Defenders are already moving to post-quantum cryptography.
- **Checkpoint idea:** what the padlock proves: the connection is encrypted, not that the site is honest.
- **Lab:** `publickey`: make a real (tiny) RSA key pair, lock and sign messages.
- **Competencies:** DC.4.2, DC.4.1

### cyber-s4-3 Networks and the defenders who watch them
- **Objectives:** explain packets, addresses and routes; name the three security goals (confidentiality, integrity,
  availability); describe defence in depth (firewalls, separate networks, monitoring, spare routes, updates).
- **Points:** messages travel in packets that hop through routers; if one route breaks, another is used. The goals:
  only the right people read it, nobody changes it, it works when needed. A firewall decides what may pass; the office
  network is kept apart from pupils' Wi-Fi; a security operations centre watches logs and alerts; spare routes and
  backups keep things running. Layers, like a castle's walls, gate and guards.
- **Checkpoint idea:** the results website goes down on results day: availability.
- **Lab:** `mesh`: break nodes, add relays, and watch the messages find a way.
- **Competencies:** DC.4.1, DC.5.1

### cyber-s4-4 Careers in cyber security
- **Objectives:** describe several security jobs (analyst, ethical hacker, engineer, forensic investigator, incident
  responder, privacy officer, cryptographer, trainer); explain the ethics and the law (only test with written
  permission); plan first steps (school subjects, free courses, clubs, capture-the-flag competitions for students).
- **Points:** the world is short of millions of security workers, in banks, mobile money and phone companies,
  governments, hospitals and schools. Skills: curiosity, problem solving, networks, a little programming, writing and
  talking clearly, honesty. Unauthorised access is a crime almost everywhere, even "just to look". Found a weakness?
  Tell the owner privately, don't test further, don't share it. Women and people from every country are needed.
- **Checkpoint idea:** you notice a weakness in the school website: tell the school privately and go no further.
- **Lab:** `classifier`: train a phishing filter from examples, as security engineers do, and see what it misses.
- **Competencies:** DC.5.3, DC.4.1

### Check
Ten graded questions over hashing, keys and signatures, networks and careers, with an order step and a scenario.
