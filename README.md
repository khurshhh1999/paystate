# Payable as Stated

A test bench for patient billing agents. It asks one question of every conversation: should the agent have asked for money at all?

I built it to work out what decides a good patient billing experience, using cases I could run and grade instead of opinions.

## What it found

Twelve patient situations, each run 12 times (two sets of agent instructions, two views of the account record, three trials). 144 graded conversations on `claude-sonnet-5-5`.

| Agent sees | Instructions | Right outcome | Wrong collects | Dead ends |
|---|---|---|---|---|
| Full account record | v1 baseline | 35 / 36 | 0 | 1 |
| Full account record | v2 with payable-as-stated check | 36 / 36 | 0 | 0 |
| Statement only | v1 baseline | 23 / 36 | 2 | 11 |
| Statement only | v2 with payable-as-stated check | 28 / 36 | 0 | 8 |

I expected the instructions to matter most. They did not. With the full record both versions were right almost every time. With only what is printed on the statement, the baseline agent offered to take payment from a patient whose claim the practice had filed late, in two of three runs. Adding a rule to check the bill first removed the wrong collects, but the agent then refused valid payment plans because it could no longer tell a good bill from a bad one.

A rule can stop the harm. Only the data resolves the question.

## What is in it

**Bench** (`/`). The 2×2 scorecard, every case with its twelve outcomes, and what I would build next.

**Case pages** (`/cases/[id]`). The account record as the agent sees it under each view, what a senior biller would do, the recorded transcripts with the judge's verdict, a button to run the case again live, and a chat where you play the patient.

**Prompt lab** (`/lab`). Edit the agent's instructions, run all twelve cases, and compare your scorecard with the recorded ones.

**Statement gate** (`/outreach`). The same checks run before a statement is sent. Seven rules written as SQL against a synthetic panel of 5,000 open balances, the message each patient would get instead of a bill, a test design, and a calculator. The SQL runs in the build script and the page shows its output: 353 accounts caught, $191,679 not owed as stated. The incidence rates behind those figures are my assumptions and are listed on the page.

**Method** (`/method`). How a run works, the full instructions and judge rubric, what changed after the first run, and what the bench does not show.

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
npm run bench -- --only qmb         # one case
npm run outreach:build              # rebuild the synthetic panel and rerun the SQL
npm test
```

## Layout

```
lib/cases.mjs        the twelve cases: record, scripted patient, answer key
lib/prompts.mjs      agent instructions v1 and v2, record views, judge rubric
lib/run.mjs          one conversation end to end
lib/score.mjs        outcome counts and wrong-collect dollars
lib/limits.mjs       rate limits for the public API routes
scripts/run-bench.mjs       runs the bench, writes data/results.json
scripts/build-outreach.mjs  builds the panel in SQLite, runs the rules, writes data/outreach.json
app/api/             run-case, chat, judge
app/                 bench, case pages, lab, statement gate, method
```

## Limits

- Twelve cases, chosen to be hard. This is not a sample of real traffic.
- The agent here is a stand-in with declared actions, not a production agent with real tools.
- The judge is the same model as the agent and is sometimes wrong at the edges. The method page lists the calls I disagree with.
- The scripted patients often say the deciding fact out loud, which protects them even when the agent cannot see it. Real traffic would likely do worse in the statement-only view.
- Text only. No voice.
- Answer keys are my reading of the rules. State law varies on who owes a deceased patient's balance, which is why that case goes to a person.

## Who built this

Khursheed Khan. This is an independent project and is not affiliated with any company.
