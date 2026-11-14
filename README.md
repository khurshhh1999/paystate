# Payable as Stated

A patient billing assistant that checks a bill is owed before it asks for money, with the two things around it that decide whether that works at a real practice: the queue its handoffs land in, and a check of what the practice has connected.

Live: https://payable-as-stated.vercel.app

## The product

**Patient thread** (`/`). Pick one of twelve patients and reply to their statement text as them. The assistant answers from the practice's account record. Its actions show up in the thread in the patient's words: balance on hold, plan set up, sent to the billing team.

**Staff queue** (`/queue`). Every handoff arrives as a ticket: why it needs a person, the line of the record that decides it, what the patient has been told, the IDs they already gave, and one next step. Closing a ticket picks a resolution and writes the text the patient gets. Conversations you have on the patient page land here too.

**Go-live check** (`/readiness`). Tick the feeds a practice has connected (remittance, eligibility, account ledger, visit record). The page shows how the assistant handled each patient question with exactly that much of the record, which feed to connect next, and how many conversations end with staff. Every cell is a recorded run, with the transcript one click away.

**Decisions** (`/decisions`). Who it is for, what I chose and turned down, what each choice costs, the metrics I would hold it to, and what I would do in the first 30 days with real data.

**Evidence** (`/evidence`). The bench behind all of it: scorecard, case pages with every transcript and verdict, a prompt lab, the statement gate, and the method.

## What the runs found

Twelve patient situations, 324 graded conversations on `claude-sonnet-5-5`: two sets of instructions, three trials, and every combination of feeds each case draws on.

| The assistant can read | Right, check on | Right, check off | Wrong collects, check off | Ends with staff, check on |
|---|---|---|---|---|
| Statement balance only | 28 / 36 | 23 / 36 | 2 | 33 / 36 |
| Balance + remittance | 31 / 36 | 30 / 36 | 0 | 27 / 36 |
| Balance + eligibility | 34 / 36 | 29 / 36 | 2 | 27 / 36 |
| Balance + account ledger | 30 / 36 | 25 / 36 | 2 | 33 / 36 |
| Balance + visit record | 26 / 36 | 25 / 36 | 2 | 35 / 36 |
| Balance + eligibility + account ledger | 36 / 36 | 31 / 36 | 2 | 27 / 36 |
| Everything | 36 / 36 | 35 / 36 | 0 | 27 / 36 |

"Check" is one rule in the instructions: confirm the balance is payable as stated before asking for, accepting or scheduling money.

I expected the instructions to matter most. With the whole record they barely mattered. With only the statement balance, the assistant without the check offered to take payment from a patient whose claim the practice had filed late. The remittance is what stops that. Eligibility rescues the most answers. Missing feeds also push more conversations to staff. A difference of one or two in this table is within run-to-run variation.

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
| In-network hospital, out-of-network anesthesia (No Surprises Act) | No |
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

Recorded results are checked in under `data/`, so the site works without running the bench. To run it yourself:

```bash
npm run bench                       # full record, both versions, 3 trials
npm run bench -- --view statement   # same cases, statement fields only
npm run bench -- --view feeds       # statement plus each partial set of feeds
npm run bench -- --only qmb         # one case
npm run tickets:build               # rebuild the recorded staff queue from the runs
npm run outreach:build              # rebuild the synthetic panel and rerun the SQL
npm test
```

## Layout

```
lib/cases.mjs        the twelve cases: record, scripted patient, answer key
lib/feeds.mjs        which record fields arrive through which feed
lib/prompts.mjs      assistant instructions v1 and v2, record views, judge rubric
lib/run.mjs          one conversation end to end
lib/tickets.mjs      turns a handed-off conversation into a ticket for staff
lib/closeout.ts      resolutions and the text the patient gets when a ticket closes
lib/score.mjs        outcome counts and wrong-collect dollars
lib/limits.mjs       rate limits for the public API routes
scripts/run-bench.mjs       runs the bench, writes data/results.json
scripts/build-tickets.mjs   writes data/tickets.json from the recorded runs
scripts/build-outreach.mjs  builds the panel in SQLite, runs the rules, writes data/outreach.json
app/api/             chat, ticket, run-case, judge
app/                 patient thread, queue, readiness, decisions, evidence
```

## Limits

- Twelve cases, chosen to be hard. This is not a sample of real traffic.
- The agent here is a stand-in with declared actions, not a production agent with real tools.
- The judge is the same model as the agent and is sometimes wrong at the edges. The method page lists the calls I disagree with.
- The scripted patients often say the deciding fact out loud, which protects them even when the agent cannot see it. Real traffic would likely do worse in the statement-only view.
- Text only. No voice.
- No identity check, no real payments, and a hold is a flag in the demo, not a write to a practice system.
- The staff queue keeps your tickets and closures in your browser. Nothing is sent to anyone.
- Answer keys are my reading of the rules. State law varies on who owes a deceased patient's balance, which is why that case goes to a person.

## Who built this

Khursheed Khan. This is an independent project and is not affiliated with any company.
