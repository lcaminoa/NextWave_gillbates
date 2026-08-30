import type { Metadata } from "next";
import { InvestigationsQueue } from "@/components/investigations/investigations-queue";

export const metadata: Metadata = {
  title: "Investigations",
};

export default function InvestigationsPage() {
  return <InvestigationsQueue />;
}
