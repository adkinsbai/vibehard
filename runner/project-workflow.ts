import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// Production bundles inline this owned skill. Source-mode commands run from the repo root.
declare const __VIBEHARD_WORKFLOW_SKILL__: string | undefined;
function skillText() {
  return typeof __VIBEHARD_WORKFLOW_SKILL__ === "string" ? __VIBEHARD_WORKFLOW_SKILL__
    : readFileSync(path.resolve("runner/skills/cloud-project-workflow/SKILL.md"), "utf8");
}

const LIMIT = 100;
const clip = (value: unknown) => String(value ?? "未记录").replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 600);
type RecordData = Record<string, unknown>;

export class ProjectWorkflow {
  readonly instructions = skillText();
  readonly metadata = { id: "cloud-project-workflow", version: "1.0.0", sha256: createHash("sha256").update(this.instructions).digest("hex") };
  private startedAt = Date.now();
  private commands: string[] = [];
  private files: string[] = [];
  private approvals = new Map<string, string>();
  private omitted = 0;

  private append(list: string[], text: string) {
    if (list.length < LIMIT) list.push(text); else this.omitted++;
  }

  observe(type: string, data: RecordData) {
    if (type === "approval.requested") {
      if (this.approvals.size < LIMIT) this.approvals.set(String(data.approvalId), `${clip(data.tool)}：待决策`);
      else this.omitted++;
    }
    if (type !== "tool.completed" || !data.item || typeof data.item !== "object") return;
    const item = data.item as RecordData;
    if (item.type === "commandExecution") {
      this.append(this.commands, `${clip(item.command)} | 状态 ${clip(item.status)} | exit=${typeof item.exitCode === "number" ? item.exitCode : "未知"}`);
    }
    if (item.type === "fileChange" && Array.isArray(item.changes)) {
      for (const change of item.changes) {
        if (!change || typeof change !== "object") continue;
        const kind = typeof change.kind === "object" && change.kind ? change.kind.type : change.kind;
        this.append(this.files, `${clip(change.path)} | ${clip(kind)} | 应用状态 ${clip(item.status)}`);
      }
    }
  }

  decide(id: string, decision: "approve" | "reject") {
    const current = this.approvals.get(id);
    if (current) this.approvals.set(id, current.replace(/待决策$/, decision === "approve" ? "允许（不代表执行成功）" : "拒绝"));
  }

  finish(outcome: string) {
    const section = (title: string, lines: string[], empty: string) => `## ${title}\n\n${lines.length ? lines.map((line) => `- ${line}`).join("\n") : empty}`;
    const report = [
      "# 云端工程执行证据报告",
      `工作流：${this.metadata.id} ${this.metadata.version}\nSHA-256：${this.metadata.sha256}\n终态：${outcome}\n耗时：${Date.now() - this.startedAt} ms`,
      "这是 Runner 记录的工具事件摘要，不是模型自述或完整文件系统审计。任务结束不等于需求、构建或硬件验证通过。工程结论与修改目的见本轮 Agent 回复。",
      section("命令完成事件", this.commands, "未记录完成命令，不能推断已执行验证。"),
      section("文件修改事件", this.files, "未记录文件修改事件；不据此断言工作区无变化。"),
      section("审批记录", [...this.approvals.values()], "未收到审批请求。"),
      "## 验证边界\n\n命令状态和退出码仅证明该命令的结果；shell/MCP 引起的文件变更可能不在文件事件中。烧录与硬件效果未由本报告验证。需结合实际 diff 和测试输出验收。",
      this.omitted ? `摘要限额已触发，省略 ${this.omitted} 条；完整已持久化事件请查本轮日志。` : "",
    ].filter(Boolean).join("\n\n");
    return report.length > 64_000 ? `${report.slice(0, 64_000)}\n\n[摘要超出长度限制，已截断；请查本轮事件日志。]` : report;
  }
}
