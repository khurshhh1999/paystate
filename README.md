# Paystate

A patient billing assistant that checks a bill is owed before it asks for money, with the two things around it that decide whether that works at a real practice: the queue its handoffs land in, and a check of what the practice has connected.

Live: https://paystate.vercel.app

Every patient, account and record in it is synthetic. I wrote them.

## The product

**Patient thread** (`/`). Pick one of twelve patients and reply to their statement text as them. The assistant answers from the practice's account record. Its actions show up in the thread in the patient's words: balance on hold, plan set up, sent to the billing team.

**Staff queue** (`/queue`). Every handoff arrives as a ticket: why it needs a person, the line of the record that decides it, what the patient has been told, the IDs they already gave, and one next step. Closing a ticket picks a resolution and writes the text the patient gets. Conversations you have on the patient page land here too.

**Go-live check** (`/readiness`). Tick the feeds a practice has connected (remittance, eligibility, account ledger, visit record). The page shows how the assistant handled each patient question with exactly that much of the record, which feed to connect next, and how many conversations involve staff. Every cell is a recorded run, with the transcript one click away.

**Decisions** (`/decisions`). Who it is for, what I chose and turned down, what each choice costs, the metrics I would hold it to, and what I would do in the first 30 days with real data.

**Evidence** (`/evidence`). The bench behind all of it: scorecard, case pages with every transcript and verdict, a prompt lab, the statement gate, and the method.

## What the runs found

Twelve patient situations, 324 graded conversations on `claude-sonnet-5-5` with thinking off: two sets of instructions, three trials, and every combination of feeds each case draws on.

| The assistant can read | Right, check on | Right, check off | Wrong collects, check off | Involved staff, check on |
|---|---|---|---|---|
| Balance only | 28 / 36 | 23 / 36 | 2 | 33 / 36 |
| Balance + remittance | 31 / 36 | 30 / 36 | 0 | 27 / 36 |
| Balance + eligibility | 34 / 36 | 29 / 36 | 2 | 27 / 36 |
| Balance + account ledger | 30 / 36 | 25 / 36 | 2 | 33 / 36 |
| Balance + visit record | 26 / 36 | 25 / 36 | 2 | 35 / 36 |
| Balance + eligibility + account ledger | 36 / 36 | 31 / 36 | 2 | 27 / 36 |
| All feeds | 36 / 36 | 35 / 36 | 0 | 27 / 36 |

"Check" is one rule in the instructions: confirm the balance is payable as stated before asking for, accepting or scheduling money. "Involved staff" counts conversations with a handoff at any point, including some that were also resolved. The 2 in the wrong-collect column is the same two conversations in every row: the late-filing case draws only on the remittance, so each row without it reuses its balance-only runs.

I expected the instructions to matter most. With the whole record they barely mattered. Each cell is 36 conversations, and a rough 95% interval on a rate from 36 is about 15 points either side, so gaps of fewer than about eight conversations are within noise. The gaps that clear that line all come from connecting the record: balance only to all feeds is 28 to 36 with the check on (about 22 points) and 23 to 35 with it off. No gap between check on and check off with the same feeds clears it. With the check on, eligibility adds the most of any single feed (28 to 34); that is under the line by count, but all six come from two cases that go from none of three right to three of three. Missing feeds also mean more conversations involve staff.

Wrong collects: two in all 324 conversations, both the late-filing case, check off, balance only. With the remittance connected or the check on, it did not happen in these runs. Two events show the failure exists; they are too few to give a rate.

## Toward real traffic

The bench above is twelve hard cases with a scripted patient. Three changes move it closer to what a practice would see (`/evidence/traffic`):

- **A weighted set of 28 situations.** The twelve hard cases plus sixteen ordinary ones (what is this charge, send me the link, a receipt, STOP, wrong number), each with an assumed share of inbound conversations. The ordinary ones carry 87% of the mix. The page lets you change the weights.
- **Unscripted patients.** A simulated patient with a persona and a goal replies in their own words for up to three messages.
- **A payment gate in code.** `lib/gate.mjs` reads the reason codes, eligibility, ledger and the payer's stated patient share and returns payable, part payable, not payable or cannot verify, with no model call. The assistant cannot send a pay link or set up a plan on a balance the gate has blocked. Where there is no remittance to check, the gate says it cannot verify and blocks nothing; the instructions decide, which is where both wrong collects in the bench happened. On a part-payable bill the gate passes the supported amount to the assistant, but the amount on the pay link is not checked in code. On the 28 records I wrote, the gate returns the decision I expected for each; 20 of the 28 are payable as stated, 14 of them ordinary accounts with nothing wrong.

First run, 56 conversations on `claude-opus-5-5` at low effort (the model the live site uses, so not comparable with the bench above): 53 right, about 89% weighted by the assumed mix, no wrong collects. With 56 conversations, the unweighted 53 of 56 has a rough 95% interval of 85% to 98%. The gate never had to remove an action, because the assistant did not attempt one it disallowed. All three misses were on ordinary cases and all three were about the edge of what the assistant can do, not about judgment: it handed a receipt to staff because it could not see a payment that had just been made, handed an email receipt to staff because it had no email on file, and reassured a patient about her credit more broadly than policy supports. Two runs per situation is a first reading.

Each miss became a product change: receipts are texted automatically when a payment posts, the assistant can save an email address the patient gives, and it states policy without predicting what lenders or credit bureaus will do. The three situations were run again and came out 6 of 6, after one more fix (the assistant had been offering to ask staff for plan terms the policy does not allow). That is a fix checked on the cases it was written for, so the headline stays at the first run; the other 25 situations were not rerun.

