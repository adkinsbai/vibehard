import { BookOpen, Bot, CircuitBoard, FileSearch, Layers, ShieldCheck } from "lucide-react";

const capabilities = [
  { icon: Bot, name: "云端 Agent 项目", scope: "内测功能", description: "按项目管理会话与工程，在网页中查看流式回复、工具执行和审批；让分析、受控修改与变更报告有迹可循。", detail: "工程分析 / 工具审批 / 变更报告" },
  { icon: Layers, name: "硬件方案与 BOM", scope: "内测功能", description: "输入产品需求，调用后端模型整理架构、候选器件、接口规划和风险清单，BOM 同时提供人民币参考估价。", detail: "价格为估算，采购前需核价" },
  { icon: FileSearch, name: "原理图识别与申请", scope: "内测验证中", description: "上传 PDF 或图片进行分析，下载结果，并选择项目申请加入知识库备选；识别结论交由工程师复核。", detail: "模型调用仍在优化，可能超时" },
  { icon: ShieldCheck, name: "项目知识与审核", scope: "内测功能", description: "用户提交候选资料，管理员或开发者审核后发布。项目 Agent 使用已发布的知识版本，未审核草稿不进入上下文。", detail: "候选 / 审核 / 发布 / 版本追溯" },
  { icon: BookOpen, name: "知识库与开发板选型", scope: "管理员 / 开发者", description: "六类研发目录统一组织资料，开发板支持搜索、特性筛选、对比和详情浏览，帮助团队梳理选型依据。", detail: "当前为目录展示，原始文件下载尚未接入" },
  { icon: CircuitBoard, name: "研发工具与流程演示", scope: "工具 / 演示", description: "提示词模板与实用工具辅助日常研发；PCB 预览、芯片资料、AI 调试和嵌入式流程可在演示中了解。", detail: "演示不代表已完成真实硬件闭环" },
];

const steps = [
  { title: "建立项目", text: "在 Agent 项目中组织会话，说明目标与工程约束。" },
  { title: "分析与计划", text: "让云端 Agent 理解工程，先给出影响范围与执行方案。" },
  { title: "确认与执行", text: "按需审批工具操作，在限定范围内修改并运行验证。" },
  { title: "报告与沉淀", text: "核对变更报告；需要复用的资料提交申请，审核后发布。" },
];

export function WorkflowSection() {
  return (
    <>
      <section id="capabilities" aria-labelledby="capabilities-title" className="relative z-10 mx-auto max-w-7xl scroll-mt-28 px-6 pb-20">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">PLATFORM CAPABILITIES</p>
          <h2 id="capabilities-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">从一个想法，到一次可追溯的迭代</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">围绕硬件研发的实际任务组织工具。以下为当前平台能力，内测功能、资料目录与演示入口分别标明。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, name, scope, description, detail }) => (
            <article key={name} className="flex flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">{scope}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{name}</h3>
              <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">{description}</p>
              <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">AI 输出是研发辅助，不替代工程评审与实机验证。模型响应受服务商额度、网络和任务复杂度影响。</p>
      </section>
      <section id="workflow" aria-labelledby="workflow-title" className="relative z-10 border-y border-border bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">HUMAN IN THE LOOP</p>
          <h2 id="workflow-title" className="mt-3 text-3xl font-bold tracking-tight">AI 推进任务，工程师掌握决定权</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">以云端工程协作为主线，保留人的确认和判断。知识发布需要独立审核，不会因为一次 AI 生成就自动入库。</p>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((item, index) => (
              <li key={item.title} className="border-t-2 border-primary/25 pt-5">
                <span className="font-mono text-xs text-primary">0{index + 1}</span>
                <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
