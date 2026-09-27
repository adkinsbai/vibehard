# VibeHard 两轮代码检查与 Debug 报告

检查时间：2026-09-27 17:32–17:47（Asia/Shanghai）。结论：现有测试与构建通过，但补充边界复现确认 4 个问题；不能据此认定系统没有缺陷。本轮仅诊断，不修改业务代码、不发布、不调用收费模型。

## 基线与检查范围

- GitHub 默认分支 `codex/agent-platform-foundation`：`9fc6ec53e4892af023c04fef02c67e1d25bb3bd9`。
- 检查工作树：`/Users/hushaohong/.codex/worktrees/eda-rag-integration/vibehard`，HEAD `a32263e166704a468d9968d02f1d64233fd04917`；与上述默认分支 `git diff --exit-code` 无差异（仅提交历史含合并差异）。
- 主工作区 `/Users/hushaohong/vibehard` 的原有未提交文档均未覆盖。检查开始时隔离工作树干净。
- 对网页/API、业务库、Runner/Gateway、EDA、入库与部署脚本、Laya 做全仓类型/规则扫描、既有测试与构建；重点人工追踪认证、项目归属、任务生命周期、引用来源、索引切换、原生工具执行与文件访问边界。
- `app/components/lib/runner/gateway/services/scripts/deploy/laya` 范围共 367 个 Git 跟踪文件（包含数据和文档，不等于 367 份可执行代码）。脚本语法检查覆盖 89 个 JS/MJS/CJS、16 个 Python、3 个 Shell 文件。
- 第三方依赖、生成文件、素材以及技能参考文档不声称逐行人工审计。未进行依赖 CVE 专项扫描、全页面浏览器交互遍历、实物 USB/烧录验证或生产故障注入。

## 已确认的问题

### 1. [P1] 超时后的失败写入没有期限，可能卡住整个方案 Worker

位置：`lib/server/design-job-worker.ts:57–62`；相关 `lib/server/design-job-store.ts:99–125`、`scripts/design-worker.ts:12–15`。

`boundedDesign` 到期会退出正常执行，但 catch 随后在期限外 `await finishDesign(...)`。该失败路径没有执行期限/查询取消；如果数据库行锁或查询持续阻塞，失败写入同样挂起。Worker 是单并发、逐个 await，因而后续任务不能开始，SIGTERM 的正常收尾也要等待它返回。页面的租约到期展示并不能恢复这个 Worker 循环。

复现证据（两次最小复现、两次真实 PostgreSQL 行锁确认）：

1. 仅在专用 `vibehard_design_test` 创建合成用户和方案，认领任务。
2. 第二连接持有该任务行的 `FOR UPDATE` 锁；使用原代码真实诊断/失败存储函数。
3. 将可注入测试期限缩为 40 ms；400 ms 后超时收尾已触发 1 次，但 Worker 仍未返回。
4. 释放锁后 Worker 才返回，任务标记 `failed/TIMEOUT`；测试用户和任务已清理。没有模型调用。

这验证的是数据库阻塞条件下的控制流，不是“本次线上模型实际卡死”的证据。建议修复数据库查询/锁等待和失败收尾的有界取消，并验证不会遗留占用连接的后台查询；不要仅增大 90 秒限制。

### 2. [P1] 新资料批次的激活是整库替换，不能累计检索多个批次

位置：`lib/server/knowledge-batch-control.ts:93–100`、`scripts/build-controlled-knowledge-index.py:25–35,90–95`。

离线构建包只包含一个原始批次；`current.json` 只指向一个索引。激活第二批会让检索进程只读取第二批，没有聚合旧批次或全量合成步骤。若按“继续导入新芯片资料”使用，旧批次仍保存在磁盘/OSS，但不再参与私有索引检索。

两次隔离复现：建立 ESP32-S3 包 A 与 RV1106 包 B；A 激活时 ESP32-S3 查询命中 1 条；切换 B 后同查询为 0 条，而 RV1106 命中 1 条。未操作生产指针或原件。

数据库中的已发布小型文本不受此索引替换影响。本问题是批次扩展语义缺口，并非已经删除线上资料。建议在启用新批次前实现有界多索引集合，或构建包含全部保留批次的不可变全量索引；激活门槛同时回归旧批次查询。

### 3. [P2] 同一原始批次的新索引版本不能登记

位置：`lib/server/knowledge-batch-control.ts:56–62`；构建器 `scripts/build-controlled-knowledge-index.py:27–32,90`。

登记目录仅用原始 `batchId`，忽略 `version`。同一批原件改进 OCR/切分后生成 v2，包校验通过，但 v1 已存在时 `mkdir` 报 `EEXIST`。不能靠随意换 batchId 绕过：构建器会校验处理状态及逐来源的原始批次 ID。

两次复现：同 batchId 的 version 1、version 2 包均校验通过；v1 登记成功，v2 登记失败 `EEXIST`。

