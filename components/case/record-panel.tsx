"use client";

// "What the assistant can see" with a Full record / Statement only switch. Both records are
// computed on the server with recordForView and passed in.

import { useState } from "react";
import type { View } from "@/lib/types";
import { Panel, Segmented } from "@/components/ui";
import { RecordView } from "./record-view";
import { VIEW_OPTIONS } from "./views";

export function RecordPanel({
  records,
  notes,
}: {
  records: Record<View, Record<string, unknown>>;
  /** For the full view: which fields the statement view leaves out or trims. */
  notes: Record<string, string>;
}) {
  const [view, setView] = useState<View>("full");
  const hidden = Object.keys(notes).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="What the assistant sees"
          value={view}
          onChange={setView}
          options={VIEW_OPTIONS}
        />
        <span className="text-[13.5px] text-ink-2">
          {view === "full"
            ? hidden > 0
              ? `Fields marked "not on the statement" are what the statement-only assistant does not get.`
              : "The statement shows everything in this record."
            : "What is printed on the patient's statement: service, amounts, payer name."}
        </span>
      </div>
      <Panel className="mt-3 px-4 py-1 sm:px-5">
        <RecordView record={records[view]} notes={view === "full" ? notes : undefined} />
      </Panel>
    </div>
  );
}
