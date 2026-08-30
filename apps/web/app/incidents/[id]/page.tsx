import type { Metadata } from "next";
import { IncidentDetail } from "@/components/incidents/incident-detail";

export const metadata: Metadata = {
  title: "Incident Detail",
};

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IncidentDetail incidentId={id} />;
}
