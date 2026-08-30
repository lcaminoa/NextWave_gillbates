import type { Metadata } from "next";
import { AlertRouting } from "@/components/settings/alert-routing";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="control-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="control-room-hero">
          <div className="relative z-10">
            <p className="eyebrow">Settings</p>
            <h1 className="mt-3 text-display font-medium text-pharos-strong">
              Alert <span className="text-pharos-accent">routing.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-small leading-6 text-pharos-muted">
              Which channel carries which event, and who is told when an investigation reaches a
              conclusion. Credentials and recipients live in the runtime environment and never reach
              this interface.
            </p>
          </div>
        </header>

        <AlertRouting />
      </main>
    </div>
  );
}
