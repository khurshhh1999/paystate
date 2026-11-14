"use client";
// The staff queue: summary figures, the list of tickets and the selected ticket.
// Recorded tickets render on the server; this browser's tickets and closures join after mount.

import { useRef, useState, useSyncExternalStore } from "react";
import type { Ticket } from "@/lib/types";
import { TICKET_KINDS } from "@/lib/ticket-kinds.mjs";
import { resetQueue, useClosures, useLiveTickets } from "@/components/ticket-store";
import { Button, Money, Segmented, money } from "@/components/ui";
import { TicketDetail } from "./ticket-detail";
import { closedTickets, openTickets, patientName } from "./order";

type Filter = "open" | "closed";

// The URL hash names the selected ticket, so the home page can link to /queue#live-...
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => decodeURIComponent(window.location.hash.slice(1));
const noHash = () => "";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

export function Queue({ recorded }: { recorded: Ticket[] }) {
  const live = useLiveTickets();
  const closures = useClosures();
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [filter, setFilter] = useState<Filter>("open");
  const [picked, setPicked] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const all = [...live, ...recorded];
  const open = openTickets(live, recorded, closures);
  const closed = closedTickets(all, closures);
  const rows = filter === "open" ? open : closed;
  const liveIds = new Set(live.map((t) => t.id));

  // An explicit pick wins, then the hash (which may name a live ticket that has not loaded yet),
  // then the first open ticket.
  const byId = (id: string | null) => (id ? all.find((t) => t.id === id) : undefined);
  const selected = byId(picked) ?? byId(hash) ?? open[0] ?? closed[0];

  const onHold = open.filter((t) => t.hold).reduce((sum, t) => sum + t.amount, 0);
  const canReset = live.length > 0 || Object.keys(closures).length > 0;

  function select(id: string) {
    setPicked(id);
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    if (isMobile()) detailRef.current?.scrollIntoView({ block: "start" });
  }

  function reset() {
    resetQueue();
    setPicked(null);
    setFilter("open");
    window.history.replaceState(null, "", window.location.pathname);
  }

  return (
    <div className="mt-6">
      <p aria-live="polite" className="flex flex-wrap gap-x-6 gap-y-1 text-[14.5px] text-ink-2">
        <span>
          <span className="num text-ink">{open.length}</span> open
        </span>
        <span>
          <span className="num text-ink">{money(onHold)}</span> on hold
        </span>
        <span>
          <span className="num text-ink">{closed.length}</span> closed
        </span>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[360px_minmax(0,1fr)]">
        <div ref={listRef} className="min-w-0 scroll-mt-4">
          <Segmented<Filter>
            label="Show tickets"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <ul className="mt-3 border-t border-rule" aria-live="polite">
            {rows.length === 0 && (
              <li className="border-b border-rule px-3 py-4 text-[14px] text-ink-2">
                {filter === "open" ? "Nothing open. Every patient has an answer." : "Nothing closed yet."}
              </li>
            )}
            {rows.map((t) => {
              const isSelected = selected?.id === t.id;
              return (
                <li key={t.id} className="border-b border-rule">
                  <button
                    type="button"
                    onClick={() => select(t.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={
                      "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors " +
                      (isSelected ? "bg-accent-soft" : "hover:bg-sunken")
                    }
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{TICKET_KINDS[t.kind]}</span>
                      <Money value={t.amount} className="text-[13.5px]" />
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-3 text-[13.5px]">
                      <span>{patientName(t.patient)}</span>
                      {t.hold && !closures[t.id] && <span className="text-ink-2">On hold</span>}
                      {liveIds.has(t.id) && <span className="text-accent">From your conversation</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {canReset && (
            <div className="mt-4">
              <Button type="button" variant="quiet" onClick={reset}>
                Reset demo queue
              </Button>
            </div>
          )}
        </div>

        <div ref={detailRef} className="min-w-0 scroll-mt-4 border-t border-rule pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => listRef.current?.scrollIntoView({ block: "start" })}
                className="mb-4 text-[14px] text-accent underline-offset-2 hover:underline md:hidden"
              >
                Back to queue
              </button>
              <TicketDetail key={selected.id} ticket={selected} closure={closures[selected.id]} />
            </>
          ) : (
            <p className="text-[14px] text-ink-2">No tickets.</p>
          )}
        </div>
      </div>
    </div>
  );
}
