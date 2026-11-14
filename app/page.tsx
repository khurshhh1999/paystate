import type { Metadata } from "next";
import { PatientDesk } from "@/components/patient/patient-desk";

export const metadata: Metadata = {
  title: "Paystate",
};

export default function Home() {
  return <PatientDesk />;
}
