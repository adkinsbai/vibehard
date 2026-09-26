const highlights = [
  { value: "云端 Agent", label: "以项目组织协作", desc: "会话、工具执行与报告留在项目中" },
  { value: "方案 + BOM", label: "从需求开始推演", desc: "架构、接口、器件建议与参考估价" },
  { value: "分析 → 审核", label: "让知识有据可循", desc: "用户申请，管理员或开发者把关" },
  { value: "6 类目录", label: "研发资料分类管理", desc: "选型、手册、电路、PCB、示例与经验" },
];

export function StatsSection() {
  return (
    <section aria-label="平台能力概览" className="relative z-10 mx-auto max-w-7xl px-6 pb-20">
      <div className="grid gap-6 rounded-2xl border border-border bg-card/70 p-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8 lg:p-8">
        {highlights.map(item => (
          <div key={item.label}>
            <p className="text-xl font-semibold tracking-tight text-primary">{item.value}</p>
            <p className="mt-3 text-sm font-semibold">{item.label}</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
