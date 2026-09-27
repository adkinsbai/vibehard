import { designPhases, type DesignDiagnostics as Diagnostics } from "@/lib/agent/design-diagnostics";

export function DesignDiagnostics({ value, admin = false }: { value?: Diagnostics | null; admin?: boolean }) {
  if (!value) return <p className="mt-2 text-xs text-muted-foreground">无阶段诊断（历史任务）</p>;
  return <div className="my-3 rounded-lg border p-3 text-xs" aria-label="方案阶段诊断">
    <p className="font-medium">当前 / 最后阶段：{designPhases[value.currentPhase]}{value.errorCode ? ` · ${value.errorCode}` : ""}</p>
    <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{value.phases.map(p => <li key={p.phase}>{designPhases[p.phase]}：{p.durationMs === undefined ? "进行中" : `${(p.durationMs / 1000).toFixed(2)} 秒`}</li>)}</ol>
    {value.totalMs !== undefined && <p className="mt-2">执行总耗时：{(value.totalMs / 1000).toFixed(2)} 秒（不含排队）</p>}
    {admin && <><p className="mt-2 break-all">模型：{value.model ?? "未读取"} · 配置版本：{value.modelRevision ?? "未知"} · {value.protocol} · 请求策略：{value.requestPolicy ?? "默认"}</p>
      {value.network && <p className="mt-2">DNS {value.network.dnsMs ?? "—"} ms / TLS {value.network.tlsMs ?? "—"} ms / 响应头 {value.network.headersMs ?? "—"} ms / 接收正文 {value.network.bodyMs ?? "—"} ms / HTTP {value.network.status ?? "—"} / {value.network.responseBytes ?? "—"} bytes</p>}
    </>}
  </div>;
}
