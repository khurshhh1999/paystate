import type { Metadata } from "next";
import Link from "next/link";
import { FeedTable, tally } from "@/components/feed-table";
import { FEED_IDS } from "@/lib/feeds.mjs";

export const metadata: Metadata = {
  title: "Decisions · Payable as Stated",
  description: "Who the product is for, what I decided and turned down, and how I would measure it.",
};

const link = "underline decoration-rule-strong underline-offset-2 hover:decoration-ink";

const PEOPLE = [
  {
    who: "The patient",
    wants: "To know whether they really owe this, and what happens next.",
    today: "A pay link, a generic explanation of deductibles, or a number to call during office hours.",
    here: "An answer from their own account. A hold the moment the bill is in doubt. A text with the outcome when staff close it.",
    where: { href: "/", label: "Patient thread" },
  },
  {
    who: "The biller",
    wants: "To fix the account without calling the patient back.",
    today: "A note that says the patient called about a bill, and a transcript to read.",
    here: "A ticket with the reason, the deciding line of the record, the IDs the patient already gave and one next step.",
    where: { href: "/queue", label: "Staff queue" },
  },
  {
    who: "The person launching it at a practice",
    wants: "To know what will go wrong here before patients find out.",
    today: "Complaints in week three, traced back to a feed nobody connected.",
    here: "A check that takes the connected feeds and lists the patient questions that will fail, and which feed to connect next.",
    where: { href: "/readiness", label: "Go-live check" },
  },
];

const DECISIONS = [
  {
    title: "A bill in doubt goes on hold before anything else",
    chose: "The assistant pauses statements and reminders first, then hands off.",
    declined: "Handing off and leaving the balance active until staff get to it.",
    why: "The patient's fear is collections. The Medicare and Medicaid patient says so in her second message and offers $20 a month to make it stop. A hold answers the fear straight away. A handoff alone does not.",
    cost: "Cash is delayed on held balances that turn out to be owed. I would track how many holds are released unchanged.",
  },
  {
    title: "The assistant turns down money that is not owed",
    chose: "If the record says the balance is not payable as stated, the assistant declines payment even when the patient offers.",
    declined: "Taking the payment and refunding later if staff find a problem.",
    why: "A refund is staff work, a credit balance and a patient who learns the practice took money it should not have. For a dual-eligible patient, billing her at all is prohibited.",
    cost: "Resolution and collection numbers look worse in the week it ships. That is why the metric has to change with it.",
  },
  {
    title: "Anything policy pre-approves, the assistant does itself",
    chose: "Payment plans inside the practice's policy are set up in the thread.",
    declined: "Routing every plan to staff for approval.",
    why: "An unnecessary handoff is a dead end for the patient and a ticket nobody needed. In the runs, the assistant with a thin record handed off plans it was allowed to set up.",
    cost: "The practice has to write its plan policy down precisely enough for software to apply it.",
  },
  {
    title: "The patient is never asked to prove what the record shows",
    chose: "For the copay paid at the desk, the assistant finds the unapplied payment in the ledger and passes the receipt number to staff.",
    declined: "Asking the patient to send a receipt or a card statement.",
    why: "The practice already holds the evidence. Asking for it moves the practice's work onto the patient.",
    cost: "Needs the ledger feed. Without it the assistant can only take the patient's word and hand off.",
  },
  {
    title: "A handoff is a ticket staff can act on alone",
    chose: "Each handoff carries the reason, what the patient was told, the details they gave and one next step.",
    declined: "A link to the transcript.",
    why: "If the biller has to read the thread or ring the patient to ask again, the assistant saved nobody any time.",
    cost: "One more model call per handoff, and a ticket format the practice has to agree to.",
  },
  {
    title: "Closing the ticket tells the patient",
    chose: "Staff pick a resolution and the patient gets a text with the outcome and the new balance.",
    declined: "Closing silently and letting the next statement speak for itself.",
    why: "The assistant promised a reply by the next business day. If nothing arrives, the patient contacts the practice again and the first conversation was wasted.",
    cost: "Needs consent to text, and staff need to trust the template enough to send it.",
  },
  {
    title: "A death in the family ends the automation",
    chose: "Condolences, reminders stopped, no payment request, no answer on who owes. Staff phone the family. No close-out text.",
    declined: "Explaining estate liability, or offering the spouse a plan.",
    why: "Who owes depends on state law and the estate. A wrong answer from software here does real harm to someone grieving.",
    cost: "Every such case costs staff a phone call. That is the right price.",
  },
  {
    title: "The owed part of a wrong bill can still be paid",
    chose: "On the out-of-network anesthesia bill the patient owes $420 of $2,310. The assistant may take the $420 and holds the rest.",
    declined: "Refusing all payment until the statement is corrected.",
    why: "The patient asked what they owe. A straight answer and the option to settle it is better service than making them wait.",
    cost: "The assistant has to be right about the split. It is only allowed when the record states the patient share.",
  },
];

