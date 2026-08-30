import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CHAOS_SESSION_COOKIE,
  chaosOperatorAccess,
  chaosOperatorAccessResponse,
} from "@/lib/server/chaos-operator";

/** The door and its lock have to stay reachable from outside the room. */
const OPEN_PATHS = new Set(["/chaos/login", "/api/chaos/session"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const access = chaosOperatorAccess(
    request.headers.get("authorization"),
    request.cookies.get(CHAOS_SESSION_COOKIE)?.value,
  );

  if (access === "authorized") {
    return NextResponse.next();
  }

  // A person gets the sign-in page; a programmatic caller gets a status it can
  // act on. Sending someone's fetch() a redirect to an HTML form would be a
  // worse answer than the 401 it expects.
  const wantsDocument = request.headers.get("accept")?.includes("text/html");
  if (wantsDocument && access === "unauthorized") {
    const target = request.nextUrl.clone();
    target.pathname = "/chaos/login";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return chaosOperatorAccessResponse(access);
}

export const config = {
  matcher: ["/chaos", "/chaos/:path*", "/api/chaos/:path*"],
};
