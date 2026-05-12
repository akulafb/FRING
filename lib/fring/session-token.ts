import { SignJWT, jwtVerify } from "jose";

/** HttpOnly cookie carrying HS256 JWT — verified in proxy.ts (Edge). */
export const FRING_SESSION_COOKIE = "fring_session";

export function gateSecretsConfigured(): boolean {
  const p = process.env.FRING_ACCESS_PASSWORD?.trim();
  const s = process.env.FRING_AUTH_SECRET?.trim();
  return Boolean(p && s);
}

function encodedSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.FRING_AUTH_SECRET ?? "");
}

export async function signSessionToken(): Promise<string> {
  return new SignJWT({ sub: "fring-access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, encodedSecret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
