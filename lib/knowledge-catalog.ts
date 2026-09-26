import type { BoardResource, CatalogBoard } from "@/lib/board-catalog";

export const knowledgeCategories = [
  { id: "boards", title: "开发板选型库", description: "板卡参数、外设特性与型号对比" },
  { id: "manuals", title: "芯片手册", description: "数据手册、参考手册与器件规格" },
  { id: "schematics", title: "原理图库", description: "电路原理图、接口与硬件连接" },
  { id: "pcb", title: "PCB 库", description: "PCB 工程、布局布线与生产资料" },
  { id: "firmware", title: "驱动与示例", description: "外设驱动、SDK 与固件示例" },
  { id: "experience", title: "开发经验", description: "调试记录、问题复盘与工程实践" },
] as const;
export type KnowledgeCategory = typeof knowledgeCategories[number]["id"];
export type CatalogEntry = BoardResource & { id: string; board: string; category: Exclude<KnowledgeCategory, "boards"> };

// Organize references only. A matching filename is not a parsed/verified document.
export function resourceCategory(resource: BoardResource): CatalogEntry["category"] | null {
  const filename = resource.path.split("/").pop() ?? "";
  const title = `${resource.name} ${filename}`;
  if (/原理图|schematic/i.test(title)) return "schematics";
  if (/gerber|\.kicad_pcb\b|\.pcbdoc\b|\bpcb\b|PCB[工程设计布局布线]|布局布线/i.test(title)) return "pcb";
  if (/数据手册|技术手册/.test(resource.section) || /datasheet|reference.manual|数据手册|参考手册/i.test(title)) return "manuals";
  if (/示例|软件开发/.test(resource.section) || /示例|驱动|\bsdk\b|\bdemo\b|源码/i.test(title)) return "firmware";
  return null;
}

export function knowledgeEntries(boards: CatalogBoard[]): CatalogEntry[] {
  return boards.flatMap(board => board.resources.flatMap((resource, index) => {
    const category = resourceCategory(resource);
    return category ? [{ ...resource, id: `${board.name}:${index}`, board: board.name, category }] : [];
  }));
}
