import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, projectKnowledge, projects, users } from "@/lib/db/schema";
import { isKnowledgeReviewer, needsKnowledgeReview, type KnowledgeAction, type KnowledgeDocument } from "@/lib/agent/knowledge";
import { changeKnowledge, publishedSnapshot } from "./knowledge-state";
import { findUserById } from "./store";

declare global { var __vibehardKnowledge: Map<string, KnowledgeDocument[]> | undefined }
const memory = globalThis.__vibehardKnowledge ??= new Map<string, KnowledgeDocument[]>();
export class KnowledgeForbidden extends Error {}
const reviewAction = (action: KnowledgeAction) => ["publish", "reject", "disable"].includes(action.action);

export async function getProjectKnowledgeView(userId: string, projectId: string) {
  const user = await findUserById(userId);
  if (!user) return null;
  const project = db ? (await db.select({ id: projects.id, name: projects.name, userId: projects.userId }).from(projects).where(eq(projects.id, projectId)).limit(1))[0]
    : globalThis.__vibehardMemoryStore?.projects.find(project => project.id === projectId);
  if (!project || (project.userId !== userId && !isKnowledgeReviewer(user.role))) return null;
  const documents = db ? (await db.select().from(projectKnowledge).where(eq(projectKnowledge.projectId, projectId)).limit(1))[0]?.documents ?? [] : structuredClone(memory.get(projectId) ?? []);
  return { documents, projectName: project.name, permissions: { canEdit: project.userId === userId, canReview: isKnowledgeReviewer(user.role) } };
}
export async function getProjectKnowledge(userId: string, projectId: string) {
  return (await getProjectKnowledgeView(userId, projectId))?.documents ?? null;
}

// Paginate projects; return only knowledge metadata, never workspace paths/chats/files.
export async function listKnowledgeReviewProjects(userId: string, after?: string) {
  if (!isKnowledgeReviewer((await findUserById(userId))?.role)) return null;
  const rows = db ? await db.select({ id: projects.id, name: projects.name, documents: projectKnowledge.documents }).from(projectKnowledge).innerJoin(projects, eq(projectKnowledge.projectId, projects.id)).where(after ? gt(projects.id, after) : undefined).orderBy(asc(projects.id)).limit(11)
    : [...memory].flatMap(([id, documents]) => {
      const project = globalThis.__vibehardMemoryStore?.projects.find(project => project.id === id);
      return project && (!after || id > after) ? [{ id, name: project.name, documents }] : [];
    }).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 11);
  return { projects: rows.slice(0, 10).map(row => ({ id: row.id, name: row.name, documents: row.documents.map(doc => ({ id: doc.id, title: doc.draft.title, pending: needsKnowledgeReview(doc), rejected: doc.rejection?.revision === doc.revision, publishedVersion: doc.publishedVersion })) })), nextCursor: rows.length > 10 ? rows[9].id : null };
}

export async function updateProjectKnowledge(userId: string, projectId: string, action: KnowledgeAction) {
  if (!db) {
    const view = await getProjectKnowledgeView(userId, projectId);
    if (!view) return null;
    if (reviewAction(action) ? !view.permissions.canReview : !view.permissions.canEdit) throw new KnowledgeForbidden("仅管理员或开发者可审核；仅项目所有者可提交和修改草稿");
    // Re-read after awaits; no await between reading and replacing state.
    const documents = changeKnowledge(memory.get(projectId) ?? [], action, userId);
    memory.set(projectId, documents);
    return structuredClone(documents);
  }
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge:${projectId}`}))`);
    // Check current persisted role, not the role in a cookie or browser request. Lock against concurrent demotion.
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("share");
    const [project] = await tx.select({ userId: projects.userId }).from(projects).where(eq(projects.id, projectId)).for("share");
    if (!actor || !project || (project.userId !== userId && !isKnowledgeReviewer(actor.role))) return null;
    if (reviewAction(action) ? !isKnowledgeReviewer(actor.role) : project.userId !== userId) throw new KnowledgeForbidden("仅管理员或开发者可审核；仅项目所有者可提交和修改草稿");
    const current = (await tx.select().from(projectKnowledge).where(eq(projectKnowledge.projectId, projectId)).limit(1))[0]?.documents ?? [];
    const documents = changeKnowledge(current, action, userId);
    await tx.insert(projectKnowledge).values({ projectId, documents }).onConflictDoUpdate({ target: projectKnowledge.projectId, set: { documents, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ userId, projectId, action: `knowledge.${action.action}`, metadata: { documentId: "documentId" in action ? action.documentId : action.submissionId ?? documents.at(-1)?.id, snapshotHash: publishedSnapshot(documents).hash, ...(action.action === "reject" ? { reason: action.reason } : {}) } });
    return documents;
  });
}
