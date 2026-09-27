import { retrieveAuthorizedKnowledge } from "./knowledge-retrieval-service";
import type { RetrievalResult } from "@/lib/agent/knowledge-retrieval";

// Retrieve only reviewed, currently published bodies. The catalog is metadata,
// not an uploaded document, and another user's project is never a source.
export async function retrieveDesignKnowledge(userId: string, projectId: string, requirement: string): Promise<RetrievalResult> {
  return retrieveAuthorizedKnowledge({ userId, projectId, query: requirement, purpose: "design" });
}
