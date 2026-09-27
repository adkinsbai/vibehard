import type { KnowledgeSnapshot } from "@/lib/agent/knowledge";
import { KNOWLEDGE_CAPABILITY } from "@/lib/agent/knowledge";

export class KnowledgeRunnerUnavailable extends Error {
  constructor() { super("项目已有正式知识，请选择支持项目知识库且心跳正常的 Runner（需要更新 Runner）"); }
}

export function prepareKnowledge(snapshot: KnowledgeSnapshot, nativeThreadId: string | null, previous: unknown,
  runner?: { capabilities: string[]; status: string; lastHeartbeatAt: Date | null }) {
  if (snapshot.documents.length && (!runner?.capabilities.includes(KNOWLEDGE_CAPABILITY)
    || !["online", "busy"].includes(runner.status) || !runner.lastHeartbeatAt
    || Date.now() - runner.lastHeartbeatAt.getTime() > 90_000)) throw new KnowledgeRunnerUnavailable();
  const priorHash = previous && typeof previous === "object" && "hash" in previous ? previous.hash : undefined;
  // Legacy no-knowledge conversations can resume; removing published knowledge also resets context.
  return { ...snapshot, contextReset: Boolean(nativeThreadId && priorHash !== snapshot.hash && (priorHash || snapshot.documents.length)) };
}
