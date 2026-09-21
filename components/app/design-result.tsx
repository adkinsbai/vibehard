import type { DesignResult as Result } from "@/lib/agent/llm";
export function DesignResult({ result }: { result: Result }) {
  return <div className="mt-4 space-y-4">
    <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm">AI 方案草案：参考价格为小批量估算，采购前仍需询价；尚未逐项核对数据手册和引脚，不代表已通过 ERC 或硬件验证。</p>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">架构建议</h2><ul className="list-disc space-y-2 pl-5 text-sm">{result.architecture.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">BOM 建议</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">器件</th><th className="p-2">候选型号</th><th className="p-2">数量</th><th className="p-2">参考单价（人民币）</th></tr></thead><tbody>{result.bom.map((b, i) => <tr key={i} className="border-b border-border/50"><td className="p-2">{b.item}</td><td className="p-2">{b.model}</td><td className="p-2">{b.qty}</td><td className="p-2">{b.estCost}</td></tr>)}</tbody></table></div></section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">接口规划</h2><ul className="list-disc space-y-2 pl-5 text-sm">{result.interfaces.map((x, i) => <li key={i}>{x}</li>)}</ul></section><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">风险与待验证项</h2><ul className="space-y-3 text-sm">{result.risks.map((r, i) => <li key={i}><span className="mr-2 font-semibold">[{r.level}]</span>{r.desc}</li>)}</ul></section></div>
  </div>;
}
