# 方案可靠性与统一知识检索交付

2026-09-27，用户批准完整计划并要求实施：整合 `codex/eda-rag-integration` 到 GitHub 默认分支，随后按可靠性、统一检索、受控批次导入分别验收发布。

允许范围：方案任务存储/Worker/诊断 API 与 UI、增量数据库迁移、统一检索与受限索引进程、Agent 检索协议与 Runner 兼容、EDA 项目归属与引用、批次清单及自动筛查工具、相关测试与分阶段部署脚本。保留本机主工作区的未提交文档；不改用户账号/模型配置/密钥；不重启无关 VibeBoard、nginx 或 Gateway。

已确认：90 秒总硬超时，手动重试；隔离环境三类需求各四次，共 12 次真实模型请求；默认自动有界检索；自动索引资料标为未人工复核；批量导入首版仅管理员平台共享批次。先测试，再按阶段发布，可独立回滚。

## 验收进度

- 基线：PR #3 已以 merge commit `6d2ba12` 整合到默认分支；从合并点建立 `codex/design-reliability`。主工作区的未提交文档未动。现网发布清单 998 个源码文件均在候选中；除允许的诊断改动及已上线 worker 的索引差异外，其余运行时代码哈希一致。
- 可靠性：已实现增量迁移 `0007`、六阶段持久诊断、固定脱敏错误码、网络耗时、用户进度与管理员独立诊断分区；手动重试、90 秒硬期限、租约 fencing 保持。旧任务为 null，不补造诊断。模型自己返回的引用字段在结果校验前丢弃。
- 测试：类型、生产构建、全仓 276 项测试通过；隔离数据库 11 项回归（含诊断、租约 fencing、下载归档）通过。早期共用队列的一轮作废，不作为发布门槛。专用 `vibehard_reliability_test` 第一整轮 7/12 通过，5 次在 HTTP 200 后等待正文达到 90 秒；检索仅几十毫秒。低推理强度/4096 token 候选 11/12 通过，1 次上游未完成，未发布。第三整轮使用 low/8192 token 有界策略，等待完整结果。原资料/生产库不变，所有失败证据保留。
- 定位与修复：仅官方 DeepSeek `deepseek-v4-pro`/`deepseek-flash` 的方案草稿使用显式 `reasoning.effort=low`（Chat Completions 对应 `reasoning_effort`），联合推理/输出上限 8192。其他供应商、管理员连接测试、Agent 执行策略不变。新增 OUTPUT_LIMIT 与固定的 providerStatus/outputTokens 诊断，修复复用 TLS 连接反复注册监听器。官方依据：[Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)、[Responses](https://api-docs.deepseek.com/api/create-response/)。不延长时间、不自动重试付费请求。
- 第一阶段发布：最终第三整轮 12/12 通过后，已应用增量迁移并切换 `20260927-design-reliability-v1` 网页与 Worker。归档 SHA256 `a89f5049a350034aabf9a0030aa58df94f9dd6f931a226100a59012e3d825ae8`，代码 `1e8f471`。预检/备份/保护页面/模型凭据与无关服务不变均通过。PR #4 已合并。
- 统一检索候选：已加入唯一服务端入口、私有 Unix socket 进程（并发 2、384 MiB、50% CPU）、平台/项目权限过滤、部分不可用状态；方案、Agent、EDA 共用服务端引用。Runner 增加可选 bounded-retrieval-v1，旧节点显示降级；资料版本变化强制新原生上下文。全仓 283 项通过；隔离 PostgreSQL 11 项通过，含草稿/停用/跨项目/EDA 平台范围和上下文版本重置。当前真实模型在非 root/bubblewrap 全工具回合 5.7 秒通过；内部进程 60 次双并发 P95 4.3 ms、峰值约 40 MiB、未授权用户拒绝。等待发布候选预检与切换。
- 批次导入：待实现清单版本、逐来源状态、激活/回滚和隔离处理验证。