const METRICS = [
  {
    name: "Right-outcome rate",
    what: "Share of conversations that end resolved, or handed off with the right answer, graded against the account record.",
    why: "The main number. It counts a correct refusal to collect as a success.",
  },
  {
    name: "Wrong-collect dollars",
    what: "Money asked for, accepted or scheduled that the record says was not owed.",
    why: "The guardrail. The target is zero, and one case is worth a review.",
  },
  {
    name: "Tickets closed without contacting the patient",
    what: "Share of handoffs staff resolve from the ticket alone.",
    why: "Tests whether the handoff carried what staff needed.",
  },
  {
    name: "Hours from handoff to close-out text",
    what: "Time between the assistant's promise and the patient hearing the outcome.",
    why: "The patient's actual wait. The promise is the next business day.",
  },
  {
    name: "Repeat contact within 7 days",
    what: "The same patient coming back about the same balance.",
    why: "Catches answers that sounded fine and did not settle anything.",
  },
  {
    name: "Days to pay on balances that are owed",
    what: "Time to payment or plan on balances the record confirms.",
    why: "Makes sure the caution does not slow down money that is due.",
  },
];

const LEFT_OUT = [
  ["Checking who is texting", "A real version confirms identity before it discusses an account. I left it out because it does not change the question being tested."],
  ["Taking a payment", "The pay link and the plan are declared actions. Nothing moves money."],
  ["Voice", "Text only. Phone calls have different failure modes and need their own cases."],
  ["Writing back to the practice system", "A hold here is a flag in the demo. In production it has to stop statements in the system that sends them."],
  ["Weighting by volume", "Twelve hard questions, counted equally. Real traffic is mostly simple balance questions."],
];

const FIRST_30 = [
  "Read 200 real handoffs and sort them into the nine ticket kinds. Anything that does not fit is a kind I missed.",
  "Join past conversations that ended in a payment to their remittance lines and count the ones carrying a CO code. That is the real wrong-collect rate.",
  "Run the go-live check on two live practices with different integrations and compare its list with their actual complaints.",
  "Ship hold-before-handoff to half the handoffs at one practice and compare repeat contact.",
];

