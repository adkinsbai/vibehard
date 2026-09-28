import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, findUserByEmail, writeAuditLog } from "@/lib/server/store";
import { hashPassword } from "@/lib/server/security";
import { writeSessionCookies } from "@/lib/server/session-cookies";
import { badRequest, serverError } from "@/lib/server/http";
import { consumeRateLimit, requestAddress } from "@/lib/server/rate-limit";

const schema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()), password: z.string().min(8).max(256), inviteCode: z.string().trim().min(1).max(100) });

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("注册信息不完整", parsed.error.flatten().fieldErrors);
    const rateLimit = consumeRateLimit("register", requestAddress(request), 5, 60 * 60_000);
    if (!rateLimit.allowed) return NextResponse.json({ error: "注册尝试过于频繁，请稍后重试" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
    const configuredCodes = process.env.INVITE_CODES;
    if (!configuredCodes && process.env.NODE_ENV === "production") return NextResponse.json({ error: "平台尚未配置内部邀请码" }, { status: 503 });
    const validCodes = (configuredCodes ?? "VIBE2026,DEVHARD,HARDWARE").split(",").map((code) => code.trim().toUpperCase());
    if (!validCodes.includes(parsed.data.inviteCode.trim().toUpperCase())) return badRequest("邀请码无效，请检查后重试");
    if (await findUserByEmail(parsed.data.email)) return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    const user = await createUser({ email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), inviteCode: parsed.data.inviteCode.trim().toUpperCase() });
    const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const response = NextResponse.json({ user: sessionUser }, { status: 201 });
    writeSessionCookies(response, user);
    await writeAuditLog({ userId: user.id, action: "auth.register", metadata: { address: requestAddress(request) } });
    return response;
  } catch (error) {
    return serverError(error);
  }
}
