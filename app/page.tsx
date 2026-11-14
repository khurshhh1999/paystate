import type { Metadata } from "next";
import { PatientDesk } from "@/components/patient/patient-desk";

export const metadata: Metadata = {
  title: "Payable as Stated",
};

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">
          What a patient gets when they text back about a bill
        </h1>
        <p className="prose-col text-ink-2">
          Pick a patient. Their statement text has just arrived. Reply as them, or tap a suggested reply. The billing
          assistant answers from the practice&apos;s account record, and anything it cannot finish itself goes to the
          staff queue with the details attached.
        </p>
      </header>
      <PatientDesk />
    </div>
  );
}
