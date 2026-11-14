import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found · Paystate",
};

const SECTIONS = [
  { href: "/", label: "Patient" },
  { href: "/queue", label: "Staff queue" },
  { href: "/readiness", label: "Go-live check" },
  { href: "/decisions", label: "Decisions" },
  { href: "/evidence", label: "Evidence" },
];

export default function NotFound() {
  return (
    <div className="prose-col">
      <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Page not found</h1>
      <p className="mt-4 text-ink-2">There is nothing at this address. These are the pages that exist:</p>
      <ul className="mt-4 flex flex-col gap-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="underline decoration-rule-strong underline-offset-4 hover:text-accent">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
