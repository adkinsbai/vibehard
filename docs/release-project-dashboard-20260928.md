# 项目工作台真实数据发布（2026-09-28）

## 范围

工作台首页的“我的 Agent 项目”“最近方案任务”“最近项目”改读登录用户所属的真实数据库记录，移除固定的使用次数、项目卡片和配额数字。方案生成、项目归属与后台任务原有接口不变；本次不迁移数据库、不调用付费模型、不切换知识索引或设备服务。工程导入仍按用户选择暂缓。

## Git 与验证

- 默认分支 `codex/agent-platform-foundation`：PR #13 合并受控知识 CLI 打包修复；PR #14 合并工作台真实数据与 CI 工作流；PR #15 只修正数据库行锁测试的 Vitest 个案时限。#14 在 CI 失败后先被合并，故暂停上线，待 #15 的完整 Verify 通过并合并后，才使用合并提交 `22808364b5e63516554da6b271de83f1ba80e109` 构建。
- PR #15 Verify：类型检查、常规测试、服务 bundle、Next 构建、两个临时 PostgreSQL 数据库迁移及项目/知识权限边界测试全部通过。20 秒只影响行锁测试用例，不改变生产方案任务的 90 秒硬时限。
- 本地从同一合并提交使用 `NEXT_PUBLIC_BASE_PATH=/vibehard pnpm build` 成功。候选包 SHA-256 为 `fde6a9f5b3a2f6e7e3c45c186e496f4896fda91ba41fa3692ce46d116510815b`，包含 1063 个受 Git 管理的源码文件；相对上一平台版本仅两个运行时文件变化：`app/app/page.tsx`、`components/app/dashboard-grid.tsx`。完整 PCB/Demo 源码叠加及指纹由清单校验。

## 云端发布证据

- 原平台：`/opt/vibehard/releases/20260928-bom-pricing-v2/standalone`；新平台：`/opt/vibehard/releases/20260928-project-dashboard-v1/standalone`。候选在 3211 端口通过 `verify-frontend-release.mjs` 与 `verify-bom-release.mjs`；备份前确认方案/Agent 活跃任务为零，并验证 root-only PostgreSQL dump 和旧 unit 副本。
- 切换后正式 3210 与公网 `https://ldcx.tech` 的登录页、PCB v0.2 及详细渲染 bundle、Demo 18 个资产/五段录屏、匿名项目/BOM 权限和 BOM 入口均通过。候选端口 3211 已关闭。平台 `vibehard.service` active，`NRestarts=0`。
- 方案 Worker、受限检索、云端 Runner、Gateway、VibeBoard 和 EDA manager 均保持原 PID，active 且无重启。发布后只读查询：`cloud-runner` 心跳约 11 秒、`device-runner` 约 10 秒；Gateway 8787 有两个已建立连接。旧 `mac-local` 节点离线，不将它的存储状态当成可用性证明。未触碰索引指针、模型配置/API Key 或 OSS 原件。
- 服务器余量约 4.8 GB / 40 GB（88% 已用）。三个从未激活的旧 release 已在删除前制作 root-only tar.gz，完成解压后文件/链接校验；归档保留在 `/opt/vibehard/release-archives/`。这只回收约 0.7 GB，**不足以在生产服务器处理 8 GB 原件**，大批量 OCR/切分仍必须离线执行。

## 未完成的验收与回滚

- 无生产用户浏览器登录态，尚未人工点击真实项目卡、刷新任务状态或下载真实项目 BOM；CI 的隔离库权限测试不能冒充此项。登录后需核对自己的项目计数、最近项目跳转、完成/失败任务显示及导航返回后的持久结果。
- 本轮未重复付费模型生成或 RV1126B USB 实机部署；这两项沿用先前独立验收，不由工作台切换推断长期稳定。
- 回滚入口（需先确认无活跃方案/Agent 任务）：以现有环境文件运行 `/opt/vibehard/releases/20260928-project-dashboard-v1/scripts/deploy-staged-platform.mjs /opt/vibehard/releases/20260928-project-dashboard-v1 rollback`。脚本恢复备份 unit，旧平台 `20260928-bom-pricing-v2` 保留。数据库未迁移，不执行数据恢复。
