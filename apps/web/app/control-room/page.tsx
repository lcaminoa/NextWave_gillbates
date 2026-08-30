import type { Metadata } from "next";
import { ControlTowerDashboard } from "@/components/control-tower/control-tower-dashboard";

export const metadata: Metadata = {
  title: "Control Room",
};

export default function ControlRoomPage() {
  return <ControlTowerDashboard />;
}
