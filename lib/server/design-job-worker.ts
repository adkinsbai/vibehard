import { DESIGN_MODEL_MS } from "@/lib/agent/design-jobs";
import { closePhase, designPhases, enterPhase, queuedDiagnostics, type DesignDiagnostics, type DesignPhase } from "@/lib/agent/design-diagnostics";
import { designMessages } from "@/lib/agent/design-prompt";
import { designResultSchema } from "@/lib/agent/llm";
import { HARDWARE_DESIGN_KNOWLEDGE } from "@/lib/agent/hardware-design-knowledge";
import { claimDesign, finishDesign, saveDesignDiagnostics } from "./design-job-store";
import { callLlm, designRequestPolicy, LlmRequestError } from "./llm-client";
import { runtimeLlm } from "./llm-settings";
import { retrieveDesignKnowledge } from "./design-knowledge";

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
export async function processNextDesign(deps = defaults, timeoutMs = DESIGN_MODEL_MS) {
  const job = await deps.claimDesign();
  if (!job) return false;
  const began = Date.now(); const deadline = began + timeoutMs;
  const diagnostics: DesignDiagnostics = structuredClone(job.diagnostics ?? queuedDiagnostics(job.createdAt));
  try {
    await boundedDesign(async signal => {
      const stage = async (phase: DesignPhase) => {
        signal.throwIfAborted(); enterPhase(diagnostics, phase, new Date());
        if (!await deps.saveDesignDiagnostics(job.id, job.leaseToken!, structuredClone(diagnostics))) throw new LlmRequestError("任务租约已失效，请手动重试", 409, "LEASE_EXPIRED");
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
      const text = await deps.callLlm(config, system, prompt, signal, Math.max(1, deadline - Date.now()), undefined, diagnostics.network, { profile: "design-draft" });
      await stage("validation");
      let raw;
      try { raw = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { throw new LlmRequestError("模型返回的方案格式不正确，请手动重试", 502, "FORMAT"); }
      const parsed = designResultSchema.omit({ retrieval: true }).safeParse(raw);
      if (!parsed.success) throw new LlmRequestError("模型返回的方案字段不完整，请手动重试", 502, "FORMAT");
      await stage("saving");
      const saved = await deps.finishDesign(job.id, job.leaseToken!, { result: { ...parsed.data, retrieval: { status: retrieval.status, method: retrieval.method, references: retrieval.references } }, model: config.model, knowledgeVersion: HARDWARE_DESIGN_KNOWLEDGE.version, diagnostics: structuredClone(diagnostics) }, deadline);
      if (!saved) throw new LlmRequestError("任务保存期限或租约已失效，请手动重试", 409, Date.now() >= deadline ? "TIMEOUT" : "LEASE_EXPIRED");
    }, timeoutMs);
  } catch (error) {
    closePhase(diagnostics, new Date()); diagnostics.totalMs = Date.now() - began;
    diagnostics.errorCode = Date.now() >= deadline ? "TIMEOUT" : error instanceof LlmRequestError ? error.code : diagnostics.currentPhase === "retrieval" ? "RETRIEVAL" : diagnostics.currentPhase === "saving" ? "STORAGE" : "INTERNAL";
    const message = diagnostics.errorCode === "TIMEOUT" ? `${designPhases[diagnostics.currentPhase]}阶段超时（总上限 90 秒），需求已保存，请手动重试或联系管理员。`
      : error instanceof LlmRequestError ? error.message : `${designPhases[diagnostics.currentPhase]}失败，需求已保存，请手动重试或联系管理员。`;
    await deps.finishDesign(job.id, job.leaseToken!, { error: message, diagnostics: structuredClone(diagnostics) });
  }
  return true;
}
