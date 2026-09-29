import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE, readSessionToken, sessionMatchesAccount } from "./security";
import { findUserById } from "./store";

export async function requestUser(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (!session) return null;
  const user = await findUserById(session.id);
  return user && sessionMatchesAccount(session, user) ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}
export function unauthorized(message = "请先登录") { return NextResponse.json({ error: message }, { status: 401 }); }
export function forbidden(message = "无权访问该资源") { return NextResponse.json({ error: message }, { status: 403 }); }
export function badRequest(message: string, details?: unknown) { return NextResponse.json({ error: message, details }, { status: 400 }); }
export function conflict(message: string) { return NextResponse.json({ error: message }, { status: 409 }); }
export function isResourceId(value: string) { return z.uuid().safeParse(value).success; }
export function serverError(error: unknown) { console.error(error); return NextResponse.json({ error: "服务暂时不可用" }, { status: 500 }); }
