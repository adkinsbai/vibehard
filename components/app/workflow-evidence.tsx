"use client";

import { Button } from "@/components/ui/button";

export function WorkflowEvidence({ data }: { data: Record<string, unknown> }) {
  const metadata = data.workflow as { id?: string; version?: string } | undefined;
  const report = typeof data.workflowReport === "string" ? data.workflowReport : undefined;
  function download() {
    const url = URL.createObjectURL(new Blob([report ?? ""], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cloud-workflow-report.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    {metadata?.id === "cloud-project-workflow" && <p className="mt-2 text-xs text-muted-foreground">工程工作流已加载 · {metadata.version} · 分析 / 受控修改 / 报告（按任务适用，不代表验证通过）</p>}
    {report && <details className="mt-2 rounded border border-border/70 p-3">
      <summary className="cursor-pointer text-sm font-medium">云端工程执行证据报告</summary>
      <Button size="sm" variant="outline" className="my-3" onClick={download}>下载报告</Button>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{report}</pre>
    </details>}
  </>;
}
