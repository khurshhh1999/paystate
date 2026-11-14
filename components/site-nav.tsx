"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Bench" },
  { href: "/lab", label: "Prompt lab" },
  { href: "/outreach", label: "Statement gate" },
  { href: "/method", label: "Method" },
];

export function SiteNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/cases") : pathname.startsWith(href);

  return (
    <header className="border-b border-rule bg-surface">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold tracking-tight whitespace-nowrap">
          Payable as Stated
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto text-[14px]">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={
                "px-3 py-1.5 rounded-md whitespace-nowrap transition-colors " +
                (isActive(l.href)
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-ink-2 hover:text-ink hover:bg-sunken")
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
