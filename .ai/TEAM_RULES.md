# 团队规则

## 开发格式

- 保持变更小而便于评审。
- 优先沿用项目现有风格，而不是引入新抽象。
- 修改 Next.js 前先阅读 `node_modules/next/dist/docs/` 中与本任务相关的版本内文档。
- 不把平台发布、项目知识库和 Runner 会话状态混在同一个目录。

## 提交格式

使用简洁的工程提交格式：

```text
type(scope): summary
```

常见类型：`feat`、`fix`、`test`、`docs`、`build`、`refactor`、`chore`。

## 编辑边界

- 修改生产代码前先确认允许文件。
- 将认证、租户隔离、数据库迁移、Runner 协议、审批、部署脚本、设备操作、startup files、linker scripts、ISR、DMA、BSP 和已验证硬件代码视为高风险区域。
- 未经明确确认，不要修改高风险区域。

## 云端交付边界

- 普通开发只需提交独立分支和 PR；涉及生产发布或项目知识导入时，才必须阅读 `docs/team-cloud-delivery.md`。
- 平台代码和文档通过 Git 分支、评审、版本化 release 发布，不直接修改 `/opt/vibehard/releases/*`。
- 项目知识正文由所有者通过目标项目页面/API 提交草稿，存入 PostgreSQL；仅管理员/开发者审核后发布，普通用户不能自审。新规则 9/20 已上线（详见 current-status）；不要直接写 workspace。固件/工程文件交付仍需标明项目 ID 与相对路径，不猜测服务器绝对路径。
- 禁止向 `/etc/vibehard`、`/opt/vibehard/cloud-runner`、`/var/lib/vibehard-runner/codex` 或 `/opt/vibehard/incoming` 投递团队文档。
- 未实现受控导入工具前，同伴的 agent 只生成并提交交付包，不直接 SSH/SCP 到生产服务器。
- 不提交密钥、令牌、密码、真实 `.env`、Runner credential、用户数据或生产日志。

## 验证规则

- 分别记录构建、测试、烧录和硬件验证。
- 不要把构建成功当作硬件验证。
- 不要把 mock 当作真实外设验证。
- 不要把 Runner `online` 当作模型端到端可用；必须检查新鲜心跳和真实任务。
- 缺少证据时标记为 `未验证` 或 `待确认`。

## AI 使用规则

- 开始工作前读取 `.ai/TEAM_RULES.md` 和 `.ai/PROJECT_STATUS.md`。
- 涉及生产发布或项目知识导入时读取 `docs/team-cloud-delivery.md`。
- 面向硬件或生产代码编辑前，先生成任务确认说明。
- 每个任务后更新 `.ai/TASK_LOG.md`。
- 让 `.ai/PROJECT_STATUS.md` 保持足够新，便于交接。
