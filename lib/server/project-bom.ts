import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { designJobs, projects } from "@/lib/db/schema";

export type ProjectBom = {
  projectId: string;
  projectName: string;
  designId: string;
  completedAt: string;
  model: string | null;
  items: { item: string; model: string; qty: number; estCost: string }[];
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
    items: row.result.bom.map(({ item, model, qty, estCost }) => ({ item, model, qty, estCost })),
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
    [],
    ["器件", "候选型号", "数量", "参考单价（人民币，模型估算）"],
    ...bom.items.map(({ item, model, qty, estCost }) => [item, model, qty, estCost]),
  ];
  return `\uFEFF${lines.map(line => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
