import { z } from "zod";
import type { DesignResult } from "./llm";

export const designJobInput = z.object({
  requestId: z.uuid(),
  requirement: z.string().trim().min(2).max(12_000),
  projectId: z.uuid().optional(),
});
export type DesignJobInput = z.infer<typeof designJobInput>;
export const DESIGN_QUEUE_MS = 10 * 60_000;
export const DESIGN_LEASE_MS = 120_000;
export const DESIGN_MODEL_MS = 90_000;
export const DESIGN_QUEUE_LIMIT = 20;
export type DesignJob = {
  id: string; projectId: string; projectName: string; requirement: string;
  status: "queued" | "running" | "completed" | "failed";
  model: string | null; knowledgeVersion: string | null;
  result: DesignResult | null; error: string | null;
  createdAt: string; startedAt: string | null; completedAt: string | null; deadlineAt: string;
};
export type DesignJobSummary = Omit<DesignJob, "result">;
export const designStatus = { queued: "排队中", running: "生成中", completed: "已完成", failed: "失败" };
export function designMarkdown(job: DesignJob) {
  if (!job.result) throw new Error("方案尚未生成");
  return ["# 硬件方案草案", `项目：${job.projectName}`, `任务：${job.id}`, `模型：${job.model}`, `内置规则：${job.knowledgeVersion}`,
    `时间：${job.completedAt}`, `需求：${job.requirement}`, "参考价格为小批量 AI 估算，未经过实时询价、数据手册逐项核验或电气验证。",
    "## 知识库检索记录", !job.result.retrieval ? "历史方案未记录检索来源。" : job.result.retrieval.status === "no-match" ? "未检索到匹配的可用资料；使用内置规则和模型通用知识，关键参数仍需核验。" : job.result.retrieval.references.map(r => `- ${r.title} v${r.version}（${r.reviewStatus === "auto-indexed" ? "平台自动入库、未人工复核" : r.scope === "platform" ? "平台已发布" : "本项目已发布"}）；来源：${r.source}；SHA256：${r.sha256}；片段：${r.excerpt.replace(/\s+/g, " ")}`).join("\n"),
    "## 架构", ...job.result.architecture.map(x => `- ${x}`), "## BOM", ...job.result.bom.map(x => `- ${x.item}：${x.model} × ${x.qty}；参考单价 ${x.estCost}`),
    "## 接口", ...job.result.interfaces.map(x => `- ${x}`), "## 风险", ...job.result.risks.map(x => `- [${x.level}] ${x.desc}`)].join("\n\n");
}
