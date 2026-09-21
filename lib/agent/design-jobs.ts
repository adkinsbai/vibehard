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
  return ["# 硬件方案草案", `项目：${job.projectName}`, `任务：${job.id}`, `模型：${job.model}`, `知识库：内置方案知识库 ${job.knowledgeVersion}`,
    `时间：${job.completedAt}`, `需求：${job.requirement}`, "参考价格为小批量 AI 估算，未经过实时询价、数据手册逐项核验或电气验证。",
    "## 架构", ...job.result.architecture.map(x => `- ${x}`), "## BOM", ...job.result.bom.map(x => `- ${x.item}：${x.model} × ${x.qty}；参考单价 ${x.estCost}`),
    "## 接口", ...job.result.interfaces.map(x => `- ${x}`), "## 风险", ...job.result.risks.map(x => `- [${x.level}] ${x.desc}`)].join("\n\n");
}
