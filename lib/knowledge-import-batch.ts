import { createHash } from "node:crypto";
import { knowledgeDraftSchema, type KnowledgeDraft } from "@/lib/agent/knowledge";
import type { SharedCategory } from "@/lib/agent/shared-knowledge";
import { chunkKnowledgeText } from "@/lib/knowledge-import";
import { changeKnowledge } from "@/lib/server/knowledge-state";

export type ImportPage = { page: number | null; text: string };
export type ImportSource = {
  path: string;
  title: string;
  category: SharedCategory;
  kind: KnowledgeDraft["kind"];
  fileSha256: string;
  pages: ImportPage[];
};
export type PreparedKnowledgeEntry = {
  id: string;
  category: SharedCategory;
  draft: KnowledgeDraft;
};

const unsafeContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[a-z0-9_-]{20,}\b/i,
  /(?:api[_-]?key|access[_-]?token|password|passwd|secret)\s*[:=]\s*["']?[^\s"'<>]{12,}/i,
];

function stableUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A deliberately small, explicit batch for validating retrieval. It is not a
// bulk 8 GB importer and does not publish or upload anything by itself.
export function prepareKnowledgeSource(source: ImportSource): PreparedKnowledgeEntry[] {
  if (!/^(RV1106|RV1126B)\/[a-zA-Z0-9_./ -]+\.(?:md|pdf)$/.test(source.path) || source.path.includes("..") ||
      !/^[a-f0-9]{64}$/i.test(source.fileSha256) || source.pages.length === 0 || source.pages.length > 300) {
    throw new Error("知识来源路径、哈希或页数无效");
  }
  const entries: PreparedKnowledgeEntry[] = [];
  for (const page of source.pages) {
    if (page.page !== null && (!Number.isInteger(page.page) || page.page < 1)) throw new Error("PDF 页码无效");
    const text = page.text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
    if (!text) continue;
    if (unsafeContent.some(pattern => pattern.test(text))) throw new Error(`资料疑似包含凭据，拒绝导入：${source.path}`);
    const chunks = chunkKnowledgeText(text, 3500, 180);
    chunks.forEach((chunk, index) => {
      const location = page.page === null ? `part-${index + 1}` : `page-${page.page}-part-${index + 1}`;
      const draft = knowledgeDraftSchema.parse({
        title: `${source.title} · ${page.page === null ? `第 ${index + 1} 段` : `第 ${page.page} 页${chunks.length > 1 ? `/${index + 1}` : ""}`}`,
        content: chunk.text,
        source: `${source.path}#${location} (file SHA256 ${source.fileSha256.toLowerCase()})`,
        kind: source.kind,
      });
      entries.push({ id: stableUuid(`vibehard-knowledge-import/v1/${source.path}/${location}`), category: source.category, draft });
    });
  }
  return entries;
}

// Only the guarded batch CLI calls this. It records the authorized operator as
// publisher; the batch audit log separately records that no manual review ran.
export function directPublishedKnowledgeDocument(entry: PreparedKnowledgeEntry, operatorId: string) {
  const created = changeKnowledge([], { action: "create", draft: entry.draft, submissionId: entry.id }, operatorId)[0];
  return changeKnowledge([created], { action: "publish", documentId: entry.id, expectedRevision: created.revision, confirmed: true }, operatorId)[0];
}
