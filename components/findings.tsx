// Closing section of the Bench page: what the runs say, and what I would do about it.
// The table is computed from data/results.json. The prose around it is my reading of it.

import Link from "next/link";
import { CASES } from "@/lib/cases.mjs";
import type { Results, Trial, Version } from "@/lib/types";
import resultsJson from "@/data/results.json";
import { OutcomeDot } from "@/components/ui";

const RESULTS = resultsJson as unknown as Results;

// For each case: the piece of the record that carries the answer, and the feed it comes from.
const NEEDS: Record<string, { fact: string; feed: string }> = {
  deductible: { fact: "PR-1 deductible line and the allowed amount", feed: "Remittance (835)" },
  "plan-change": { fact: "Plan changed from copay to high-deductible on Jan 1", feed: "Eligibility (271) history" },
  "unposted-copay": { fact: "A $40 front-desk payment sitting unapplied", feed: "Payment ledger" },
  "timely-filing": { fact: "CO-29 denial and the late submission date", feed: "Remittance (835) and claim history" },
  "surprise-bill": { fact: "Out-of-network provider at an in-network facility", feed: "Encounter and payer EOB" },
  qmb: { fact: "Active Medicaid, aid category QMB", feed: "Eligibility (271)" },
  "new-insurance": { fact: "Coverage terminated June 30", feed: "Eligibility (271)" },
  "work-injury": { fact: "Intake form marked work-related, CO-19 denial", feed: "Intake and remittance" },
  deceased: { fact: "Reminder log still running", feed: "Outreach log" },
  preventive: { fact: "Visit note showing the knee evaluation", feed: "Clinical summary" },
  hardship: { fact: "No assistance application on file", feed: "Account notes" },
  spanish: { fact: "Nothing beyond the statement", feed: "None" },
};

const right = (t: Trial) => t.verdict.outcome === "resolved" || t.verdict.outcome === "correct_handoff";

function trials(view: "full" | "statement", v: Version, id: string): Trial[] {
  const runs = view === "full" ? RESULTS.runs : RESULTS.statementRuns;
  return runs?.[v]?.[id] ?? [];
}

function Dots({ list }: { list: Trial[] }) {
  return (
    <span className="inline-flex gap-1">
      {list.map((t, i) => (
        <OutcomeDot key={i} outcome={t.verdict.outcome} />
      ))}
    </span>
  );
}

export function Findings() {
  const versions: Version[] = ["v1", "v2"];
  const hasStatement = versions.some((v) => Object.keys(RESULTS.statementRuns?.[v] ?? {}).length > 0);

  // Cases where hiding the record cost at least one right outcome, worst first.
  const lost = CASES.map((c) => {
    const full = versions.flatMap((v) => trials("full", v, c.id));
    const stmt = versions.flatMap((v) => trials("statement", v, c.id));
    return { c, full, stmt, drop: full.filter(right).length - stmt.filter(right).length };
  })
    // The Spanish plan request needs nothing beyond the statement, so its drop is run-to-run
    // variation in whether the agent set the plan up or asked to confirm first. Left out here.
    .filter((r) => r.stmt.length > 0 && r.drop > 0 && NEEDS[r.c.id]?.feed !== "None")
    .sort((a, b) => b.drop - a.drop);

  const held = CASES.filter((c) => {
    const stmt = versions.flatMap((v) => trials("statement", v, c.id));
    return stmt.length > 0 && stmt.every(right) && c.group !== "payable";
  });

  return (
    <section className="mt-16 border-t border-rule pt-8">
      <h2 className="text-[20px] font-semibold">What the runs say</h2>

      <div className="prose-col mt-3 flex flex-col gap-3">
        <p>
          I expected the instructions to be the lever. I wrote a second version of the agent with an explicit rule to
          check the bill before asking for money, and assumed it would beat the baseline. On the full record it did
          not: both versions were right almost every time, and neither took money it should not have.
        </p>
        <p>
          The difference appeared when I took the record away. An agent that sees only the statement cannot tell a
          deductible from a denial, so it either explains nothing or, when the patient offers to pay, agrees to take it.
        </p>
      </div>

      {hasStatement && lost.length > 0 && (
        <>
          <h3 className="mt-8 text-[16px] font-semibold">Where the statement-only agent lost the patient</h3>
          <div className="table-scroll mt-3">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>What the agent needed</th>
                  <th>Where it lives</th>
                  <th>Full record</th>
                  <th>Statement only</th>
                </tr>
              </thead>
              <tbody>
                {lost.map(({ c, full, stmt }) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cases/${c.id}`} className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                        {c.title}
                      </Link>
                    </td>
                    <td>{NEEDS[c.id]?.fact}</td>
                    <td className="whitespace-nowrap">{NEEDS[c.id]?.feed}</td>
                    <td>
                      <Dots list={full} />
                    </td>
                    <td>
                      <Dots list={stmt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="prose-col mt-3 text-[13.5px] text-ink-2">
            Six squares per cell: three trials for each version of the instructions.
            {held.length > 0 && (
              <>
                {" "}
                {held.length} of the cases that should not be paid as stated survived without the record, because the
                scripted patient says the deciding fact out loud (&ldquo;I&rsquo;m on Medicare and Medicaid&rdquo;,
                &ldquo;I hurt my shoulder at work&rdquo;). Patients who know to object are protected. The ones who
                just want to pay are not.
              </>
            )}
          </p>
        </>
      )}

      <h2 className="mt-12 text-[20px] font-semibold">What I would build next</h2>
      <ol className="prose-col mt-4 flex list-decimal flex-col gap-4 pl-5">
        <li>
          <span className="font-medium">Score each practice by what its agent can read, before go-live.</span> Remittance
          lines with group codes, eligibility with termination dates and aid category, the payment ledger including
          unapplied money, intake flags. A practice missing a feed will dead-end on a known set of questions, and that
          is knowable during implementation instead of in week three. It also turns integration depth from a
          per-customer project into a checklist every launch runs.
        </li>
        <li>
          <span className="font-medium">Put the payable-as-stated check in front of every payment, and watch its cost.</span>{" "}
          The rule removed every wrong collect here. Without the record it also refused valid payment plans, because
          the agent could no longer tell a good bill from a bad one. It belongs as a guard where a feed is missing, with
          its handoff volume tracked as the price.
        </li>
        <li>
          <span className="font-medium">Run the same check before the statement goes out.</span> If an account can be
          recognised mid-conversation it can be recognised at adjudication, and the first contact can be a correction
          instead of a bill. The <Link href="/outreach" className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">statement gate</Link>{" "}
          page works that through with rules, SQL, messages and a test design.
        </li>
        <li>
          <span className="font-medium">Report right-outcome rate next to resolution rate.</span> A payment taken on a
          late-filed claim counts as resolved and collected on most dashboards. Graded against the record it is the
          worst outcome on the page. Wrong-collect dollars should sit beside escalation rate in what a practice sees.
        </li>
        <li>
          <span className="font-medium">Cut the record feed by feed.</span> Two views is coarse. Hiding one feed at a
          time would rank them by how many conversations each one rescues, which is the order to build integrations in.
        </li>
      </ol>
    </section>
  );
}
