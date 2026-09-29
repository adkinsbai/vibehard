# RV1126B 设备入口发布记录（2026-09-28）

## 范围与基线

- [PR #20](https://github.com/oxygen0827/vibehard/pull/20) 把原“泰山派开发”入口明确为“设备开发 · RV1126B”，在工作台增加可发现的入口，并说明独立 VibeBoard 登录、USB/ADB **应用部署**与 VibeHard 项目尚未统一的边界。它没有修改连接器、设备服务或板上系统。
- [PR #21](https://github.com/oxygen0827/vibehard/pull/21) 增加独立前端发布门禁。两个 PR 和最终默认分支合并提交 `a38dd19d708bb5f8329435063ca4fc18b351a942` 的 Verify 均全绿。候选从该提交完整构建，`NEXT_PUBLIC_BASE_PATH=/vibehard`。
- 正式平台由 `20260928-bom-price-freeze-v1` 切到 `20260928-rv1126b-entry-v1`。归档 SHA-256 为 `e78388ec7dabae42064ea9fed38b6f6688d4cf859b82bc5d78a5c2e7e73a88f7`，1066 个源码文件有清单指纹。相对原平台只改变 `app/app/taishan/page.tsx`、`components/app/app-nav.tsx`、`components/app/app-sidebar.tsx`、`components/app/dashboard-grid.tsx`、`lib/module-help.ts` 五个运行时文件，无新增运行时文件。

## 候选、激活和保护

- 本地全量测试 308 项通过、16 项环境条件跳过，TypeScript、定向 lint 与 `/vibehard` Next 生产构建通过；PR/default CI 还通过隔离 PostgreSQL 的方案与知识边界测试。
- 云端 3211 候选启动前校验现网清单及完整 PCB/Demo 源码覆盖；候选通过 PCB v0.2 详细 renderer、Demo 18 个资源/5 个录屏、BOM 页面/API 匿名权限。切换前方案和 Agent 活跃任务均为零，旧平台 unit 与 root-only PostgreSQL dump 已备份并验真。
- 激活后 3210 回环及 `https://ldcx.tech` 同样通过 PCB/Demo/BOM/匿名权限检查；独立 `https://ldcx.tech/Vibeboard/` 返回 200。平台 PID `1007488`、`NRestarts=0`；方案 Worker `1006630`、受限检索 `1002794`、云端 Runner `954791`、Gateway `727637`、VibeBoard `980049`、EDA manager `908160` 的 PID 未变，均 active 且无重启。云端/设备 Runner 心跳分别约 9/11 秒，Gateway 8787 有实时连接。候选 unit inactive、3211 端口关闭。发布后系统盘约 4.4 GB 可用。
- 无数据库迁移、知识索引/OSS、模型配置/API Key、Runner 凭据、nginx 或设备写入。方案 Worker 继续 `20260928-bom-price-freeze-v1`，受限检索继续 `20260928-audit-fixes-v1`；管理员知识 CLI 继续 `20260928-knowledge-control-v2`。

## 尚未覆盖与回滚

未在生产登录态人工点击新入口、登录 VibeBoard 或再做一次 RV1126B 真机应用部署；此前板子的独立系统验收不等于本次 VibeHard 入口的登录态验收。VibeHard 与 VibeBoard 账号、项目、知识、Agent loop 仍未打通；当前也不是系统固件烧录/串口调试闭环。

回滚前先核对方案和 Agent 活跃任务为零，使用现有 `/etc/vibehard/platform.env` 与 `/etc/vibehard/eda-platform.env` 环境执行：

```bash
set -a
. /etc/vibehard/platform.env
. /etc/vibehard/eda-platform.env
set +a
/opt/vibehard/runtime/node-v22.23.1 /opt/vibehard/releases/20260928-rv1126b-entry-v1/scripts/deploy-staged-platform.mjs /opt/vibehard/releases/20260928-rv1126b-entry-v1 rollback
```

脚本仅恢复备份的 `vibehard.service`，旧版 `20260928-bom-price-freeze-v1` 保留；不回滚数据库或重启 Worker/检索/Runner/Gateway/VibeBoard/EDA。数据库备份仅用于事故恢复，不要覆盖发布后产生的新数据。
