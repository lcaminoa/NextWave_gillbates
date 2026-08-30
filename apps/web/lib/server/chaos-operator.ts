import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type ChaosOperatorAccess = "authorized" | "unconfigured" | "unauthorized";

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

export function chaosOperatorAccess(authorization: string | null): ChaosOperatorAccess {
  const username = process.env.PHAROS_CHAOS_OPERATOR_USERNAME;
  const password = process.env.PHAROS_CHAOS_OPERATOR_PASSWORD;

  if (!username || !password) {
    return "unconfigured";
  }

  const supplied = parseBasicAuthorization(authorization);
  if (!supplied) {
    return "unauthorized";
  }

  return safelyEquals(supplied.username, username) && safelyEquals(supplied.password, password)
    ? "authorized"
    : "unauthorized";
}

export function chaosOperatorAccessResponse(access: Exclude<ChaosOperatorAccess, "authorized">) {
  if (access === "unconfigured") {
    return NextResponse.json(
      { detail: "Chaos Lab operator access is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse("Chaos Lab operator access required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="PHAROS Chaos Lab", charset="UTF-8"',
    },
  });
}
