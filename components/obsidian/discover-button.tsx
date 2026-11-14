// Adapted from ObsidianUI "Discover Button" (MIT). Renders a Next.js link; see discover-button.css.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import "./discover-button.css";

export interface DiscoverButtonProps {
  label: string;
  href: string;
  className?: string;
}

export function DiscoverButton({ label, href, className }: DiscoverButtonProps) {
  return (
    <Link className={cn("discover-button", className)} href={href}>
      <span className="discover-button__fill" aria-hidden="true" />
      <span className="discover-button__icon" aria-hidden="true">
        <ArrowRight size={16} strokeWidth={2} />
      </span>
      <span className="discover-button__text">{label}</span>
    </Link>
  );
}

export default DiscoverButton;
