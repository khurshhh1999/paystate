"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/evidence", label: "Bench" },
  { href: "/evidence/lab", label: "Prompt lab" },
  { href: "/evidence/statement-gate", label: "Statement gate" },
  { href: "/evidence/method", label: "Method" },
];

// Second row of navigation for the pages that back the product up with runs.
export function EvidenceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Evidence" className="mb-8 flex gap-4 overflow-x-auto [scrollbar-width:none] sm:gap-5 border-b border-rule text-[14px]">
      {LINKS.map((l) => {
        const active = l.href === "/evidence" ? pathname === "/evidence" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "-mb-px whitespace-nowrap border-b-2 pb-2 transition-colors " +
              (active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
