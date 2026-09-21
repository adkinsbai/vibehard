import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import type { RuntimeLlm } from "@/lib/agent/llm";

export class LlmRequestError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Accept global unicast only; exclude mapped IPv4, loopback, link-local and ULA.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(0:|db8:)/i.test(address);
}
export async function providerAddress(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new LlmRequestError("模型服务必须使用 HTTPS API 根地址", 400);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try { addresses = await lookup(hostname, { all: true }); }
  catch { throw new LlmRequestError("模型服务域名解析失败，请检查 Base URL", 502); }
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new LlmRequestError("模型地址不能指向本机或私有网络", 400);
  return addresses[0];
}
export function upstreamError(status: number, body = "") {
  if (status === 401 || status === 403) return new LlmRequestError("模型服务拒绝认证：请检查 API Key 和模型访问权限", 502);
  if (status === 402 || (status === 429 && /quota|balance|credit|billing|insufficient|余额|额度/i.test(body))) return new LlmRequestError("模型服务额度不足，请充值或在管理页更换 API Key", 502);
  if (status === 429) return new LlmRequestError("模型服务限流或额度不足，请稍后重试或更换 API Key（HTTP 429）", 503);
  if (status === 404) return new LlmRequestError("模型或接口不存在，请检查模型名称、Base URL 与协议（HTTP 404）", 502);
  return new LlmRequestError(`模型服务请求失败（HTTP ${status}），请检查协议和模型配置`, 502);
}

export type LlmAttachment = { filename: string; mimeType: "image/png" | "image/jpeg" | "application/pdf"; base64: string };
export function llmRequestBody(config: RuntimeLlm, system: string, prompt: string, attachment?: LlmAttachment) {
  const url = attachment ? `data:${attachment.mimeType};base64,${attachment.base64}` : "";
  if (config.protocol === "responses") return { model: config.model, instructions: system, input: attachment ? [{ role: "user", content: [
    { type: "input_text", text: prompt },
    attachment.mimeType === "application/pdf" ? { type: "input_file", filename: attachment.filename, file_data: url } : { type: "input_image", image_url: url, detail: "high" },
  ] }] : prompt, stream: false, store: false };
  return { model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: attachment ? [
    { type: "text", text: prompt },
    attachment.mimeType === "application/pdf" ? { type: "file", file: { filename: attachment.filename, file_data: url } } : { type: "image_url", image_url: { url, detail: "high" } },
  ] : prompt }], stream: false };
}

// DNS is validated and pinned to the TLS request; redirects are never followed.
export async function callLlm(config: RuntimeLlm, system: string, prompt: string, signal?: AbortSignal, timeoutMs = 90_000, attachment?: LlmAttachment) {
  const address = await providerAddress(config.baseUrl);
  const url = new URL(config.baseUrl + (config.protocol === "responses" ? "/responses" : "/chat/completions"));
  const body = JSON.stringify(llmRequestBody(config, system, prompt, attachment));
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: "POST", signal: combined,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (res) => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) req.destroy(new Error("response too large")); else chunks.push(chunk); });
      res.on("end", () => resolve({ status: res.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", () => reject(new LlmRequestError(timeout.aborted ? "模型响应超时，请重试或更换服务商" : signal?.aborted ? "请求已取消" : "无法连接模型服务，请检查服务商网络与配置", timeout.aborted ? 504 : 502)));
    req.end(body);
  });
  if (response.status < 200 || response.status >= 300) throw upstreamError(response.status, response.body);
  let data;
  try { data = JSON.parse(response.body); } catch { throw new LlmRequestError("模型服务返回了非 JSON 响应，请检查 API 根地址与协议"); }
  if (data.error || data.status === "failed" || data.status === "incomplete") throw new LlmRequestError("模型未完成回答，请检查额度或重试");
  const text = config.protocol === "responses"
    ? (typeof data.output_text === "string" ? data.output_text : (Array.isArray(data.output) ? data.output : []).flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content ?? []).filter((item: { type?: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join(""))
    : data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new LlmRequestError("模型没有返回文本，接口协议或模型可能不兼容");
  return text.trim().split(config.apiKey).join("[REDACTED]");
}
