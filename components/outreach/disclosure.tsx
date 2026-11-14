// Collapsible block for long reference material (SQL, prompts, schema).

import type { ReactNode } from "react";

export function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-t border-rule">
      <summary className="cursor-pointer select-none py-2.5 text-[14px] text-ink-2 hover:text-ink">
        {summary}
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

export function CodeBlock({ children, wrap = false }: { children: string; wrap?: boolean }) {
  return (
    <pre
      className={
        "num max-h-[480px] overflow-auto rounded-md border border-rule bg-sunken p-4 text-[12.5px] leading-[1.6] text-ink " +
        (wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")
      }
    >
      <code>{children}</code>
    </pre>
  );
}
