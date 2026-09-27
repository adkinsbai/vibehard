import type { RetrievalResult } from "@/lib/agent/knowledge-retrieval";
import { RETRIEVAL_CAPABILITY, retrievalEvidence, retrievalPayloadSchema } from "@/lib/agent/retrieval-payload";
import { knowledgeHash } from "./knowledge-state";

export function prepareRetrieval(value: RetrievalResult & { revision: string }, nativeThreadId: string | null, previous: unknown,
  runner?: { capabilities: string[]; status: string; lastHeartbeatAt: Date | null }) {
  const prior = previous && typeof previous === "object" && "revision" in previous ? previous.revision : undefined;
  const contextReset = Boolean(nativeThreadId && prior !== value.revision);
  const compatible = runner?.capabilities.includes(RETRIEVAL_CAPABILITY) && ["online", "busy"].includes(runner.status)
    && runner.lastHeartbeatAt && Date.now() - runner.lastHeartbeatAt.getTime() < 90000;
  if (!compatible) return { contextReset, payload: undefined, evidence: retrievalEvidence({ ...value, status: "partial", references: [], warnings: [...new Set([...(value.warnings ?? []), "LEGACY_RUNNER" as const])] }) };
  const data = { ...retrievalEvidence(value), revision: value.revision, context: value.context, contextReset };
  return { contextReset, evidence: retrievalEvidence(value), payload: retrievalPayloadSchema.parse({ ...data, hash: knowledgeHash(data) }) };
}
