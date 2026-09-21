import { createHash } from "node:crypto";
import { SCHEMATIC_FILE_LIMIT } from "@/lib/agent/schematic";
import { LlmRequestError, type LlmAttachment } from "./llm-client";

// Bound bytes before multipart parsing, including chunked requests with no Content-Length.
export async function readSchematicUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) throw new LlmRequestError("请使用文件上传表单", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new LlmRequestError("请选择原理图文件", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > SCHEMATIC_FILE_LIMIT + 32_768) { await reader.cancel(); throw new LlmRequestError("上传请求超过 5 MB 文件限制", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new LlmRequestError("文件表单格式不正确", 400); }
  const file = form.get("file");
  if (form.getAll("file").length !== 1 || !file || typeof file === "string") throw new LlmRequestError("每次请选择一个原理图文件", 400);
  if (!file.size || file.size > SCHEMATIC_FILE_LIMIT) throw new LlmRequestError("文件不能为空且不得超过 5 MB", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
      : bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : null;
  const extension = mimeType === "image/png" ? /\.png$/i : mimeType === "image/jpeg" ? /\.jpe?g$/i : /\.pdf$/i;
  if (!mimeType || !extension.test(file.name) || (file.type && file.type !== mimeType && file.type !== "application/octet-stream")) throw new LlmRequestError("仅支持内容与扩展名一致的 PNG / JPG / PDF", 400);
  // This is signature validation, not a full PDF/image parser or malware scan. Never execute/retain uploads.
  const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(-180);
  return { attachment: { filename, mimeType, base64: bytes.toString("base64") } satisfies LlmAttachment, sha256: createHash("sha256").update(bytes).digest("hex") };
}
