"use client";
// Picking a resolution fills in the patient's text; staff can edit it before closing.

import { useId, useState } from "react";
import type { Ticket } from "@/lib/types";
import { BLANK_AMOUNT, resolutionsFor } from "@/lib/closeout";
import { closeTicket } from "@/components/ticket-store";
import { Button } from "@/components/ui";

export function CloseForm({ ticket, onClosed }: { ticket: Ticket; onClosed: () => void }) {
  const options = resolutionsFor(ticket);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const uid = useId();

  const resolution = options.find((o) => o.id === picked) ?? null;
  const sendsText = resolution !== null && resolution.message !== null;
  const blankLeft = sendsText && message.includes(BLANK_AMOUNT);
  const canClose = resolution !== null && (!sendsText || (message.trim().length > 0 && !blankLeft));

  function pick(id: string) {
    setPicked(id);
    setMessage(options.find((o) => o.id === id)?.message ?? "");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolution || !canClose) return;
    closeTicket(ticket.id, {
      resolution: resolution.id,
      message: sendsText ? message.trim() : "",
      closedAt: new Date().toISOString(),
    });
    onClosed();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* One bordered list: the picked outcome opens to show the text the patient will get. */}
      <fieldset>
        <legend className="mb-2 text-[14px] text-ink-2">Outcome</legend>
        <div className="divide-y divide-rule rounded-md border border-rule-strong">
          {options.map((o) => {
            const isPicked = picked === o.id;
            return (
              <div key={o.id} className={isPicked ? "bg-accent-soft" : ""}>
                <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-[14.5px]">
                  <input
                    type="radio"
                    name={`${uid}-resolution`}
                    value={o.id}
                    checked={isPicked}
                    onChange={() => pick(o.id)}
                    className="mt-1 accent-accent"
                  />
                  <span className={isPicked ? "font-medium" : ""}>{o.label}</span>
                </label>
                {isPicked && sendsText && (
                  <div className="flex flex-col gap-1.5 px-3 pb-3 sm:pl-[2.125rem]">
                    <label htmlFor={`${uid}-message`} className="text-[13.5px] text-ink-2">
                      Text the patient will get
                    </label>
                    <textarea
                      id={`${uid}-message`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-[14.5px] leading-[1.5] text-ink"
                    />
                    {blankLeft && (
                      <p className="text-[13.5px] text-stuck">
                        Fill in the new amount where it says {BLANK_AMOUNT} before sending.
                      </p>
                    )}
                    <p className="text-[13px] text-ink-3">Nothing is sent in this demo.</p>
                  </div>
                )}
                {isPicked && !sendsText && o.note && (
                  <p className="px-3 pb-3 text-[14px] text-ink-2 sm:pl-[2.125rem]">{o.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={!canClose}>
          {resolution && !sendsText ? "Close" : "Close and send"}
        </Button>
      </div>
    </form>
  );
}