const OPEN = [
  "How many practices send remittance detail to the assistant today, and how many send only the balance.",
  "Whether a hold can be written back to each practice system, or only requested.",
  "What consent covers a close-out text, and whether it differs from consent for reminders.",
  "How staff receive handoffs now: a queue, an inbox, or a task in the practice system.",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DecisionsPage() {
  const none = { on: tally("v2", []), off: tally("v1", []) };
  const all = { on: tally("v2", FEED_IDS), off: tally("v1", FEED_IDS) };
  const hasFeedRuns = none.on.total > 0 && all.on.total > 0;

  return (
    <div>
      <header className="prose-col">
        <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Product decisions</h1>
        <p className="mt-4 text-[16px] text-ink-2">
          Who this is for, what I chose, what I turned down and what each choice costs. Then how I would measure it and
          what I would do first with real data.
        </p>
      </header>

      <Section title="The problem in one paragraph">
        <div className="prose-col flex flex-col gap-3">
          <p>
            A patient who texts back about a bill is usually asking one of two things: why do I owe this, or how do I
            pay it. Most billing automation is built for the second question. But a share of statements are wrong when
            they go out: the claim was filed late, the patient has other coverage, the copay was paid at the desk. For
            those patients, a fast and friendly path to payment is the worst thing the product can do.
          </p>
          <p>
            So the product has one rule above the others. The assistant does not ask for money the practice&apos;s own
            record says is not owed. Everything on this site follows from taking that rule seriously for the three
            people it touches.
          </p>
        </div>
      </Section>

      <Section title="Three people, three jobs">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">What they want</th>
                <th scope="col">What they usually get</th>
                <th scope="col">What they get here</th>
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map((p) => (
                <tr key={p.who}>
                  <td className="min-w-[150px]">
                    <span className="font-medium">{p.who}</span>
                    <Link href={p.where.href} className={"mt-0.5 block text-[13.5px] text-ink-2 " + link}>
                      {p.where.label}
                    </Link>
                  </td>
                  <td className="min-w-[180px]">{p.wants}</td>
                  <td className="min-w-[200px] text-ink-2">{p.today}</td>
                  <td className="min-w-[220px]">{p.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Decisions">
        <ol className="divide-y divide-rule border-y border-rule">
          {DECISIONS.map((d, i) => (
            <li key={d.title} className="grid gap-x-8 gap-y-3 py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <h3 className="text-[16px] font-semibold">
                <span className="num mr-2 font-normal text-ink-3">{i + 1}</span>
                {d.title}
              </h3>
              <dl className="grid gap-x-5 gap-y-2 text-[14.5px] sm:grid-cols-[92px_minmax(0,1fr)]">
                <dt className="text-ink-2">Chose</dt>
                <dd>{d.chose}</dd>
                <dt className="text-ink-2">Turned down</dt>
                <dd>{d.declined}</dd>
                <dt className="text-ink-2">Why</dt>
                <dd>{d.why}</dd>
                <dt className="text-ink-2">Cost</dt>
                <dd className="text-ink-2">{d.cost}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="What the runs changed">
        <div className="prose-col flex flex-col gap-3">
          <p>
            I started out thinking the assistant&apos;s instructions were the product. I wrote the check that the
            balance is owed, expected it to separate a good assistant from a bad one, and ran both. With the whole
            record in front of them, the two behaved almost the same.
          </p>
          <p>
            Then I took the record away a feed at a time.
            {hasFeedRuns && (
              <>
                {" "}
                With only the statement balance and the check on, the assistant was right in{" "}
                <span className="num">
                  {none.on.right} of {none.on.total}
                </span>{" "}
                conversations and{" "}
                <span className="num">
                  {none.on.handoffs}
                </span>{" "}
                ended with staff. With everything connected it was{" "}
                <span className="num">
                  {all.on.right} of {all.on.total}
                </span>{" "}
                and <span className="num">{all.on.handoffs}</span>. With the check off and no remittance, it offered to
                take payment on a claim the practice had filed late.
              </>
            )}
          </p>
          <p>
            That moved the product. The patient thread matters, but the thing that decides whether it is right is which
            feeds a practice has connected, and that is known before launch. So the third surface became the go-live
            check, and the check that the balance is owed became a guard that stays on wherever a feed is missing.
          </p>
        </div>
        <div className="mt-5">
          <FeedTable />
        </div>
        <p className="prose-col mt-3 text-[13.5px] text-ink-2">
          Twelve cases, three runs each, so 36 conversations per cell. A difference of one or two is within run-to-run
          variation. Full transcripts and the grading are under{" "}
          <Link href="/evidence" className={link}>
            Evidence
          </Link>
          .
        </p>
      </Section>

      <Section title="How I would measure it">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">What it counts</th>
                <th scope="col">Why it is here</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.name}>
                  <td className="min-w-[190px] font-medium">{m.name}</td>
                  <td className="min-w-[240px]">{m.what}</td>
                  <td className="min-w-[220px] text-ink-2">{m.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="prose-col mt-4">
          Resolution rate and dollars collected are missing from the top of that list on purpose. On most dashboards the
          patient who pays a late-filed claim counts as resolved and collected. Graded against the record, it is the
          worst outcome on this site.
        </p>
      </Section>

      <Section title="What I left out">
        <dl className="prose-col divide-y divide-rule border-y border-rule">
          {LEFT_OUT.map(([what, why]) => (
            <div key={what} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <dt className="font-medium">{what}</dt>
              <dd className="text-ink-2">{why}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="First 30 days with real data">
        <ol className="prose-col flex list-decimal flex-col gap-2.5 pl-5">
          {FIRST_30.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      <Section title="What I cannot know from outside">
        <ul className="prose-col flex list-disc flex-col gap-2 pl-5">
          {OPEN.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="prose-col mt-4 text-ink-2">
          Each of these could change a decision above. I would rather find that out in the first week than defend the
          list.
        </p>
      </Section>
    </div>
  );
}
