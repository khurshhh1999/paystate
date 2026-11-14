import type { Metadata } from "next";
import { GoLiveCheck } from "@/components/readiness/go-live-check";

export const metadata: Metadata = {
  title: "Go-live check · Payable as Stated",
};

export default function ReadinessPage() {
  return (
    <div>
      <h1 className="text-[30px] font-semibold leading-tight">Go-live check</h1>
      <p className="prose-col mt-3 text-ink-2">
        Tick the feeds a practice has connected. The table shows how the assistant handled twelve hard patient questions
        with exactly that much of the record, from recorded runs. Use it before launch to see what will go wrong and
        which feed to connect next.
      </p>
      <GoLiveCheck />
    </div>
  );
}
