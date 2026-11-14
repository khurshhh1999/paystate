"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Patient" },
  { href: "/queue", label: "Staff queue" },
  { href: "/readiness", label: "Go-live check" },
  { href: "/decisions", label: "Decisions" },
  { href: "/evidence", label: "Evidence" },
];

// Fade whichever edge of the link row has more links past it, so a phone shows there is more to scroll.
const FADE = {
  none: undefined,
  right: "linear-gradient(to right, black calc(100% - 32px), transparent)",
  left: "linear-gradient(to left, black calc(100% - 32px), transparent)",
  both: "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
};

export function SiteNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/evidence"
        ? pathname.startsWith("/evidence") || pathname.startsWith("/cases")
        : pathname.startsWith(href);

  const rowRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<keyof typeof FADE>("none");

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 2;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
      setFade(left && right ? "both" : left ? "left" : right ? "right" : "none");
    };
    // Centre the current page's link on narrow screens, without moving the page itself.
    const current = row.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
    }
    const frame = requestAnimationFrame(update);
    row.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      row.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

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
        <div
          ref={rowRef}
          style={{ maskImage: FADE[fade], WebkitMaskImage: FADE[fade] }}
          className="relative -mx-4 flex items-center gap-1 overflow-x-auto px-3 py-2 text-[14px] [scrollbar-width:none] sm:mx-0 sm:px-0 sm:py-0 [&::-webkit-scrollbar]:hidden"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={
                "shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap transition-colors focus-visible:outline-offset-[-2px] " +
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
