import type { Metadata } from "next";
import { ChaosConsole } from "@/components/chaos/chaos-console";

export const metadata: Metadata = {
  title: "Chaos Lab",
};

export default function ChaosPage() {
  return <ChaosConsole />;
}
