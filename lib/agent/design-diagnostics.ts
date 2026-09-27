export const designPhases = { queue: "排队", config: "读取模型配置", retrieval: "检索知识库", model: "请求模型", validation: "解析与校验", saving: "保存方案" } as const;
export type DesignPhase = keyof typeof designPhases;
export type DesignErrorCode = "CONFIG_MISSING" | "DNS" | "CONNECT" | "RATE_LIMIT" | "QUOTA" | "AUTH" | "PROTOCOL" | "OUTPUT_LIMIT" | "TIMEOUT" | "FORMAT" | "LEASE_EXPIRED" | "QUEUE_EXPIRED" | "RETRIEVAL" | "STORAGE" | "INTERNAL";
export type PhaseTiming = { phase: DesignPhase; startedAt: string; endedAt?: string; durationMs?: number };
// Fixed, content-free telemetry. Never add request/response bodies, URLs or credentials.
export type DesignDiagnostics = {
  version: 1; currentPhase: DesignPhase; phases: PhaseTiming[]; totalMs?: number;
  model?: string; modelRevision?: string; protocol?: string; errorCode?: DesignErrorCode;
  requestPolicy?: string;
  network?: { dnsMs?: number; tlsMs?: number; headersMs?: number; bodyMs?: number; status?: number; responseBytes?: number; providerStatus?: "completed" | "incomplete" | "failed"; outputTokens?: number };
};
export function queuedDiagnostics(now: Date): DesignDiagnostics {
  return { version: 1, currentPhase: "queue", phases: [{ phase: "queue", startedAt: now.toISOString() }] };
}
export function closePhase(d: DesignDiagnostics, now: Date) {
  const last = d.phases.at(-1);
  if (last && !last.endedAt) { last.endedAt = now.toISOString(); last.durationMs = Math.max(0, now.getTime() - Date.parse(last.startedAt)); }
}
export function enterPhase(d: DesignDiagnostics, phase: DesignPhase, now: Date) {
  closePhase(d, now); d.currentPhase = phase; d.phases.push({ phase, startedAt: now.toISOString() });
}
export function expiredDiagnostics(value: DesignDiagnostics | null, status: string, deadline: Date) {
  if (!value) return null; // Legacy jobs remain explicitly without diagnostics.
  const d = structuredClone(value); closePhase(d, deadline);
  d.errorCode = status === "queued" ? "QUEUE_EXPIRED" : "LEASE_EXPIRED";
  return d;
}