The go-live check also runs the gate for whatever feeds are ticked. With remittance as the only feed it decides ten of the twelve hard accounts correctly and would allow payment on two that are not owed, because the deciding facts are in the eligibility and ledger feeds.

## The cases

| Case | Should the patient pay as stated? |
|---|---|
| Insured, billed anyway (deductible) | Yes |
| Same visit, new price (plan changed to high-deductible) | Yes |
| Free physical, billed $35 (problem visit, modifier 25) | Yes, but review requested |
| Lost job, cannot pay | Yes, financial assistance applies |
| Plan request in Spanish | Yes |
| Billed in full, has new coverage (PR-27) | No |
| Medicare and Medicaid, offers to pay (QMB) | No |
| In-network hospital, out-of-network anesthesia (No Surprises Act) | Part: $420 of $2,310 |
| Already paid at the desk (unapplied payment) | No |
| Hurt at work, billed personally (CO-19) | No |
| Wants to just pay it (CO-29 timely filing) | No |
| Widow receiving billing texts | Needs a person |

Every patient, account and amount is synthetic. The reason codes and the rules behind each case are real.

## How a run works

1. A scripted patient sends an opening message.
2. The agent gets the practice policy and the account record (full, or statement fields only) and replies. It ends each reply with the actions it is taking: `send_pay_link`, `set_up_plan`, `place_hold`, `update_insurance`, `offer_financial_assistance`, `handoff_to_staff`.
3. The patient sends one scripted follow-up. The agent replies again.
4. A judge reads the transcript, the full record and the answer key, and returns one of four outcomes:
   - **Resolved**: handled correctly without staff.
   - **Right handoff**: staff were needed, and the agent told the patient the right thing first.
   - **Dead end**: wrong or generic answer, an unnecessary handoff, or no next step.
   - **Wrong collect**: the agent asked for, accepted or scheduled money the patient should not pay as stated.

The patient is scripted so runs are repeatable. Each cell is run three times because replies vary.

## Run it

Needs Node 24 or later and an Anthropic API key.

```bash
npm install
echo "ANTHROPIC_API_KEY=your-key" > .env.local
npm run dev
```

Recorded results are checked in under `data/`, so the site works without running the bench. `npm run bench` uses the same model as the recorded table (`claude-sonnet-5-5`, thinking off). The traffic run, the prompt lab and the patient page use `claude-opus-5-5` at low effort. To run it yourself:

```bash
npm run bench                       # full record, both versions, 3 trials
npm run bench -- --view statement   # same cases, balance only (statement fields)
npm run bench -- --view feeds       # statement plus each partial set of feeds
npm run bench -- --only qmb         # one case
npm run tickets:build               # rebuild the recorded staff queue from the runs
npm run traffic                     # 28 weighted situations, simulated patients, payment gate (the recorded run took 300 calls, including the reruns)
npm run traffic -- --dry-run        # print the plan and the worst-case call count
npm run outreach:build              # rebuild the synthetic panel and rerun the SQL
npm test
```

## Layout

```
lib/cases.mjs        the twelve cases: record, scripted patient, answer key
lib/feeds.mjs        which record fields arrive through which feed
lib/prompts.mjs      assistant instructions v1 and v2, record views, judge rubric
lib/run.mjs          one conversation end to end
lib/gate.mjs         the payment gate: rules in code that decide whether a balance can be collected
lib/cases-common.mjs sixteen ordinary cases; lib/traffic.mjs adds weights, personas and goals
lib/simulate.mjs     the simulated patient and the unscripted conversation loop
lib/tickets.mjs      turns a handed-off conversation into a ticket for staff
lib/closeout.ts      resolutions and the text the patient gets when a ticket closes
lib/score.mjs        outcome counts and wrong-collect dollars
lib/limits.mjs       rate limits for the public API routes
scripts/run-bench.mjs       runs the bench, writes data/results.json
scripts/run-traffic.mjs     runs the traffic set under a hard call cap, writes data/traffic.json
scripts/build-tickets.mjs   writes data/tickets.json from the recorded runs
scripts/build-outreach.mjs  builds the panel in SQLite, runs the rules, writes data/outreach.json
app/api/             chat, ticket, run-case, judge
app/                 patient thread, queue, readiness, decisions, evidence
```

## Limits

- The bench is twelve cases chosen to be hard. The traffic set adds ordinary ones and weights, but the weights are my assumptions and the patients are simulated by a model. Neither is real traffic.
- The agent here is a stand-in with declared actions, not a production agent with real tools.
- The judge is the same model as the agent and is sometimes wrong at the edges. The method page lists the calls I disagree with.
- The scripted patients often say the deciding fact out loud, which protects them even when the agent cannot see it. Real traffic would likely do worse in the balance-only view.
- Text only. No voice.
- No identity check, no real payments, and a hold is a flag in the demo, not a write to a practice system.
- The staff queue keeps your tickets and closures in your browser. Nothing is sent to anyone.
- I wrote the answer keys from the billing rules, and no biller has reviewed them. State law varies on who owes a deceased patient's balance, which is why that case goes to a person.
- Dollar amounts are illustrative and are not taken from any fee schedule. Payer names in the records are placeholders.
- In a real practice, network status and filing limits would come from payer contract data, and coverage history from the practice management system. Here they are grouped under the eligibility and remittance feeds for simplicity.
- The payment gate does not model secondary payers.
