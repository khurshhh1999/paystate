"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="h-6 shrink-0 rounded border border-rule px-1.5 text-[12px] text-ink-2 hover:bg-sunken hover:text-ink"
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}</span>
    </button>
  );
}
