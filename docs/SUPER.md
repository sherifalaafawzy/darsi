# Darsi Super: plan

Darsi Super is a paid tier with a live tutor for Darsi's courses. The tutor talks with each learner, explains any concept in their courses, makes short explainer videos on the spot through Lesson Studio, and checks that they really understood. It answers only from the course material, in Egyptian Arabic and English. Revenue reaches Firebase Analytics (Google Analytics) as real purchases.

The user's choices (2026-11-02):
- **Payments:** Paymob (Egypt) and Stripe (cards abroad).
- **Who pays:** both individuals (monthly or yearly) and organizations (seat licences).
- **The tutor:** Gemini Live 3.8, with or without a live avatar. It can call Lesson Studio to make explainer videos while it talks.
- **Paid only, with a clear limit:** the tutor is for Super accounts only. Each plan has a clear allowance of credits, and people can buy more.
- **Margin:** at least 60% profit on the tutor's calls, and the tutor must be very efficient.

Phase 0 is built (TECHNICAL.md "Darsi Super"). Nothing is charged yet.

## 1. Plans, credits and entitlements

- **Plans** live in `config/plans`, edited on /super/plans:
  - Ids such as `super_monthly` and `super_yearly`.
  - Prices per currency: EGP for Paymob, USD for Stripe.
  - Tutor credits per period.
  - Three kinds: one person, a seat in an organization (priced per seat), and a pack of extra credits.
  - The active plans are published, without costs, as `content/plans.json` for the Super screen.
- **Credits** are the tutor's limit (`credits/{uid}`):
  - Each paid period brings the plan's credits, and unused ones lapse at the period's end.
  - Packs never expire, and are spent after the period's credits.
  - When credits run out, the tutor says so and offers a pack. Lessons, Labs and everything else stay free.
- **An individual's access** is `subscriptions/{uid}` {plan, status, source, currentPeriodEnd}. Only the payment webhooks write it, or a platform admin's complimentary grant.
- **An organization's access** is `orgs/{id}.licence` {plan, seats, until}. A platform admin sets it (invoiced), or a checkout does. Org admins give and take seats, or fill the free ones (teachers first).
- **Who has Super:** the functions work it out and put it in the custom claims (`plan`, `planUntil`) beside role and organization. The phone checks the claim, and every tutor call checks it again on the server.
- **Guests and free accounts** keep everything Darsi has now. Super adds the tutor and live explainers only, so learning never sits behind a paywall.

## 2. Payments

- **Paymob (EGP).** Cards, Meeza, mobile wallets and kiosk codes.
  - A callable `startCheckout` creates a Paymob payment intention and returns its checkout URL; the phone opens it.
  - The webhook `paymobWebhook` (HMAC-verified) calls `recordPayment`.
  - Renewals: Paymob's card subscriptions where available. Otherwise a prepaid period with a reminder before it ends (wallets and kiosks can't auto-renew).
- **Stripe (USD and other currencies).** Stripe Checkout with Stripe Billing subscriptions.
  - The webhook `stripeWebhook` (signature-verified) handles `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated/deleted` and `charge.refunded`.
- **Common to both:**
  - `recordPayment` and `recordRefund` already exist and are tested (phase 0). A payment is stored once as `payments/{provider}_{ref}`, so a repeated webhook does nothing.
  - The phone never decides that someone has paid; only the verified webhooks do.
- **Keys:** the Paymob and Stripe secret keys go into Secret Manager (`firebase functions:secrets:set`). Their public keys are build settings.
- **The user's part:** open the Paymob and Stripe accounts, and enter the webhook addresses we give them.

## 3. Revenue in Firebase Analytics

Done in phase 0. Revenue goes through the Measurement Protocol **from the server**, so only money actually received is counted:
- **`purchase`:** `transaction_id`, `value`, `currency` (EGP or USD), the item (plan id and name; a licence is priced per seat), and `affiliation` (individual, organization or credits).
- **`refund`:** sent when a payment is refunded.
- **Linking to the phone:** the checkout passes the phone's analytics id as `client_id`, and a hash of the account id goes as `user_id` (never an email). Purchases then link to the sessions that led to them.
- **Funnel events from the phone:** `view_paywall` and `begin_checkout` now. Later: `tutor_open`, `tutor_question`, `explainer_view` and `understanding_check`.
- **Darsi's own counts:** /super/analytics shows revenue for 30 days per currency, purchases and refunds, active subscriptions by plan and source, and organizations' seats.
- **A check:** the Plans page sends a sample purchase to Google's validation server ("Check the revenue event").
- **Before launch:** the Measurement Protocol API secret must be set on /super/analytics (docs/FIREBASE.md §8), or nothing reaches Google Analytics.

## 4. The tutor

**The model:** Gemini Live 3.8 through the Live API. It speaks and listens in real time. The Gemini API key lives in Secret Manager and never reaches a phone.

**The connection, and why it goes through Darsi:**
- The phone opens a WebSocket to a small relay on Cloud Run (europe-west1). The relay checks the Super claim and the credit balance, then opens the Live session with Google.
- The relay reads the usage Google reports for each turn and debits credits at that measured cost. It warns the learner near the end of their credits and closes the session when they run out.
- The other option is Google's ephemeral tokens: the phone talks to Google directly, which is cheaper to host. But Darsi can't see each turn's cost then, only a time limit, so the 60% margin can't be enforced exactly. **Recommended: the relay.** It's the user's call in phase 2.

