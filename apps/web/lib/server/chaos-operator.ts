import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type ChaosOperatorAccess = "authorized" | "unconfigured" | "unauthorized";

export const CHAOS_SESSION_COOKIE = "pharos_chaos_session";
/** Long enough for a demo, short enough that a forgotten laptop is not a key. */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function parseBasicAuthorization(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function safelyEquals(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function configuredOperator() {
  const username = process.env.PHAROS_CHAOS_OPERATOR_USERNAME;
  const password = process.env.PHAROS_CHAOS_OPERATOR_PASSWORD;
  return username && password ? { username, password } : null;
}

function sign(payload: string, password: string) {
  return createHmac("sha256", password).update(payload).digest("base64url");
}

/**
 * An opaque, signed session token — never the password itself.
 *
 * The configured password is the HMAC key, so rotating it invalidates every
 * outstanding session for free, and the cookie carries nothing an attacker could
 * replay anywhere else. The expiry is inside the signed payload rather than left
 * to the cookie's own Max-Age, which a client controls.
 */
export function issueChaosSession() {
  const operator = configuredOperator();
  if (!operator) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${operator.username}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, operator.password)}`, maxAge: SESSION_TTL_SECONDS };
}

function sessionIsValid(token: string | undefined) {
  const operator = configuredOperator();
  if (!operator || !token) return false;

  const lastDot = token.lastIndexOf(".");
  if (lastDot < 1) return false;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safelyEquals(signature, sign(payload, operator.password))) return false;

  const [username, expiresAt] = payload.split(".");
  if (!safelyEquals(username ?? "", operator.username)) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Math.floor(Date.now() / 1000);
}

/** Whether an operator credential exists in this environment at all. */
export function chaosOperatorConfigured() {
  return configuredOperator() !== null;
}

/** True when the supplied credentials match the configured operator. */
export function chaosCredentialsMatch(username: string, password: string) {
  const operator = configuredOperator();
  if (!operator) return false;
  return safelyEquals(username, operator.username) && safelyEquals(password, operator.password);
}

/**
 * Either proof of being the operator is accepted: a signed session cookie, which
 * is what the sign-in form produces, or an Authorization header, which is what a
 * judge with curl already has. Dropping the header path would have broken a
 * working capability to gain a nicer form.
 */
export function chaosOperatorAccess(
  authorization: string | null,
  sessionToken?: string,
): ChaosOperatorAccess {
  if (!configuredOperator()) {
    return "unconfigured";
  }

  if (sessionIsValid(sessionToken)) {
    return "authorized";
  }

  const supplied = parseBasicAuthorization(authorization);
  if (!supplied) {
    return "unauthorized";
  }

  return chaosCredentialsMatch(supplied.username, supplied.password) ? "authorized" : "unauthorized";
}

export function chaosOperatorAccessResponse(access: Exclude<ChaosOperatorAccess, "authorized">) {
  if (access === "unconfigured") {
    return NextResponse.json(
      { detail: "Chaos Lab operator access is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // No WWW-Authenticate: that header is what makes the browser raise its own
  // dialog, and the sign-in page replaces it. A programmatic caller still gets a
  // 401 and can still authenticate with the header.
  return new NextResponse("Chaos Lab operator access required.", {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
