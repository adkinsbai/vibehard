"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FolderKanban,
  Loader2,
  Package,
  FileDown,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { apiPath } from "@/lib/utils";
import type { ProjectBom } from "@/lib/server/project-bom";

interface Project {
  id: string;
  name: string;
  workspaceKey: string;
  defaultModel: string;
}

export default function BomPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [bomState, setBomState] = useState<{ projectId: string; bom: ProjectBom | null; error: string } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(apiPath("/api/projects"), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { projects?: Project[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "工程列表加载失败");
        return data.projects ?? [];
      })
      .then((loadedProjects) => {
        if (!active) return;
        setProjects(loadedProjects);
        setSelectedProjectId(loadedProjects[0]?.id ?? "");
      })
      .catch((reason) => {
        if (active) setProjectsError(reason instanceof Error ? reason.message : "工程列表加载失败");
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    const controller = new AbortController();
    void fetch(apiPath(`/api/projects/${selectedProjectId}/bom`), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { bom?: ProjectBom | null; error?: string };
        if (!response.ok) throw new Error(data.error ?? "BOM 加载失败");
        return data.bom ?? null;
      })
      .then(value => { if (!controller.signal.aborted) setBomState({ projectId: selectedProjectId, bom: value, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setBomState({ projectId: selectedProjectId, bom: null, error: error instanceof Error ? error.message : "BOM 加载失败" }); });
    return () => controller.abort();
  }, [selectedProjectId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const currentBom = bomState?.projectId === selectedProjectId ? bomState : null;
  const bom = currentBom?.bom ?? null;
  const bomLoading = Boolean(selectedProjectId && !currentBom);
  const bomError = currentBom?.error ?? "";


  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="bom"
        icon={Package}
        title="物料与 BOM"
        description="查看项目最新已完成方案的 BOM；精确型号优先展示供应商公开报价，其余保留模型估算"
      />

      {/* 方案 BOM */}
      {projectsLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-border/80 bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载工程...
        </div>
      ) : projectsError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-500">{projectsError}</p>
          <p className="mt-2 text-xs text-muted-foreground">请刷新页面后重试。</p>
        </div>
      ) : !selectedProject ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/60 px-6 py-12 text-center">
          <FolderKanban className="h-10 w-10 text-primary/70" />
          <h2 className="mt-4 text-base font-semibold text-foreground">暂无工程，暂时没有 BOM</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            先创建一个工程并生成方案，当前工程的物料清单会显示在这里。
          </p>
          <Link
            href="/app/agent"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            去创建工程
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              当前工程 BOM
              <select
                aria-label="选择工程"
                value={selectedProject.id}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                }}
                className="max-w-56 truncate rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary outline-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </h3>
            {bom && <a
              href={apiPath(`/api/projects/${selectedProjectId}/bom?format=csv&designId=${bom.designId}`)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            ><FileDown className="h-4 w-4" />下载真实 BOM.csv</a>}
          </div>

          {bomLoading ? <p className="mt-8 text-sm text-muted-foreground">正在读取最新已完成方案...</p>
            : bomError ? <p role="alert" className="mt-8 text-sm text-red-500">{bomError}</p>
              : !bom ? <p className="mt-8 text-sm text-muted-foreground">此工程尚无已完成的方案 BOM。<Link className="ml-1 text-primary" href="/app/design">去生成方案</Link></p>
                : <>
                  <p className="mb-3 text-xs text-muted-foreground">来源：方案 {bom.designId} · {new Date(bom.completedAt).toLocaleString("zh-CN")} · {bom.model ?? "未记录模型"}</p>
                  <p className="mb-3 text-xs text-muted-foreground">{bom.priceRecorded ? "价格依据已在方案完成时保存，后续报价表更新不会改写本方案。" : "历史方案未保存生成时价格；下列供应商报价是当前参考快照，不代表当时价格。"}</p>
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead><tr className="border-b border-border/60 bg-background/70 text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-left">器件</th><th className="px-3 py-2 text-left">候选型号</th>
                        <th className="px-3 py-2 text-right">数量</th><th className="px-3 py-2 text-left">参考单价与依据</th>
                      </tr></thead>
                      <tbody>{bom.items.map((item, index) => <tr key={`${index}-${item.model}`} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2">{item.item}</td><td className="px-3 py-2">{item.model}</td>
                        <td className="px-3 py-2 text-right">{item.qty}</td>
                        <td className="px-3 py-2">
                          <div>{item.referencePrice?.display ?? item.estCost}</div>
                          {item.referencePrice?.sourceUrl ? <div className="mt-1 text-xs text-muted-foreground">
                            {item.referencePrice.kind === "supplier-reference" ? "缺货·仅参考" : "公开报价快照"} · {item.referencePrice.supplier} {item.referencePrice.supplierSku} · {item.referencePrice.minimumQuantity}+ 件 · {item.referencePrice.checkedAt}核查 · <a href={item.referencePrice.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">来源</a>
                          </div> : <div className="mt-1 text-xs text-muted-foreground">模型估算 · 型号/价格待核实</div>}
                        </td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">供应商价格是按精确型号匹配的公开网页快照，不含汇率换算、税费及运费，也非实时报价或库存保证；未匹配项目为人民币模型估算。采购前须复核型号、封装和报价。</p>
                </>}
        </div>
      )}

    </div>
  );
}