**With or without the avatar:**
- **Voice only** is the default: least data, least battery.
- **The avatar** is drawn on the phone: a character from the light player's cast, animated from the tutor's audio (mouth and gestures). No video is streamed, so the avatar costs no extra AI or data.
- **Text chat** is there for quiet places and very slow connections. It's the cheapest mode, and the same tutor answers.

**Grounding (RAG):**
- A tutor opened inside a lesson gets that lesson, its course outline and the glossary (`docs/curriculum/ar-lingo.md`) in its instructions. Repeated context is cached where the API allows, which makes it cheaper.
- For anything else in the learner's courses, the tutor calls a tool, `search_course(query)`. It returns the best lesson sections from an index (BM25 over Arabic and English), built from the published units at publish time.
- Each answer names the lesson section it came from, and the phone shows it as a link that opens that step.

**Staying in scope:**
- The instructions allow answers only from the course material supplied or found.
- A question the material doesn't cover gets a short, kind "that's outside your courses", with a pointer to the course that covers it, if any.
- Replies are in Egyptian Arabic or English, following the learner. A question in another language gets a reply in the learner's app language.
- Evals gate every change of instructions: in-scope and out-of-scope questions, spoken and typed, in both languages.

**Live explainers (Lesson Studio as a tool):**
- While it talks, the tutor can call `make_explainer({concept, level, lang})`.
- The relay asks Lesson Studio for a short storyboard (scenes, text, shapes, the science kit's equations, plots and networks), checked against Lesson Studio's schema. It is never free code.
- The phone plays it at once with the light player Darsi already ships, while the tutor narrates it live. No video file is rendered or downloaded, which keeps the data cost tiny.
- Explainers are cached per concept and language, so the second learner who asks gets it free.

**Understanding checks:**
- After an explanation, the tutor calls `check_understanding`, which returns a question with options and feedback for each option.
- Darsi's own question components show it, and the phone grades it.
- A wrong answer leads to another way of explaining: an analogy, a worked example or an explainer.
- What the learner has shown they understood is saved per competency, so the organization's standards report picks it up.

**Each learner's way:**
- The learner picks a style (short, step by step, examples, visual) and a pace.
- The tutor keeps a short learner profile (`users/{uid}/tutor/profile`: style, what was hard, what was mastered), and the profile goes into every session.

**Efficiency:**
- Short turns by default, with "explain more" for depth.
- Server-side voice activity detection, so silence isn't billed.
- Sessions close after a minute of silence.
- The lesson context is sent once per session and cached.
- Explainers are reused across learners.
- Text chat is offered when the connection is poor.

**Safety and privacy:**
- No names or emails go to the model; the learner is "the learner".
- Transcripts are kept for the learner and, for school accounts, their organization's admins. They are deleted after 90 days unless kept. Audio isn't stored.
- Students under 13 need their organization to switch the tutor on.

## 5. Credits and the 60% margin

- **What a credit is:** a fixed slice of what the tutor costs Darsi at the provider. `economics.usdPerCredit` is set on /super/plans, for example $0.002.
- **Debiting:** each tutor turn, explainer and check debits `creditsForCost(measured cost)`, rounded up. Audio in, audio out, text and cached tokens each count at their own price.
- **The rule:** `savePlans` refuses any price where the plan's credits, all used, would cost more than 40% of the price. In other words, margin = 1 − credits × usdPerCredit ÷ price in USD (EGP prices go through `egpPerUsd`), and it must be at least 60%. The page shows each price's margin as you type.
- Credits people don't use only raise the margin.
- **Not counted in the 60%:** payment fees (Paymob and Stripe take a few percent) and the relay's hosting. To keep 60% after those too, set `usdPerCredit` a little above the provider's raw cost.
- **Before phase 2 goes live:**
  - Measure the real cost of a typical spoken minute with Gemini Live 3.8, and of an explainer, from Google's price list and a test session.
  - Set `usdPerCredit` and the plans' credits so a month's allowance gives a clear number of minutes, for example "about 60 minutes of talking a month".
  - The Super screen will show the allowance in minutes as well as credits.

## 6. On the phone

- **The Super screen** (`/upgrade`, done) explains what Super adds and shows prices in the learner's currency, the allowance per period, organizations' licences, and packs for people who have Super.
  - It loads only when opened, without Firebase, and isn't precached.
  - The Paymob and Stripe buttons arrive in phase 1.
- **Me** shows Super's status, or a link to the Super screen.
- **The tutor:**
  - An "Ask the tutor" button in lessons and on Home opens a lazy chunk that isn't precached.
  - It works online only, with a clear offline message. Transcripts and explainers already seen are kept for offline reading.
  - The credits left are always visible, and each answer shows what it cost.
- **Guests never load Firebase,** as now. The tutor and checkout need an account.

## 7. Phases

| Phase | What | Needs from the user |
|---|---|---|
| 0 ✓ | Plans with credits and the 60% check, entitlements in the claims, org licences and seats, complimentary Super and credits, the Super screen, funnel events, `purchase`/`refund` from the server, revenue on /super/analytics | Prices on /super/plans; the Google Analytics API secret |
| 1 | Paymob and Stripe checkouts and webhooks, renewals, refunds, receipts, licences bought online | Paymob and Stripe accounts (test keys first) |
| 2 | The tutor: the Live relay, voice and text, course grounding with `search_course`, scope and language rules, credit metering, an eval of 100+ questions in both languages | A Gemini API key; relay or ephemeral tokens (§4); the measured cost per credit (§5) |
| 3 | Understanding checks and the learner profile; the avatar | — |
| 4 | Live explainers through Lesson Studio | — |
| 5 | Launch: pricing tests, support, safety review, the security review of item 9 | — |
