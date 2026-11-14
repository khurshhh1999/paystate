import { EvidenceNav } from "@/components/evidence-nav";

export default function EvidenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EvidenceNav />
      {children}
    </>
  );
}
