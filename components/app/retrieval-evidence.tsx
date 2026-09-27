import type { RetrievalEvidence as Evidence } from "@/lib/agent/retrieval-payload";
export function RetrievalEvidence({ value }: { value: Evidence }) {
  return <section className="my-3 rounded-lg border p-3 text-xs" aria-label="服务端知识来源">
    <h3 className="font-semibold">服务端知识来源</h3>
    {value.status === "partial" && <p role="status" className="my-2 text-amber-700 dark:text-amber-300">部分知识不可用；本次并非完整知识库检索。{value.warnings?.includes("LEGACY_RUNNER") ? "旧 Runner 未接收统一检索资料，需要升级。" : "私有索引暂不可用，已发布文本仍可参考。"}</p>}
    {value.status === "no-match" && <p className="my-2">未检索到匹配的可用资料。</p>}
    <ul className="mt-2 space-y-2">{value.references.map(r => <li key={`${r.scope}:${r.id}`} className="break-words"><strong>{r.title} · v{r.version}</strong><p>{r.reviewStatus === "auto-indexed" ? "平台自动入库 · 未人工复核" : r.scope === "platform" ? "平台已发布" : "本项目已发布"}</p><p className="break-all">{r.source}</p><p className="break-all">SHA256：{r.sha256}</p><p>{r.excerpt}</p></li>)}</ul>
    <p className="mt-2 text-muted-foreground">以上是服务端记录的参考来源，不等于模型逐项采纳或器件、电气设计已验证。</p>
  </section>;
}
