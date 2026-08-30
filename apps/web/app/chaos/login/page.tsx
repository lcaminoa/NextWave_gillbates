import type { Metadata } from "next";
import { ChaosSignIn } from "@/components/chaos/chaos-sign-in";

export const metadata: Metadata = {
  title: "Chaos Lab access",
  // A sign-in door has no business in an index.
  robots: { index: false, follow: false },
};

export default function ChaosLoginPage() {
  return <ChaosSignIn />;
}
