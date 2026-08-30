"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";

/**
 * The last line of defence for a live screen.
 *
 * Every product surface here reads from a runtime we do not control, and a
 * response shaped differently from what a component expected used to take the
 * whole route down to the browser's own "this page couldn't load" — a dead end
 * with no way back and nothing to report.
 *
 * This is not a fallback that invents data: no incident content is rendered. It
 * says the screen failed, shows the underlying error for whoever is operating
 * the demo, and leaves two real exits.
 */
export default function ScreenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[pharos] screen failed to render", error);
  }, [error]);

  return (
    <div className="control-canvas">
      <main className="mx-auto w-full max-w-none py-16">
        <div className="mx-auto grid max-w-md place-items-center rounded-2xl border border-signal-critical/25 bg-signal-critical/[0.05] px-6 py-12 text-center">
          <CircleAlert className="size-5 text-signal-critical" aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-pharos-ink">This screen could not be rendered</p>
          <p className="mt-2 text-small leading-6 text-pharos-muted">
            The runtime answered, but this view could not build itself from that answer. Nothing is
            shown rather than something invented.
          </p>
          <p className="mt-3 font-mono text-micro text-signal-critical/80">
            {error.message}
            {error.digest ? ` (${error.digest})` : null}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-pharos-line bg-white/[0.04] px-4 py-2 text-xs font-semibold text-pharos-ink transition hover:bg-white/[0.08]"
            >
              Try again
            </button>
            <Link
              href="/control-room"
              className="inline-flex items-center gap-1.5 rounded-full border border-pharos-line px-4 py-2 text-xs font-semibold text-pharos-muted transition hover:text-pharos-ink"
            >
              Back to Control Room
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
