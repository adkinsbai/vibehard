import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, sessionCookiePath, type SessionAccount } from "./security";

/** Set/clear the current session and expire the legacy root cookie atomically. */
export function writeSessionCookies(response: NextResponse, user: SessionAccount | null) {
  const path = sessionCookiePath();
  const secure = process.env.NODE_ENV === "production";
  const token = user ? createSessionToken(user) : "";
  for (const cookiePath of new Set([path, "/"])) {
    const active = user !== null && cookiePath === path;
    // ResponseCookies is keyed by name, so two .set() calls on one response
    // silently discard one path. Serialize separately and append both headers.
    // Do not mutate response.cookies after this helper: that rewrites the headers.
    const serialized = new NextResponse();
    serialized.cookies.set(AUTH_COOKIE, active ? token : "", {
      httpOnly: true, sameSite: "lax", secure, path: cookiePath,
      maxAge: active ? 60 * 60 * 24 * 7 : 0,
      ...(active ? { priority: "high" as const } : {}),
    });
    response.headers.append("Set-Cookie", serialized.headers.get("Set-Cookie")!);
  }
  response.headers.set("Cache-Control", "no-store");
}
