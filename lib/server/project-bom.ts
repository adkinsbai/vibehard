import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { designJobs, projects } from "@/lib/db/schema";
import { recordedOrCurrentBomPrice, type BomReferencePrice } from "@/lib/bom-price-snapshots";

export type ProjectBom = {
  projectId: string;
  projectName: string;
  designId: string;
  completedAt: string;
  model: string | null;
  priceRecorded: boolean;
  items: { item: string; model: string; qty: number; estCost: string; referencePrice?: BomReferencePrice }[];
};

export async function latestProjectBom(userId: string, projectId: string, designId?: string): Promise<ProjectBom | null> {
  const [row] = await requireDb().select({
    projectName: projects.name,
    designId: designJobs.id,
    completedAt: designJobs.completedAt,
    model: designJobs.model,
    result: designJobs.result,
  }).from(designJobs).innerJoin(projects, eq(projects.id, designJobs.projectId))
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(designJobs.userId, userId),
      eq(designJobs.status, "completed"), isNotNull(designJobs.result), isNotNull(designJobs.completedAt),
      designId ? eq(designJobs.id, designId) : undefined))
    .orderBy(desc(designJobs.completedAt), desc(designJobs.id)).limit(1);
  if (!row?.result?.bom?.length || !row.completedAt) return null;
  return {
    projectId, projectName: row.projectName, designId: row.designId,
    completedAt: row.completedAt.toISOString(), model: row.model,
    priceRecorded: row.result.bom.every(line => !!line.referencePrice),
    items: row.result.bom.map(line => ({ item: line.item, model: line.model, qty: line.qty, estCost: line.estCost, referencePrice: recordedOrCurrentBomPrice(line) })),
  };
}

function csvCell(value: string | number) {
  const raw = String(value).replaceAll("\0", "");
  // Spreadsheet applications can execute a formula from imported CSV cells.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function projectBomCsv(bom: ProjectBom) {
  const lines = [
    ["项目", bom.projectName],
    ["方案编号", bom.designId],
    ["完成时间", bom.completedAt],
    ["模型", bom.model ?? "未记录"],
    ["价格依据", bom.priceRecorded ? "生成时保存的快照" : "历史方案未保存价格；当前参考报价"],
    [],
    ["器件", "候选型号", "数量", "参考单价", "价格类型", "供应商", "供应商料号", "报价起订量", "网页核查日期", "报价来源 URL"],
    ...bom.items.map(({ item, model, qty, estCost, referencePrice }) => {
      const price = referencePrice ?? recordedOrCurrentBomPrice({ model, estCost });
      return [item, model, qty, price.display,
        price.kind === "estimate" ? "模型估算" : price.kind === "supplier-reference" ? "缺货·供应商仅供参考价" : "供应商公开报价快照",
        price.supplier ?? "", price.supplierSku ?? "", price.minimumQuantity ?? "", price.checkedAt ?? "", price.sourceUrl ?? ""];
    }),
  ];
  return `\uFEFF${lines.map(line => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
