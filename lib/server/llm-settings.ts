import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, llmSettings } from "@/lib/db/schema";
import type { LlmDiscoveryInput, LlmInput, LlmPurpose, PublicLlm, RuntimeLlm } from "@/lib/agent/llm";

type Row = typeof llmSettings.$inferSelect;
declare global { var __vibehardLlmSettings: Map<string, Row> | undefined }
const memory = globalThis.__vibehardLlmSettings ??= new Map<string, Row>();

export class LlmConfigError extends Error {}
export class LlmConflictError extends LlmConfigError {}

function encryptionKey() {
  const secret = process.env.LLM_SETTINGS_SECRET || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new LlmConfigError("服务器未配置模型密钥加密凭据");
  return createHash("sha256").update(`vibehard:llm:v1:${secret || "development-only"}`).digest();
}
export function encryptKey(value: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((v) => v.toString("base64url")).join(".");
}
export function decryptKey(value: string, purpose: string) {
  const [iv, tag, ciphertext] = value.split(".").map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString("utf8");
}
async function read(purpose: LlmPurpose) {
  if (!db) {
    if (process.env.NODE_ENV === "production") throw new LlmConfigError("模型设置需要 PostgreSQL");
    return memory.get(purpose);
  }
  return (await db.select().from(llmSettings).where(eq(llmSettings.purpose, purpose)).limit(1))[0];
}
export async function publicLlm(purpose: LlmPurpose): Promise<PublicLlm> {
  const row = await read(purpose);
  return { purpose, baseUrl: row?.baseUrl ?? "", model: row?.model ?? "", protocol: row?.protocol as RuntimeLlm["protocol"] ?? (purpose === "agent" ? "responses" : "chat-completions"), hasApiKey: Boolean(row?.encryptedApiKey), revision: row?.revision ?? null, updatedAt: row?.updatedAt.toISOString() ?? null };
}
export async function runtimeLlm(purpose: LlmPurpose): Promise<RuntimeLlm | null> {
  const row = await read(purpose);
  return row ? { baseUrl: row.baseUrl, model: row.model, protocol: row.protocol as RuntimeLlm["protocol"], apiKey: decryptKey(row.encryptedApiKey, purpose), revision: row.revision } : null;
}
export async function candidateLlmCredentials(input: LlmDiscoveryInput) {
  const current = await read(input.purpose);
  if ((current?.revision ?? null) !== input.revision) throw new LlmConflictError("配置已被修改，请刷新页面后重试");
  const url = new URL(input.baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new LlmConfigError("Base URL 必须是无账号、查询参数的 HTTPS API 地址");
  const baseUrl = url.toString().replace(/\/+$/, "");
  if (/\/(responses|chat\/completions)$/.test(baseUrl)) throw new LlmConfigError("请填写 API 根地址，例如 https://服务商/v1，不要包含 /responses 或 /chat/completions");
  if (!input.apiKey && current && current.baseUrl !== baseUrl) throw new LlmConfigError("更换 Base URL 时请重新输入 API Key");
  const apiKey = input.apiKey || (current ? decryptKey(current.encryptedApiKey, input.purpose) : "");
  if (!apiKey) throw new LlmConfigError("请输入 API Key");
  return { baseUrl, apiKey };
}
export async function candidateLlm(input: LlmInput): Promise<RuntimeLlm> {
  const { baseUrl, apiKey } = await candidateLlmCredentials(input);
  return { baseUrl, model: input.model, protocol: input.protocol, apiKey, revision: input.revision ?? "" };
}
export async function saveLlm(input: LlmInput, userId: string | null) {
  const config = await candidateLlm(input);
  const value = { purpose: input.purpose, baseUrl: config.baseUrl, model: config.model, protocol: config.protocol, encryptedApiKey: encryptKey(config.apiKey, input.purpose), revision: randomUUID(), updatedAt: new Date() };
  if (!db) memory.set(input.purpose, { ...value, createdAt: new Date() });
  else await db.transaction(async (tx) => {
    // Optimistic update prevents two admin tabs silently overwriting credentials.
    if (input.revision) {
      const updated = await tx.update(llmSettings).set(value).where(eq(llmSettings.revision, input.revision)).returning({ purpose: llmSettings.purpose });
      if (!updated.length) throw new LlmConflictError("配置已被修改，请刷新页面后重试");
    } else {
      const inserted = await tx.insert(llmSettings).values(value).onConflictDoNothing().returning({ purpose: llmSettings.purpose });
      if (!inserted.length) throw new LlmConflictError("配置已被修改，请刷新页面后重试");
    }
    await tx.insert(auditLogs).values({ userId, action: "llm.settings.updated", metadata: { purpose: input.purpose, model: config.model, baseUrl: config.baseUrl, protocol: config.protocol } });
  });
  return publicLlm(input.purpose);
}
