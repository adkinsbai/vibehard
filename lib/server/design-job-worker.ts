import { DESIGN_MODEL_MS } from "@/lib/agent/design-jobs";
import { designMessages } from "@/lib/agent/design-prompt";
import { designResultSchema } from "@/lib/agent/llm";
import { HARDWARE_DESIGN_KNOWLEDGE } from "@/lib/agent/hardware-design-knowledge";
import { claimDesign, finishDesign } from "./design-job-store";
import { callLlm, LlmRequestError } from "./llm-client";
import { runtimeLlm } from "./llm-settings";
import { retrieveDesignKnowledge } from "./design-knowledge";

// The hard deadline includes configuration lookup and DNS, not only the TLS request.
export async function boundedDesign<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs = DESIGN_MODEL_MS) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new LlmRequestError("模型响应超时，需求已保存，请重试或联系管理员更换模型服务", 504)); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); controller.abort(); }
}
export async function processNextDesign() {
  const job = await claimDesign();
  if (!job) return false;
  try {
    const outcome = await boundedDesign(async signal => {
      const config = await runtimeLlm("design");
      if (!config) throw new LlmRequestError("尚未配置方案生成模型，请联系管理员");
      const retrieval = await retrieveDesignKnowledge(job.userId, job.projectId, job.requirement);
      signal.throwIfAborted();
      const { system, prompt } = designMessages(job.requirement, retrieval);
      const text = await callLlm(config, system, prompt, signal, DESIGN_MODEL_MS);
      let raw;
      try { raw = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { throw new LlmRequestError("模型返回的方案格式不正确，请重试"); }
      const parsed = designResultSchema.safeParse(raw);
      if (!parsed.success) throw new LlmRequestError("模型返回的方案字段不完整，请重试");
      return { result: { ...parsed.data, retrieval: { status: retrieval.status, method: retrieval.method, references: retrieval.references } }, model: config.model, knowledgeVersion: HARDWARE_DESIGN_KNOWLEDGE.version };
    });
    await finishDesign(job.id, job.leaseToken!, outcome);
  } catch (error) {
    await finishDesign(job.id, job.leaseToken!, { error: error instanceof LlmRequestError ? error.message : "方案生成失败，需求已保存，请重试或联系管理员" });
  }
  return true;
}
