import type { DesignResult as Result } from "@/lib/agent/llm";
import { RetrievalEvidence } from "./retrieval-evidence";
import { recordedOrCurrentBomPrice } from "@/lib/bom-price-snapshots";
export function DesignResult({ result }: { result: Result }) {
  return <div className="mt-4 space-y-4">
    <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm">AI 方案草案：精确型号优先显示供应商公开报价快照，其余为模型估算；采购前仍需复核价格、型号与封装。尚未逐项核对数据手册和引脚，不代表已通过 ERC 或硬件验证。{result.bom.some(x => !x.referencePrice) ? "历史方案未保存生成时价格，当前供应商报价仅供现在参考。" : "本方案的价格依据已随结果保存。"}</p>
    <section className="rounded-xl border bg-card p-5" aria-label="知识库检索记录"><h2 className="font-semibold">知识库检索记录</h2>
      {!result.retrieval ? <p className="mt-2 text-sm text-muted-foreground">这份历史方案没有记录检索来源，不能据此判断是否参考过资料。</p>
        : <RetrievalEvidence value={result.retrieval} />}
    </section>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">架构建议</h2><ul className="list-disc space-y-2 pl-5 text-sm">{result.architecture.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">BOM 建议</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">器件</th><th className="p-2">候选型号</th><th className="p-2">数量</th><th className="p-2">参考单价与依据</th></tr></thead><tbody>{result.bom.map((b, i) => {
      const price = recordedOrCurrentBomPrice(b);
      return <tr key={i} className="border-b border-border/50"><td className="p-2">{b.item}</td><td className="p-2">{b.model}</td><td className="p-2">{b.qty}</td><td className="p-2">{price.display}<div className="text-xs text-muted-foreground">{price.sourceUrl ? <>{price.kind === "supplier-reference" ? "缺货·仅参考" : "公开报价快照"} · {price.supplier} {price.supplierSku} · {price.minimumQuantity}+ 件 · {price.checkedAt}核查 · <a href={price.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">来源</a></> : "模型估算 · 待核实"}</div></td></tr>;
    })}</tbody></table></div></section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">接口规划</h2><ul className="list-disc space-y-2 pl-5 text-sm">{result.interfaces.map((x, i) => <li key={i}>{x}</li>)}</ul></section><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">风险与待验证项</h2><ul className="space-y-3 text-sm">{result.risks.map((r, i) => <li key={i}><span className="mr-2 font-semibold">[{r.level}]</span>{r.desc}</li>)}</ul></section></div>
  </div>;
}
