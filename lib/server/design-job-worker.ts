import { DESIGN_MODEL_MS } from "@/lib/agent/design-jobs";
import { closePhase, designPhases, enterPhase, queuedDiagnostics, type DesignDiagnostics, type DesignPhase } from "@/lib/agent/design-diagnostics";
import { designMessages } from "@/lib/agent/design-prompt";
import { designResultSchema } from "@/lib/agent/llm";
import { freezeBomPrices } from "@/lib/bom-price-snapshots";
import { HARDWARE_DESIGN_KNOWLEDGE } from "@/lib/agent/hardware-design-knowledge";
import { claimDesign, finishDesign, saveDesignDiagnostics } from "./design-job-store";
import { callLlm, designRequestPolicy, LlmRequestError } from "./llm-client";
import { runtimeLlm } from "./llm-settings";
import { retrieveDesignKnowledge } from "./design-knowledge";
import { retrievalEvidence } from "@/lib/agent/retrieval-payload";

// The hard deadline includes configuration lookup and DNS, not only the TLS request.
export async function boundedDesign<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs = DESIGN_MODEL_MS) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new LlmRequestError("模型响应超时，需求已保存，请手动重试或联系管理员", 504, "TIMEOUT")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); controller.abort(); }
}
// Isolation tests exercise this exact queue/worker path; no automatic retries.
const defaults = { claimDesign, finishDesign, saveDesignDiagnostics, runtimeLlm, retrieveDesignKnowledge, callLlm };
export class DesignStorageUnavailableError extends Error {
  constructor() { super("Design storage deadline exceeded; recycle worker connections"); this.name = "DesignStorageUnavailableError"; }
}
export async function processNextDesign(deps = defaults, timeoutMs = DESIGN_MODEL_MS) {
  // A pool wait/queue lock must not prevent the supervisor recycling this process.
  let job;
  try { job = await boundedDesign(() => deps.claimDesign(), Math.min(5000, timeoutMs)); }
  catch { throw new DesignStorageUnavailableError(); }
  if (!job) return false;
  const began = Date.now(); const deadline = began + timeoutMs;
  // Reserve failure-persistence time INSIDE the total budget, never extend it.
  const settlementMs = Math.max(1, Math.min(2000, Math.floor(timeoutMs / 10)));
  const executionDeadline = deadline - settlementMs;
  const diagnostics: DesignDiagnostics = structuredClone(job.diagnostics ?? queuedDiagnostics(job.createdAt));
  try {
    await boundedDesign(async signal => {
      const stage = async (phase: DesignPhase) => {
        signal.throwIfAborted(); enterPhase(diagnostics, phase, new Date());
        let saved;
        try { saved = await deps.saveDesignDiagnostics(job.id, job.leaseToken!, structuredClone(diagnostics)); }
        catch { throw new LlmRequestError("任务状态保存失败，需求已保留，请稍后手动重试", 503, "STORAGE"); }
        if (!saved) throw new LlmRequestError("任务租约已失效，请手动重试", 409, "LEASE_EXPIRED");
        signal.throwIfAborted();
      };
      await stage("config");
      const config = await deps.runtimeLlm("design");
      if (!config) throw new LlmRequestError("尚未配置方案生成模型，请联系管理员", 503, "CONFIG_MISSING");
      diagnostics.model = config.model; diagnostics.modelRevision = config.revision; diagnostics.protocol = config.protocol;
      diagnostics.requestPolicy = designRequestPolicy(config);
      await stage("retrieval");
      const retrieval = await deps.retrieveDesignKnowledge(job.userId, job.projectId, job.requirement);
      await stage("model");
      const { system, prompt } = designMessages(job.requirement, retrieval);
      diagnostics.network = {};
      const text = await deps.callLlm(config, system, prompt, signal, Math.max(1, executionDeadline - Date.now()), undefined, diagnostics.network, { profile: "design-draft" });
      await stage("validation");
      let raw;
      try { raw = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { throw new LlmRequestError("模型返回的方案格式不正确，请手动重试", 502, "FORMAT"); }
      const parsed = designResultSchema.omit({ retrieval: true }).safeParse(raw);
      if (!parsed.success) throw new LlmRequestError("模型返回的方案字段不完整，请手动重试", 502, "FORMAT");
      await stage("saving");
      const saved = await deps.finishDesign(job.id, job.leaseToken!, { result: { ...freezeBomPrices(parsed.data), retrieval: retrievalEvidence(retrieval) }, model: config.model, knowledgeVersion: HARDWARE_DESIGN_KNOWLEDGE.version, diagnostics: structuredClone(diagnostics) }, executionDeadline);
      if (!saved) throw new LlmRequestError("任务保存期限或租约已失效，请手动重试", 409, Date.now() >= executionDeadline ? "TIMEOUT" : "LEASE_EXPIRED");
    }, Math.max(1, executionDeadline - Date.now()));
  } catch (error) {
    closePhase(diagnostics, new Date()); diagnostics.totalMs = Date.now() - began;
    diagnostics.errorCode = Date.now() >= deadline ? "TIMEOUT" : error instanceof LlmRequestError ? error.code : diagnostics.currentPhase === "retrieval" ? "RETRIEVAL" : diagnostics.currentPhase === "saving" ? "STORAGE" : "INTERNAL";
    const message = diagnostics.errorCode === "TIMEOUT" ? `${designPhases[diagnostics.currentPhase]}阶段超时（总上限 90 秒），需求已保存，请手动重试或联系管理员。`
      : error instanceof LlmRequestError ? error.message : `${designPhases[diagnostics.currentPhase]}失败，需求已保存，请手动重试或联系管理员。`;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DesignStorageUnavailableError();
      await boundedDesign(() => deps.finishDesign(job.id, job.leaseToken!, { error: message, diagnostics: structuredClone(diagnostics) }, deadline), remaining);
    } catch { throw new DesignStorageUnavailableError(); }
    // A successful failure write does not cancel the timed-out phase's SQL.
    // Recycle on any exhausted execution budget, even if diagnostics were saved.
    if (Date.now() >= executionDeadline) throw new DesignStorageUnavailableError();
  }
  return true;
}
