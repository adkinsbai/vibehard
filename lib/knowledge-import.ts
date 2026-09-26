import { createHash } from "node:crypto";

export type ImportMode = "text" | "pdf" | "image" | "eda" | "archive" | "metadata" | "reject";
export type ImportDecision = { mode: ImportMode; reason: string };

// Keep object identity independent of the physical Bucket. A later migration
// can copy verified objects and change the server-side Bucket mapping without
// changing document IDs or source references in the retrieval index.
export function knowledgeRawObjectKey(batchId: string, assetId: string, sha256: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(batchId) || !uuid.test(assetId) || !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new Error("无效的知识资料对象标识");
  }
  return `knowledge/raw/v1/${batchId.toLowerCase()}/${assetId.toLowerCase()}/${sha256.toLowerCase()}`;
}

const textExtensions = new Set(["md", "markdown", "txt", "csv", "json", "yaml", "yml", "xml", "rst", "c", "h", "cpp", "hpp", "py", "rs", "js", "ts"]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "tif", "tiff", "webp", "bmp"]);
const edaExtensions = new Set(["kicad_sch", "kicad_pcb", "schdoc", "pcbdoc", "easyeda"]);
const archiveExtensions = new Set(["zip", "7z", "rar", "tar", "gz"]);
const forbiddenExtensions = new Set(["env", "pem", "key", "p12", "pfx", "db", "sqlite", "sqlite3"]);
const forbiddenBasenames = new Set(["id_rsa", "id_ed25519", "credentials", "secrets", "config.json"]);

export function classifyKnowledgeFile(relativePath: string): ImportDecision {
  const filename = relativePath.split("/").at(-1)?.toLowerCase() ?? "";
  const extension = filename.includes(".") ? filename.split(".").at(-1)! : "";
  if (!filename || filename.startsWith(".") || forbiddenBasenames.has(filename) || forbiddenExtensions.has(extension) || /(?:^|[._-])(secrets?|credentials?|passwords?|tokens?|private)(?:[._-]|$)/i.test(filename)) {
    return { mode: "reject", reason: "敏感或隐藏文件，不进入上传候选" };
  }
  if (textExtensions.has(extension)) return { mode: "text", reason: "可提取正文；仍需来源与人工审核" };
  if (extension === "pdf") return { mode: "pdf", reason: "需解析页面；扫描件需 OCR" };
  if (imageExtensions.has(extension)) return { mode: "image", reason: "仅保留原件；文字检索需 OCR/视觉解析" };
  if (edaExtensions.has(extension)) return { mode: "eda", reason: "需专用 EDA 解析，不能按普通文本索引" };
  if (archiveExtensions.has(extension)) return { mode: "archive", reason: "先隔离清点，不自动解压或索引" };
  return { mode: "metadata", reason: "先保存元数据；未确认解析方式" };
}

export type TextChunk = { ordinal: number; start: number; end: number; text: string; sha256: string };
export const MAX_INDEXED_TEXT_CHARS = 2_000_000;

// Character offsets preserve a checkable location in the extracted text.
// Extractors must provide page/file metadata separately before indexing.
export function chunkKnowledgeText(input: string, maxChars = 1200, overlapChars = 120): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 200 || maxChars > 4000 || !Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars / 2) throw new Error("切分参数超出安全范围");
  const normalized = input.replace(/\r\n?/g, "\n");
  if (normalized.length > MAX_INDEXED_TEXT_CHARS) throw new Error("单份提取文本过大，需流式分段处理");
  const result: TextChunk[] = [];
  for (let start = 0; start < normalized.length;) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf("\n", end);
      if (boundary > start + Math.floor(maxChars * 0.6)) end = boundary + 1;
    }
    const text = normalized.slice(start, end).trim();
    if (text) result.push({ ordinal: result.length, start, end, text, sha256: createHash("sha256").update(text).digest("hex") });
    if (end === normalized.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return result;
}
