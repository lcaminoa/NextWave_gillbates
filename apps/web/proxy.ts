import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { chaosOperatorAccess, chaosOperatorAccessResponse } from "@/lib/server/chaos-operator";

export function proxy(request: NextRequest) {
  const access = chaosOperatorAccess(request.headers.get("authorization"));
  if (access !== "authorized") {
    return chaosOperatorAccessResponse(access);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chaos", "/chaos/:path*", "/api/chaos/:path*"],
};
