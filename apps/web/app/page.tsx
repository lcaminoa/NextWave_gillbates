import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "PHAROS · Payment Incident Intelligence",
  description: "Turn a payment anomaly into evidence your team can verify.",
};

export default function Home() {
  return <LandingPage />;
}
