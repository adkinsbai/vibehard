import { request } from "node:https";
import { providerAddress, upstreamError, LlmRequestError } from "./llm-client";

export interface ProviderModel { id: string; name: string }
const MODEL_ID = /^[\w./:@+-]{1,150}$/;
const MAX_BYTES = 1_000_000;
const MAX_MODELS = 2_000;

export function parseProviderModels(body: string): ProviderModel[] {
  let result: unknown;
  try { result = JSON.parse(body); }
  catch { throw new LlmRequestError("模型列表不是有效 JSON，请检查 API 根地址"); }
  if (!result || typeof result !== "object" || !Array.isArray((result as { data?: unknown }).data)) {
    throw new LlmRequestError("服务商未返回兼容的模型列表，请确认支持 GET /models");
  }
  const rows = (result as { data: unknown[] }).data;
  if (rows.length > MAX_MODELS) throw new LlmRequestError("模型列表过大，请改用手动输入模型 ID");
  const models = new Map<string, ProviderModel>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as { id?: unknown; name?: unknown };
    if (typeof value.id !== "string" || !MODEL_ID.test(value.id)) continue;
    const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 150) : value.id;
    models.set(value.id, { id: value.id, name });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function hideCredentialEcho(models: ProviderModel[], apiKey: string) {
  return models.filter(model => !model.id.includes(apiKey) && !model.name.includes(apiKey));
}

export async function listProviderModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<ProviderModel[]> {
  const address = await providerAddress(baseUrl);
  const url = new URL(`${baseUrl}/models`);
  const deadline = AbortSignal.timeout(12_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: "GET", signal: combined,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) req.destroy(new LlmRequestError("模型列表响应过大，请改用手动输入模型 ID"));
        else chunks.push(chunk);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", error => reject(error instanceof LlmRequestError ? error : new LlmRequestError(deadline.aborted ? "获取模型列表超时，请稍后重试" : "无法获取模型列表，请检查服务商地址或网络", deadline.aborted ? 504 : 502)));
    req.end();
  });
  if (response.status < 200 || response.status >= 300) throw upstreamError(response.status, response.body);
  // A provider must not be able to echo a previously stored secret through
  // model metadata that is returned to the administrator's browser.
  return hideCredentialEcho(parseProviderModels(response.body), apiKey);
}
