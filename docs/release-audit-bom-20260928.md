# 2026-09-28 审计修复与真实 BOM 分阶段发布

核查时间：2026-09-28 19:50 CST。这里只记录该时点证据，不保证后续持续可用。

## 代码与范围

- GitHub 默认分支 `codex/agent-platform-foundation` 已合并 [PR #9](https://github.com/oxygen0827/vibehard/pull/9)（merge `dbde731`）、[PR #10](https://github.com/oxygen0827/vibehard/pull/10)（merge `5469572`）和 [PR #11](https://github.com/oxygen0827/vibehard/pull/11)（merge `d37a30f`）。业务代码先按 `6f0933c` 构建审计修复，再按 `dbde731` 构建 BOM；发布工具经后两项 PR 评审。
- 审计版 `20260928-audit-fixes-v1` 包含完整 1050 文件源码清单、平台 standalone、设计 Worker 与受限检索 bundle。与前一平台清单逐项比较，PCB/Demo/`next.config.ts` 哈希不变。归档 SHA-256 `a15c16bfd3a35f0bf88235064fc56e3ab5a1b58366b2ba7eab90bae302a56eec`。
- BOM 版 `20260928-bom-pricing-v2` 包含完整 1057 文件源码清单及 standalone，仅覆盖方案/BOM 页面与项目 BOM API 等相关运行文件；PCB/Demo 哈希仍不变。归档 SHA-256 `60d4e7e51048f758efa5153f721c7373ffd1fd3ec2d3cdb6e7b82c1739b4f489`。两包 `RELEASE.json` 均记录源码、工具与服务工件 SHA-256。
- BOM 初版 `20260928-bom-pricing-v1` 候选在匿名权限脚本解析站内相对跳转 URL 时失败；发布闸门自动停止，**从未激活**。修正后另起 v2 包并重做预检，未原地篡改已上传 v1 包。

## 验收与切换

- 本地全仓 Vitest 305 通过、16 条件跳过；TypeScript、定向 ESLint、两个固定提交的 `/vibehard` 生产构建及审计版服务打包通过。前次隔离 PostgreSQL 14/14、候选真实 HTTP 所有者 BOM/CSV、跨账号 404、旧 Cookie 401 见 [候选验收](audit-bom-candidate-20260928.md)；该候选早于最终代码修正，本次重新构建并做现网匿名预检，不能混称同一个构建。
- 每阶段在 127.0.0.1:3211 候选、切换后 3210 和公网 HTTPS 运行 `verify-frontend-release.mjs`：登录 200、未登录 PCB 307/项目 API 401、发布包实际预渲染 PCB v0.2 与其引用的详细渲染 bundle、Demo 页面/5 个 GIF/18 个前端资源均通过。新会话规则不允许伪造 Cookie；保护页面的构建内容从不可变工件读取，线上只做匿名访问与真实资源校验。
- BOM v2 候选、3210 和公网另验证未登录 BOM 页面 307、项目与 BOM API 401。切换前各核对零排队/运行方案任务和 Agent 回合，备份旧 systemd unit 与 PostgreSQL custom dump，并通过 `pg_restore --list` 与 SHA-256 验证。审计阶段只切平台/设计 Worker/检索；BOM 阶段只切平台，激活失败自动恢复前一 unit。
- 最终 `vibehard.service` 在 `/opt/vibehard/releases/20260928-bom-pricing-v2/standalone`（PID 1003300）；设计 Worker 与私有检索在 `/opt/vibehard/releases/20260928-audit-fixes-v1`（PID 1002796/1002794），三者 active、`NRestarts=0`。Runner/Gateway/VibeBoard/EDA manager 的 PID 954791/727637/980049/908160 在 BOM 切换前后不变。私有 socket 正在监听、3211 已关闭，磁盘剩余约 4.3 GB。
- `knowledge/control/current.json` SHA-256 仍为 `0e3c50149fc05232c0886988321ee075942461b7c4815e023380d3b3079713de`，`disabled.json` 仍为 `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`。只读数据库心跳查询：Cloud Runner 13 秒、Mac mini Device Runner 7 秒，另一个历史节点离线；不能仅凭 `online` 字段断言 Agent 任务成功。

## 边界与回滚

- 本轮没有数据库迁移、模型调用/Key 变更、OSS 上传或知识索引切换，也没有操作真实设备。生产所有者登录态 BOM/CSV 与新的真实付费模型任务尚未在这次上线后复测；本机浏览器当时因 Mac 锁屏不可用。隔离库和早期候选的所有者/跨账号验收不能替代这一步。价格是带日期的公开报价快照或明确模型估算，不含运费、税费、实时库存或汇率承诺；缺货价格仅供参考。
- 两份 root-only 备份在各 release 的 `backup/`，均含 `platform.dump` 和切换前 unit；不应把 dump 覆盖到有后续新数据的生产库。回滚前先确认没有正在执行的方案/Agent 任务，按反向顺序运行：

```sh
# 1. BOM -> 审计修复版（只恢复平台 unit）
/opt/vibehard/runtime/node-v22.23.1 --env-file=/etc/vibehard/platform.env --env-file=/etc/vibehard/eda-platform.env \
  /opt/vibehard/releases/20260928-bom-pricing-v2/scripts/deploy-staged-platform.mjs \
  /opt/vibehard/releases/20260928-bom-pricing-v2 rollback

# 2. 仅当审计修复本身也需回退，再恢复 9/27 平台/Worker/检索 unit
/opt/vibehard/runtime/node-v22.23.1 --env-file=/etc/vibehard/platform.env --env-file=/etc/vibehard/eda-platform.env \
  /opt/vibehard/releases/20260928-audit-fixes-v1/scripts/deploy-staged-platform.mjs \
  /opt/vibehard/releases/20260928-audit-fixes-v1 rollback
```

回滚命令须在云端 root shell 执行，先核对当前正式 WorkingDirectory 与备份。旧索引控制指针未改，回滚不做知识批次或数据库内容回退。未激活的 BOM v1 包留作失败证据，禁止作为发布目标。
