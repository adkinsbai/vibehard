import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db";
import { projectKnowledge, projects, sharedKnowledge, users } from "@/lib/db/schema";
import { retrieveKnowledge, type RetrievalSource } from "@/lib/agent/knowledge-retrieval";
import { publishedSnapshot } from "./knowledge-state";
import { queryPrivateIndex } from "./retrieval-client";

const input = z.object({ userId: z.uuid(), projectId: z.uuid().optional(), query: z.string().min(1).max(50000), purpose: z.enum(["design", "agent", "eda"]) });
export class RetrievalAccessError extends Error { readonly status = 404; constructor() { super("项目不存在或无权访问"); } }
// One policy for all callers, including worker jobs; never accept sources or
// review labels from browsers. Accept a transaction to preserve Agent snapshot consistency.
export async function retrieveAuthorizedKnowledge(request: z.infer<typeof input>, database: Pick<ReturnType<typeof requireDb>, "select"> = requireDb()) {
  const { userId, projectId, query, purpose } = input.parse(request);
  if (purpose !== "eda" && !projectId) throw new RetrievalAccessError();
  const actor = (await database.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!actor) throw new RetrievalAccessError();
  if (projectId && !(await database.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1))[0]) throw new RetrievalAccessError();
  const [own, shared] = await Promise.all([
    projectId ? database.select({ documents: projectKnowledge.documents }).from(projectKnowledge).where(eq(projectKnowledge.projectId, projectId)).limit(1) : Promise.resolve([]),
    database.select({ id: sharedKnowledge.id, document: sharedKnowledge.document }).from(sharedKnowledge).orderBy(sharedKnowledge.id).limit(200),
  ]);
  const sources: RetrievalSource[] = publishedSnapshot(own[0]?.documents ?? []).documents.map(version => ({ scope: "project", id: version.documentId, projectId, version }));
  for (const entry of shared) {
    const version = entry.document.versions.find(v => v.version === entry.document.publishedVersion);
    if (version) sources.push({ scope: "platform", id: entry.id, version });
  }
  const publishedRevision = sources.map(s => [s.scope, s.id, s.version.version, s.version.sha256]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  let indexRevision = "unavailable"; let unavailable = false;
  try { const indexed = await queryPrivateIndex(query); indexRevision = indexed.revision; sources.push(...indexed.sources); }
  catch { unavailable = true; }
  const result = retrieveKnowledge(query, sources, purpose === "agent");
  return { ...result, ...(unavailable ? { status: "partial" as const, warnings: ["INDEX_UNAVAILABLE" as const] } : {}),
    revision: createHash("sha256").update(JSON.stringify({ projectId: projectId ?? null, publishedRevision, indexRevision })).digest("hex") };
}
