"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Patient" },
  { href: "/queue", label: "Staff queue" },
  { href: "/readiness", label: "Go-live check" },
  { href: "/decisions", label: "Decisions" },
  { href: "/evidence", label: "Evidence" },
];

export function SiteNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/evidence"
        ? pathname.startsWith("/evidence") || pathname.startsWith("/cases")
        : pathname.startsWith(href);

  return (
    <header className="border-b border-rule bg-paper">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1120px] flex-col px-4 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6"
      >
        <Link
          href="/"
          className="flex items-center gap-2 self-start rounded-sm pt-3 text-[16px] font-semibold tracking-tight whitespace-nowrap sm:self-auto sm:pt-0"
        >
          {/* Same mark as app/icon.svg, drawn in tokens so it follows the theme. */}
          <svg aria-hidden viewBox="0 0 32 32" className="size-[18px]">
            <rect width="32" height="32" rx="7" className="fill-accent" />
            <path
              d="M9 16.5l4.5 4.5L23 11.5"
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-accent-ink"
            />
          </svg>
          Paystate
        </Link>
        {/* Every page stays in view on a phone: the links wrap to a second line rather than scroll,
            three and two, so no link sits alone. */}
        <div className="-mx-2.5 flex max-w-[19rem] flex-wrap items-center gap-x-0.5 gap-y-1 py-2 text-[14px] sm:mx-0 sm:max-w-none sm:flex-nowrap sm:gap-1 sm:py-0">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={
                "shrink-0 rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors sm:px-3 " +
                (isActive(l.href)
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-2 hover:bg-sunken hover:text-ink")
              }
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
