import { z } from "zod";

export const KNOWLEDGE_CAPABILITY = "project-knowledge-v1";
export const KNOWLEDGE_DOCUMENT_LIMIT = 20;
export const KNOWLEDGE_CONTENT_LIMIT = 6000;
export const KNOWLEDGE_CONTEXT_LIMIT = 24000;
export const isKnowledgeReviewer = (role?: string) => role === "admin" || role === "developer";
export const knowledgeDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_LIMIT),
  source: z.string().trim().min(1).max(1000),
  kind: z.enum(["manual", "schematic", "product", "sdk"]),
}).strict();
export type KnowledgeDraft = z.infer<typeof knowledgeDraftSchema>;
export type KnowledgeVersion = KnowledgeDraft & { version: number; sha256: string; reviewedBy: string; reviewedAt: string };
export type KnowledgeDocument = {
  id: string; revision: string; draft: KnowledgeDraft; publishedVersion: number | null;
  publishedDraftRevision: string | null; versions: KnowledgeVersion[]; updatedAt: string;
  submissionHash?: string;
  rejection?: { revision: string; reason: string; reviewedBy: string; reviewedAt: string };
};
export const knowledgeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), draft: knowledgeDraftSchema, submissionId: z.uuid().optional() }).strict(),
  z.object({ action: z.literal("edit"), documentId: z.uuid(), expectedRevision: z.uuid(), draft: knowledgeDraftSchema }).strict(),
  z.object({ action: z.literal("publish"), documentId: z.uuid(), expectedRevision: z.uuid(), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("disable"), documentId: z.uuid(), expectedRevision: z.uuid() }).strict(),
  z.object({ action: z.literal("reject"), documentId: z.uuid(), expectedRevision: z.uuid(), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("restore-draft"), documentId: z.uuid(), expectedRevision: z.uuid(), version: z.number().int().positive() }).strict(),
]);
export type KnowledgeAction = z.infer<typeof knowledgeActionSchema>;
export const needsKnowledgeReview = (doc: KnowledgeDocument) => doc.publishedDraftRevision !== doc.revision && doc.rejection?.revision !== doc.revision;
export const knowledgeSnapshotSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  documents: z.array(knowledgeDraftSchema.extend({
    documentId: z.uuid(), version: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedBy: z.uuid(), reviewedAt: z.iso.datetime(),
  })).max(KNOWLEDGE_DOCUMENT_LIMIT),
  contextReset: z.boolean(),
}).strict().refine(value => value.documents.reduce((sum, doc) => sum + doc.content.length, 0) <= KNOWLEDGE_CONTEXT_LIMIT);
export type KnowledgeSnapshot = z.infer<typeof knowledgeSnapshotSchema>;
export function knowledgeManifest(snapshot: KnowledgeSnapshot) {
  return { hash: snapshot.hash, contextReset: snapshot.contextReset, documents: snapshot.documents.map(({ documentId, title, version, sha256 }) => ({ documentId, title, version, sha256 })) };
}
