import { z } from "zod";
export const RETRIEVAL_CAPABILITY = "bounded-retrieval-v1";
export const referenceSchema = z.object({
  scope: z.enum(["platform", "project"]), id: z.uuid(), projectId: z.uuid().optional(),
  reviewStatus: z.literal("auto-indexed").optional(), title: z.string().max(1000), source: z.string().max(2000),
  version: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/), excerpt: z.string().max(650),
});
export const retrievalEvidenceSchema = z.object({
  status: z.enum(["matched", "no-match", "partial"]), method: z.enum(["keyword-chunks-v1", "keyword-chunks-fts5-v1"]),
  references: z.array(referenceSchema).max(5), warnings: z.array(z.enum(["INDEX_UNAVAILABLE", "LEGACY_RUNNER"])).max(2).optional(),
  revision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const retrievalPayloadSchema = retrievalEvidenceSchema.extend({
  revision: z.string().regex(/^[a-f0-9]{64}$/), context: z.string().max(3200), contextReset: z.boolean(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type RetrievalEvidence = z.infer<typeof retrievalEvidenceSchema>;
export type RetrievalPayload = z.infer<typeof retrievalPayloadSchema>;
export function retrievalEvidence(value: RetrievalEvidence): RetrievalEvidence {
  return retrievalEvidenceSchema.parse(value); // strips context/hash and any unknown model fields
}
