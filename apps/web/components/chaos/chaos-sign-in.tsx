"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, LoaderCircle, LockKeyhole } from "lucide-react";

/**
 * The operator gate for the Chaos Lab.
 *
 * Deliberately small: this is a door, not a product surface. It gives the
 * operator a branded sign-in flow before the judge reaches Chaos controls.
 *
 * The form posts to a route handler that compares against the runtime
 * environment and returns an httpOnly cookie. Nothing is kept in this component
 * after submit, and nothing is stored in the browser that a script could read.
 */
export function ChaosSignIn() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/chaos/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(body?.detail ?? "Sign-in failed.");
        setPassword("");
        setPending(false);
        return;
      }

      // refresh() first so the cached routing result from before the cookie
      // existed is discarded; the proxy then re-evaluates this navigation and
      // lets it through.
      router.refresh();
      router.replace("/chaos");
    } catch {
      setError("Could not reach the sign-in service.");
      setPending(false);
    }
  };

  return (
    <div className="chaos-gate">
      <form className="chaos-gate-card" onSubmit={submit}>
        <Image
          src="/assets/pharos-icon-simplified-bone.svg"
          alt=""
          width={34}
          height={34}
          aria-hidden="true"
        />

        <p className="eyebrow mt-4">
          <FlaskConical className="mr-1 inline size-3" aria-hidden="true" /> Chaos Lab
        </p>
        <h1>Operator access</h1>
        <p className="chaos-gate-lede">
          The Chaos Lab injects controlled anomalies into the live payment stream. It is held behind
          an operator credential so a deployed demo cannot be driven by anyone who finds the URL.
        </p>

        <label className="chaos-gate-field">
          <span>Operator</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="chaos-gate-field">
          <span>Passphrase</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? (
          <p className="chaos-gate-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="chaos-primary-button mt-5 w-full justify-center" disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <LockKeyhole className="size-3.5" aria-hidden="true" />
          )}
          {pending ? "Checking" : "Enter the Chaos Lab"}
        </button>

        <p className="chaos-gate-note">
          Credentials are configured in the runtime environment and are never stored in this browser.
          Everything else in PHAROS stays open — only injection is gated.
        </p>

        <button type="button" className="chaos-gate-back" onClick={() => router.push("/control-room")}>
          Back to the Control Room
        </button>
      </form>
    </div>
  );
}
