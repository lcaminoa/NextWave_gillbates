import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CHAOS_SESSION_COOKIE,
  chaosOperatorAccess,
  chaosOperatorAccessResponse,
} from "@/lib/server/chaos-operator";

const MAX_CHAOS_REQUEST_BYTES = 16_384;
const UPSTREAM_TIMEOUT_MS = 10_000;
const chaosOperations = new Set(["inject", "random", "reveal"]);

type RouteContext = {
  params: Promise<{ operation: string }>;
};

function upstreamUrl(operation: string) {
  const origin = process.env.CONTROL_TOWER_API_ORIGIN;
  if (!origin) {
    return null;
  }

  try {
    const url = new URL(`/api/chaos/${operation}`, origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  const access = chaosOperatorAccess(
    request.headers.get("authorization"),
    request.cookies.get(CHAOS_SESSION_COOKIE)?.value,
  );
  if (access !== "authorized") {
    return chaosOperatorAccessResponse(access);
  }

  const { operation } = await context.params;
  if (!chaosOperations.has(operation)) {
    return NextResponse.json({ detail: "unknown chaos operation" }, { status: 404 });
  }

  const judgeToken = process.env.CONTROL_TOWER_JUDGE_TOKEN;
  const target = upstreamUrl(operation);
  if (!judgeToken || !target) {
    return NextResponse.json(
      { detail: "PHAROS Chaos Lab is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.includes("application/json")) {
    return NextResponse.json(
      { detail: "Chaos requests must use application/json." },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_CHAOS_REQUEST_BYTES) {
    return NextResponse.json(
      { detail: "Chaos request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Control-Tower-Judge-Key": judgeToken,
      },
      body: body || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const responseBody = await upstream.text();

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "PHAROS runtime unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
