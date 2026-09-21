import { createHash, randomUUID } from "node:crypto";
import { KNOWLEDGE_CONTEXT_LIMIT, KNOWLEDGE_DOCUMENT_LIMIT, type KnowledgeAction, type KnowledgeDocument, type KnowledgeSnapshot } from "@/lib/agent/knowledge";

export class KnowledgeConflict extends Error {}
export class KnowledgeLimit extends Error {}
export const knowledgeHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");

export function publishedSnapshot(documents: KnowledgeDocument[]): KnowledgeSnapshot {
  const published = documents.flatMap(doc => {
    const version = doc.versions.find(item => item.version === doc.publishedVersion);
    return version ? [{ documentId: doc.id, ...version }] : [];
  }).sort((a, b) => a.documentId.localeCompare(b.documentId));
  return { hash: knowledgeHash(published), documents: published, contextReset: false };
}

// Pure copy-on-write transitions: published versions never change when a draft is edited.
export function changeKnowledge(current: KnowledgeDocument[], action: KnowledgeAction, userId: string) {
  const documents = structuredClone(current);
  const timestamp = new Date().toISOString();
  if (action.action === "create") {
    const existing = action.submissionId ? documents.find(doc => doc.id === action.submissionId) : undefined;
    if (existing) {
      if (existing.submissionHash !== knowledgeHash(action.draft)) throw new KnowledgeConflict("该申请编号已用于其他内容，请打开已有资料核对");
      return documents; // Retry never overwrites later review/edit/publication.
    }
    if (documents.length >= KNOWLEDGE_DOCUMENT_LIMIT) throw new KnowledgeLimit("每个项目最多 20 份资料，请整理已有条目");
    documents.push({ id: action.submissionId ?? randomUUID(), ...(action.submissionId ? { submissionHash: knowledgeHash(action.draft) } : {}), revision: randomUUID(), draft: action.draft, versions: [], publishedVersion: null, publishedDraftRevision: null, updatedAt: timestamp });
  } else {
    const doc = documents.find(item => item.id === action.documentId);
    if (!doc || doc.revision !== action.expectedRevision) throw new KnowledgeConflict("资料已更新或不存在，请刷新后重新核对");
    if (action.action === "edit") doc.draft = action.draft;
    if (action.action === "restore-draft") {
      const version = doc.versions.find(item => item.version === action.version);
      if (!version) throw new KnowledgeConflict("历史版本不存在");
      const { title, content, source, kind } = version;
      doc.draft = { title, content, source, kind };
    }
    if (action.action === "disable") doc.publishedVersion = null;
    doc.revision = randomUUID();
    doc.updatedAt = timestamp;
    if (action.action === "edit" || action.action === "restore-draft" || action.action === "publish") delete doc.rejection;
    if (action.action === "reject") doc.rejection = { revision: doc.revision, reason: action.reason, reviewedBy: userId, reviewedAt: timestamp };
    if (action.action === "publish") {
      if (doc.versions.length >= 20) throw new KnowledgeLimit("该资料已达到 20 个版本的首版保留上限");
      const version = doc.versions.length + 1;
      doc.versions.push({ ...doc.draft, version, sha256: knowledgeHash(doc.draft), reviewedBy: userId, reviewedAt: timestamp });
      doc.publishedVersion = version;
      doc.publishedDraftRevision = doc.revision;
    }
  }
  const snapshot = publishedSnapshot(documents);
  if (snapshot.documents.reduce((sum, doc) => sum + doc.content.length, 0) > KNOWLEDGE_CONTEXT_LIMIT) throw new KnowledgeLimit("已发布正文合计不能超过 24000 字，请先停用不需要的资料");
  if (Buffer.byteLength(JSON.stringify(documents)) > 1_000_000) throw new KnowledgeLimit("项目资料及历史总量超过 1 MB，请联系管理员整理");
  return documents;
}
