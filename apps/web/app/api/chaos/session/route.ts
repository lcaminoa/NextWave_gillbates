import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CHAOS_SESSION_COOKIE,
  chaosCredentialsMatch,
  chaosOperatorConfigured,
  issueChaosSession,
} from "@/lib/server/chaos-operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

/**
 * Signs an operator in. The credentials are compared server-side against the
 * process environment and are never stored — what comes back is an opaque signed
 * token in an httpOnly cookie, so the browser holds no secret it could leak to a
 * script.
 */
export async function POST(request: NextRequest) {
  // Told apart from a wrong password on purpose: "no credentials will work here"
  // is a deployment problem, and sending an operator away to hunt for a typo
  // that does not exist would be the unhelpful answer.
  if (!chaosOperatorConfigured()) {
    return NextResponse.json(
      { detail: "No operator credential is configured for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: "Request too large." }, { status: 413 });
  }

  let username = "";
  let password = "";
  try {
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown };
    username = typeof parsed.username === "string" ? parsed.username : "";
    password = typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    return NextResponse.json({ detail: "Malformed request." }, { status: 400 });
  }

  const session = chaosCredentialsMatch(username, password) ? issueChaosSession() : null;
  if (!session) {
    // One message for a wrong name and a wrong password alike: saying which was
    // wrong tells an attacker which half to keep.
    return NextResponse.json(
      { detail: "Those credentials do not match the configured operator." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: CHAOS_SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}

/** Signs out by clearing the cookie. The token stays valid until it expires,
 *  which is acceptable because it is httpOnly and never left the browser. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: CHAOS_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
