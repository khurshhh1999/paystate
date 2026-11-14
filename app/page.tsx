import type { Metadata } from "next";
import { PatientDesk } from "@/components/patient/patient-desk";

export const metadata: Metadata = {
  title: "Paystate",
};

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">
          Angela wants to pay $318 she does not owe.
        </h1>
        <p className="prose-col">
          Her doctor&apos;s office filed the claim 78 days late. The insurer denied it and the statement went out
          anyway. She would rather pay than argue. Text back as her and see what the assistant does with the offer.
        </p>
        <p className="prose-col text-ink-2">
          Paystate is a billing assistant that reads the practice&apos;s account before it asks a patient for money.
          Eleven more patients are in the list. Some of them owe every cent.
        </p>
      </header>
      <PatientDesk />
    </div>
  );
}
