import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import {
  FRING_SESSION_COOKIE,
  gateSecretsConfigured,
  signSessionToken,
} from "@/lib/fring/session-token";

export async function POST(req: Request) {
  const isProd = process.env.NODE_ENV === "production";

  if (!gateSecretsConfigured()) {
    if (isProd) {
      return NextResponse.json(
        { error: "Access gate misconfigured on server." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Gate not configured locally — set FRING_ACCESS_PASSWORD and FRING_AUTH_SECRET in .env.local (or omit both to disable the gate in development).",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const password =
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  const expected = process.env.FRING_ACCESS_PASSWORD!;
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await signSessionToken();
  const res = NextResponse.json({ ok: true as const });
  res.cookies.set(FRING_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
