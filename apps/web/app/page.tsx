import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Control Tower · Payment incident intelligence",
  description: "Turn a payment anomaly into evidence your team can verify.",
};

export default function Home() {
  return <LandingPage />;
}