建议区分不可变原件批次 ID 与索引构建/版本 ID，目录、激活/回滚参数与容量计算使用后者，同时保留前者作溯源。

### 4. [P2] 管理员重置密码后，旧登录会话仍有效

位置：`lib/server/store.ts:79–87`、`lib/server/http.ts:7–11`、`lib/server/security.ts:16–17`。

重置只更新密码哈希和 updatedAt；请求认证只核验签名/到期并读取当前用户，没有密码变更后的会话版本或撤销检查。已登录的人仍可继续访问；在账号泄露场景下，管理员重置密码不能踢掉原会话，默认可能持续至签发后的 7 天到期。

两次隔离内存适配器复现：重置后旧密码校验失败，但携带重置前 Cookie 的真实 `requestUser` 仍返回同一用户。PostgreSQL 分支代码同样只更新上述两个字段；本项未重置任何真实账号密码。

建议增加会话版本或独立 credentialsChangedAt，并在签发与每次 API 身份校验时核对；避免将普通资料更新时间误作密码撤销时间。

## 两轮验证记录

| 检查 | 第一轮 | 第二轮 |
| --- | --- | --- |
| TypeScript `tsc --noEmit` | 通过 | 通过 |
| ESLint 全仓规则 | 0 错误、1 警告 | 相同 |
| 常规 Vitest | 288 通过、13 条件跳过 | 随机顺序 seed=20260927，288 通过、13 条件跳过 |
| 隔离 PostgreSQL（补跑跳过中的 11 项） | 11/11 通过 | 11/11 通过 |
| 原生 KiCad（补跑剩余 2 项，并重跑该两文件其它 8 项） | 10/10 通过 | 随机顺序 seed=20260928，10/10 通过 |
| Python 入库流程 | 7/7 通过 | 7/7 通过 |
| Python EDA 服务 | 补齐隔离依赖后 20/20 通过 | 20/20 通过 |
| JS/Python/Shell 附属脚本语法 | 108 文件通过 | 108 文件通过 |
| 服务 bundle 构建 | 通过 | 通过 |
| Next 生产构建 `/vibehard` | 通过 | 通过 |
| 本地生产构建 HTTP/资源检查 | 通过 | 通过 |
| 4 项新增缺陷复现 | 均复现 | 均再次复现 |
| Worker 真实 PostgreSQL 行锁复现 | 复现 | 再次复现 |

去掉重复执行的 8 个 KiCad 文件内用例，每轮覆盖现有 301 个 TypeScript 用例，另有 27 个 Python 用例。原先 13 个条件跳过不是当作成功计算，而是分别补跑。既有测试全通过与发现缺陷不矛盾：原测试缺少以上触发场景；临时复现断言的是“缺陷存在”，不是修复验收。

本地 HTTP 校验：匿名 PCB 跳转登录 307、匿名项目 API 401、Demo 200、PCB v0.2 页面及详细 renderer 正确；18 个引用静态资源可读、5 个 Demo GIF 与本地文件 SHA 一致。使用虚构本地会话，不读取真实用户数据；这不是登录用户全部交互验收。

环境和提示：

- Python 初次 EDA 测试因系统环境缺 `aiohttp` 产生 2 个导入错误，未算作代码失败/测试通过；随后在 `/private/tmp/vibehard-audit.FWjxBs/venv` 安装仓库指定 `aiohttp==3.14.1` 并完整重跑，无全局安装。
- 本机实际 KiCad CLI 为 **10.0.5**，不是重新验收生产 KiCad 版本。两轮均有 Fontconfig 配置警告，但原生网表、几何、Gerber/钻孔及哈希断言通过。不能据此宣称实际硬件电气或制造已验证。
- 唯一 ESLint 提示为 `app/demo/showcase-controls.tsx:80` 的 `<img>` 性能建议，不属于功能阻断。
- 常规 Runner 命令并发绕过假设已排除：`runner/index.ts:160–178` 使用消息串行队列。共享文本检索 limit 200 与新增入口同一总量上限相匹配，未作为缺陷报告。

## 证据与边界

本机临时诊断目录：`/private/tmp/vibehard-audit.FWjxBs/`，含 `reproduce.ts/.cjs`、`worker-row-lock.ts/.cjs`、`run-db-repro.mjs`、脚本语法检查及第二轮测试/构建日志。复现脚本设有数据库范围保护；数据库凭据仅在进程内存/环境中传递，未写入报告或日志。该目录是本机诊断材料，不是要上传到云端的资料包。

没有进行真实模型计费请求、生产迁移/服务重启/索引切换、Git commit/push。没有改业务实现；本次仅新增报告和团队交接记录。临时本地网页及测试库 SSH 通道在收尾停止。主工作区原有五项文档变更仍保留。

按 `diagnose` 的复现—假设—边界探测—重复验证流程执行；由于本轮请求是检查，修复步骤留待确认，不把“定位完成”写成“修复完成”。下一步优先修 Worker 的失败收尾，再修批次集合/版本模型，最后补会话撤销和对应正式回归测试。
