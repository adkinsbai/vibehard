import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, findUserByEmail, writeAuditLog } from "@/lib/server/store";
import { hashPassword, verifyPassword } from "@/lib/server/security";
import { writeSessionCookies } from "@/lib/server/session-cookies";
import { badRequest, serverError } from "@/lib/server/http";
import { clearRateLimit, consumeRateLimit, requestAddress } from "@/lib/server/rate-limit";

const schema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()), password: z.string().min(8).max(256) });

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("邮箱或密码格式不正确", parsed.error.flatten().fieldErrors);
    const address = requestAddress(request);
    const addressLimit = consumeRateLimit("login-address", address, 100, 15 * 60_000);
    if (!addressLimit.allowed) return NextResponse.json({ error: "登录尝试过于频繁，请稍后重试" }, { status: 429, headers: { "Retry-After": String(addressLimit.retryAfterSeconds) } });
    const rateKey = `${address}:${parsed.data.email}`;
    const rateLimit = consumeRateLimit("login", rateKey, 10, 15 * 60_000);
    if (!rateLimit.allowed) return NextResponse.json({ error: "登录尝试过于频繁，请稍后重试" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
    let user = await findUserByEmail(parsed.data.email);
    if (!user && process.env.NODE_ENV !== "production" && parsed.data.email === "demo@vibehard.ai" && parsed.data.password === "demo1234") {
      user = await createUser({ email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), inviteCode: "DEMO", name: "Demo 用户" });
    }
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    clearRateLimit("login", rateKey);
    const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const response = NextResponse.json({ user: sessionUser });
    writeSessionCookies(response, user);
    await writeAuditLog({ userId: user.id, action: "auth.login", metadata: { address } });
    return response;
  } catch (error) {
    return serverError(error);
  }
}
