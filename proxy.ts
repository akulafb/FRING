import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  FRING_SESSION_COOKIE,
  gateSecretsConfigured,
  verifySessionToken,
} from "@/lib/fring/session-token";

function gateMisconfiguredResponse(request: NextRequest): NextResponse {
  const msg =
    "FRING access gate misconfigured: set FRING_ACCESS_PASSWORD and FRING_AUTH_SECRET.";
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  return new NextResponse(msg, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function proxy(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";

  if (!gateSecretsConfigured()) {
    if (isProd) {
      return gateMisconfiguredResponse(request);
    }
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (pathname === "/api/auth/login") {
    if (request.method === "POST") {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
  }

  const raw = request.cookies.get(FRING_SESSION_COOKIE)?.value;
  const ok = raw ? await verifySessionToken(raw) : false;

  if (ok) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "from",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/chat",
    "/chat/:path*",
    "/login",
    "/api/chat",
    "/api/auth/login",
  ],
};
