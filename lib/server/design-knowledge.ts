import { and, eq } from "drizzle-orm";
import { retrieveKnowledge, type RetrievalSource } from "@/lib/agent/knowledge-retrieval";
import { requireDb } from "@/lib/db";
import { projectKnowledge, projects, sharedKnowledge } from "@/lib/db/schema";
import { publishedSnapshot } from "./knowledge-state";
import { searchIndexedKnowledge } from "./oss-knowledge-index";

// Retrieve only reviewed, currently published bodies. The catalog is metadata,
// not an uploaded document, and another user's project is never a source.
export async function retrieveDesignKnowledge(userId: string, projectId: string, requirement: string) {
  const database = requireDb();
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) throw new Error("方案所属项目不存在或无权访问");
  const [own, shared] = await Promise.all([
    database.select({ documents: projectKnowledge.documents }).from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, projectId)).limit(1),
    database.select({ id: sharedKnowledge.id, document: sharedKnowledge.document }).from(sharedKnowledge).limit(200),
  ]);
  const sources: RetrievalSource[] = [];
  for (const version of publishedSnapshot(own[0]?.documents ?? []).documents) {
    sources.push({ scope: "project", id: version.documentId, projectId, version });
  }
  for (const entry of shared) {
    const version = entry.document.versions.find(item => item.version === entry.document.publishedVersion);
    if (version) sources.push({ scope: "platform", id: entry.id, version });
  }
  // The private FTS index is queried only after current project ownership is
  // checked. Auto-screened sources never enter the reviewed publication table.
  sources.push(...await searchIndexedKnowledge(requirement));
  return retrieveKnowledge(requirement, sources);
}
