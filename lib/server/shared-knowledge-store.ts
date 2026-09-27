import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { auditLogs, sharedKnowledge, users } from "@/lib/db/schema";
import { isKnowledgeReviewer, needsKnowledgeReview, type KnowledgeAction } from "@/lib/agent/knowledge";
import type { SharedCategory } from "@/lib/agent/shared-knowledge";
import { changeKnowledge, KnowledgeConflict } from "./knowledge-state";

export const SHARED_KNOWLEDGE_LIMIT = 200;
export class SharedKnowledgeForbidden extends Error {}
export class SharedKnowledgeLimit extends Error {}

export async function listSharedKnowledge(userId: string, category?: SharedCategory) {
  const database = requireDb();
  const [actor] = await database.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!isKnowledgeReviewer(actor?.role)) throw new SharedKnowledgeForbidden();
  return database.select({ id: sharedKnowledge.id, category: sharedKnowledge.category, document: sharedKnowledge.document, createdBy: sharedKnowledge.createdBy })
    .from(sharedKnowledge).where(category ? eq(sharedKnowledge.category, category) : undefined).orderBy(asc(sharedKnowledge.createdAt)).limit(SHARED_KNOWLEDGE_LIMIT);
}

export async function mutateSharedKnowledge(userId: string, category: SharedCategory, action: KnowledgeAction) {
  return requireDb().transaction(async tx => {
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("share");
    if (!isKnowledgeReviewer(actor?.role)) throw new SharedKnowledgeForbidden();
    if (action.action === "create") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vibehard:shared-knowledge'))`);
      const existing = await tx.select({ id: sharedKnowledge.id }).from(sharedKnowledge).limit(SHARED_KNOWLEDGE_LIMIT);
      if (existing.length >= SHARED_KNOWLEDGE_LIMIT) throw new SharedKnowledgeLimit("平台知识库已达到首版 200 份上限，请先整理资料");
      const id = randomUUID();
      const document = changeKnowledge([], { ...action, submissionId: id }, userId)[0];
      await tx.insert(sharedKnowledge).values({ id, category, document, createdBy: userId });
      await tx.insert(auditLogs).values({ userId, action: "sharedKnowledge.create", metadata: { documentId: id, category } });
      return { id, category, document, createdBy: userId };
    }
    const [entry] = await tx.select().from(sharedKnowledge).where(eq(sharedKnowledge.id, action.documentId)).for("update");
    if (!entry) throw new KnowledgeConflict("资料不存在或已更新，请刷新后核对");
    if (action.action === "edit" || action.action === "restore-draft") {
      if (entry.createdBy !== userId) throw new SharedKnowledgeForbidden();
    }
    if ((action.action === "publish" || action.action === "reject") && !needsKnowledgeReview(entry.document)) throw new KnowledgeConflict("当前草稿没有待审核变更");
    if (action.action === "disable" && entry.document.publishedVersion === null) throw new KnowledgeConflict("资料尚未发布或已经停用");
    const document = changeKnowledge([entry.document], action, userId)[0];
    await tx.update(sharedKnowledge).set({ document, updatedAt: new Date() }).where(eq(sharedKnowledge.id, entry.id));
    await tx.insert(auditLogs).values({ userId, action: `sharedKnowledge.${action.action}`, metadata: { documentId: entry.id, category: entry.category, publishedVersion: document.publishedVersion } });
    return { id: entry.id, category: entry.category, document, createdBy: entry.createdBy };
  });
}
