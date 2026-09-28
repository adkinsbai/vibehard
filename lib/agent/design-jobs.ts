import { z } from "zod";
import type { DesignResult } from "./llm";
import type { DesignDiagnostics } from "./design-diagnostics";
import { bomReferencePrice } from "@/lib/bom-price-snapshots";

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
  diagnostics?: DesignDiagnostics | null;
  createdAt: string; startedAt: string | null; completedAt: string | null; deadlineAt: string;
};
export type DesignJobSummary = Omit<DesignJob, "result">;
export const designStatus = { queued: "排队中", running: "生成中", completed: "已完成", failed: "失败" };
export function designMarkdown(job: DesignJob) {
  if (!job.result) throw new Error("方案尚未生成");
  return ["# 硬件方案草案", `项目：${job.projectName}`, `任务：${job.id}`, `模型：${job.model}`, `内置规则：${job.knowledgeVersion}`,
    `时间：${job.completedAt}`, `需求：${job.requirement}`, "精确型号的供应商价格为标注日期的公开网页快照（原币种，不含税费、运费及汇率换算），其余为小批量 AI 估算；均非实时询价，未逐项核验数据手册或电气设计。",
    "## 知识库检索记录", !job.result.retrieval ? "历史方案未记录检索来源。" : job.result.retrieval.status === "no-match" ? "未检索到匹配的可用资料；使用内置规则和模型通用知识，关键参数仍需核验。" : job.result.retrieval.references.map(r => `- ${r.title} v${r.version}（${r.reviewStatus === "auto-indexed" ? "平台自动入库、未人工复核" : r.scope === "platform" ? "平台已发布" : "本项目已发布"}）；来源：${r.source}；SHA256：${r.sha256}；片段：${r.excerpt.replace(/\s+/g, " ")}`).join("\n"),
    ...(job.result.retrieval?.status === "partial" ? ["部分知识不可用：本次并非完整知识库检索。"] : []),
    "## 架构", ...job.result.architecture.map(x => `- ${x}`), "## BOM", ...job.result.bom.map(x => {
      const price = bomReferencePrice(x.model, x.estCost);
      return `- ${x.item}：${x.model} × ${x.qty}；参考单价 ${price.display}${price.kind === "estimate" ? "" : `（${price.supplier} ${price.supplierSku}，${price.minimumQuantity}+ 件，${price.checkedAt} 核查${price.kind === "supplier-reference" ? "，缺货仅供参考" : ""}，${price.sourceUrl}）`}`;
    }),
    "## 接口", ...job.result.interfaces.map(x => `- ${x}`), "## 风险", ...job.result.risks.map(x => `- [${x.level}] ${x.desc}`)].join("\n\n");
}
