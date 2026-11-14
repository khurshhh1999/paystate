"use client";

// Adapted from ObsidianUI "Status Bars" (MIT, https://www.obsidianui.dev/docs/status-bars).
// The original draws one bar per day of uptime. Here each bar is one graded conversation,
// coloured by its outcome, so a version's whole run reads as a single strip. The gliding
// tooltip, pointer, touch and keyboard handling are kept; dates, uptime maths and the
// component's own colours are replaced with this project's outcome tokens.

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { OUTCOME_LABEL, type Outcome } from "@/components/ui";
import "./status-bars.css";

export type StripCell = {
  key: string;
  /** null when this conversation has not been run (or failed). */
  outcome: Outcome | null;
  /** First line of the tooltip, e.g. the case title and trial. */
  label: string;
  /** Optional second line, e.g. the judge's reason. */
  detail?: string;
  /** Running now: the bar pulses. */
  pending?: boolean;
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const TOOLTIP_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.6 } as const;

const BAR: Record<Outcome | "none", string> = {
  resolved: "bg-ok",
  correct_handoff: "bg-handoff",
  dead_end: "bg-stuck",
  wrong_collect: "bg-wrong",
  none: "bg-rule",
};

export type StatusBarsProps = Omit<ComponentProps<"div">, "children"> & {
  cells: StripCell[];
  /** Accessible name for the strip. */
  label: string;
  /** Text used for cells with no outcome. */
  emptyWord?: string;
};

export function StatusBars({ cells, label, emptyWord = "Not run yet", className, ...rest }: StatusBarsProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const gap = 2;
  const count = Math.max(cells.length, 1);

  const word = (cell: StripCell) => (cell.pending ? "Running" : cell.outcome ? OUTCOME_LABEL[cell.outcome] : emptyWord);
  const describe = (cell: StripCell) => [cell.label, word(cell), cell.detail].filter(Boolean).join(". ");

  // One tooltip glides between bars and stays inside the strip at both ends.
  const tooltipX = useMotionValue(0);
  const tooltipShift = useTransform(tooltipX, (x) => `${-Math.min(1, Math.max(0, x / (width || 1))) * 100}%`);
  const visible = useRef(false);
  const point = (index: number, instant: boolean) => {
    const x = ((index + 0.5) * (width + gap)) / count - gap / 2;
    if (instant || !visible.current || reduce) tooltipX.jump(x);
    else animate(tooltipX, x, TOOLTIP_SPRING);
    visible.current = true;
    setActive(index);
  };
  const hide = () => {
    visible.current = false;
    setActive(null);
    setPinned(false);
    setKeyboard(false);
  };
  const indexAt = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(count - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * count)));
  };

  // A tap pins the tooltip on touch screens; the next tap elsewhere releases it.
  useEffect(() => {
    if (!pinned) return;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        visible.current = false;
        setActive(null);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned]);

  const tip = active !== null ? cells[active] : null;
  const cellId = (index: number) => `${uid}-cell-${index}`;

  if (cells.length === 0) return null;

  return (
    <div data-slot="status-bars" className={cn("flex w-full min-w-0 flex-col text-ink", className)} {...rest}>
      <div
        ref={wrap}
        className="relative"
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && !pinned && !keyboard) hide();
        }}
      >
        <div
          role="grid"
          aria-label={label}
          aria-readonly
          aria-activedescendant={keyboard && active !== null ? cellId(active) : undefined}
          tabIndex={0}
          data-hovering={active !== null || undefined}
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse" || pinned) return;
            const index = indexAt(event);
            if (index !== active) point(index, false);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            const index = indexAt(event);
            if (pinned && index === active) return hide();
            point(index, true);
            setPinned(true);
          }}
          onFocus={(event) => {
            if (!event.currentTarget.matches(":focus-visible")) return;
            setKeyboard(true);
            point(active ?? 0, true);
          }}
          onBlur={hide}
          onKeyDown={(event) => {
            if (event.key === "Escape") return hide();
            const last = count - 1;
            const from = active ?? 0;
            const to =
              event.key === "ArrowLeft" ? Math.max(0, from - 1)
              : event.key === "ArrowRight" ? Math.min(last, from + 1)
              : event.key === "Home" ? 0
              : event.key === "End" ? last
              : null;
            if (to === null) return;
            event.preventDefault();
            setKeyboard(true);
            point(to, true);
          }}
          className="group/strip flex h-7 rounded-[3px]"
          style={{ gap }}
        >
          <div role="row" className="contents">
            {cells.map((cell, index) => (
              <div
                key={cell.key}
                id={cellId(index)}
                role="gridcell"
                aria-label={describe(cell)}
                data-active={active === index || undefined}
                className={cn(
                  "min-w-0 flex-1 origin-bottom rounded-[2px] transition-[opacity,scale] duration-150 ease-out",
                  cell.pending ? "status-bars__pulse bg-rule-strong" : BAR[cell.outcome ?? "none"],
                  // Pointing at one bar quiets the rest so its colour reads against them.
                  "group-data-[hovering]/strip:opacity-35 data-[active]:opacity-100 data-[active]:scale-y-[1.08] motion-reduce:data-[active]:scale-y-100",
                )}
              />
            ))}
          </div>
        </div>

        <AnimatePresence>
          {tip && (
            <motion.div
              key="tip"
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-20"
              style={{ x: tooltipX }}
              initial={{ opacity: 0, y: reduce ? 0 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.14, ease: EASE_OUT }}
            >
              <motion.div className="pointer-events-auto -translate-y-full pb-2" style={{ x: tooltipShift }}>
                <div className="w-max max-w-72 rounded-md border border-rule-strong bg-surface px-2.5 py-2 text-[12.5px] leading-[1.4] text-ink shadow-sm">
                  <div className="font-medium">{tip.label}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-ink-2">
                    <span
                      aria-hidden
                      className={cn("size-2 shrink-0 rounded-[2px]", tip.pending ? "bg-rule-strong" : BAR[tip.outcome ?? "none"])}
                    />
                    {word(tip)}
                  </div>
                  {tip.detail && <div className="mt-1.5 border-t border-rule pt-1.5 text-ink-2">{tip.detail}</div>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default StatusBars;
