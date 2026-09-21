# 任务日志

每个有意义的开发任务追加一条记录。条目保持简短，并以证据为中心。

真实任务条目从本行下方开始。

## 2026-09-20 Task: 方案生成持久化与项目归档

- Request/approval: 用户要求点击生成自动创建或关联项目、保存需求、后台生成并保存方案；明确确认新增任务表/归属校验，本轮仅本地测试。
- Changes: `design_jobs` 表/0005 迁移、事务幂等入队、租约与硬超时、并发/排队限额、独立处理器；方案页面和项目入口可恢复/下载/失败原项目重试。旧同步 NDJSON 契约及验收脚本同步更新。不改认证角色、Runner/Gateway、知识审核或现有工程文件。
- Evidence: 124 常规 + 10 隔离 PG 测试、类型/ESLint/生产与服务构建通过；HTTP 与真实浏览器自动建项目→离开→处理器恢复→刷新保留需求/失败→原项目重试通过，PCB/Demo 保护通过。模型成功/超时/额度/格式边界为受控测试，未调用真实上游。
- Delivery: 临时本地服务/库/合成账号回收；无云端操作、未迁移生产、未 commit/push。Docker 已有存储错误未处理，临时 PG 不写项目依赖。下一步发布需备份迁移及独立 worker 安装，不能只发布页面。

## 2026-09-20 Task: 模块帮助弹窗云端发布

- Request: 用户要求上线已实现的模块问号/说明弹窗。
- Release: `20260920-module-help`，归档 SHA256 `93c8cd9298ddd70b5e5d5a86f2112b893dd24e6a7fac504064751fa62e2f140c`。仅平台重启，旧 unit 留作回滚；不改数据库、模型、账号、Runner/Gateway/nginx。
- Evidence: 118 常规测试、类型/lint/生产构建通过；逐文件核实后端/认证/DB/schema/Runner/Gateway/依赖/Next/proxy 与上一版一致。候选/正式/公网 15 类帮助页面绑定及引用 bundle、PCB/18 资源/5 GIF、Cookie、管理/知识审核、方案/工作流回归通过。
- Boundary: 只读候选预检使用现有配置，无测试业务写入/临时 DB/模型调用。浏览器连接超时，未完成真实点击或手机视觉验证。已有原理图模型超时没有在此 UI 发布中解决。
- Handoff: 预检服务停止，3211 回收；保护服务 PID 与配置哈希不变。源码快照包含全部 PCB/Demo 保护内容，未 commit/push。

## 2026-09-20 Task: 各模块小问号与使用说明

- Request: 用户希望 Agent 项目及各模块可点击问号查看使用说明。
- Scope: 统一 ModuleHelp 弹窗与集中说明，10 个通用 PageHeader 模块和工作台/Agent/知识/审核/管理自定义标题、工具/MCP 详情页接入；合计 15 类说明、17 页入口。无后端、权限、任务、数据库或模型配置修改。
- UX: 键盘、焦点限制及返回、Esc/遮罩关闭，窄屏留边和内滚动；不请求模型、不丢草稿。文案明确演示功能、审核角色和原理图超时，不制造已实现印象。
- Validation: 新增 17 项组件测试（初次 Tab 焦点断言早于异步焦点恢复，改为等待实际恢复后通过）；完整 118 常规测试通过，3 项 DB 跳过。类型/lint/生产构建通过，无本轮真实浏览器/移动端视觉验收。
- Delivery: 本地完成，未部署、提交或推送，云端仍为 `20260920-knowledge-review`。

## 2026-09-20 Task: 知识审核分权与原理图申请云端发布

- Request: 用户明确要求上线；允许发布所需的隔离测试与平台切换。
- Release: `20260920-knowledge-review`；SHA256 `47f0fc1524a561014605790155bbed5f6b4ca12322c30b65fe434a68e2a92f04`。完整源码归档保留 PCB/Demo。只重启平台，Runner/Gateway/VibeBoard PID 不变；无新 DB 迁移、角色/密码/Key 改动。
- Tests: 101 常规 + 3 隔离 PostgreSQL 测试通过；候选 HTTP 验证审核角色/所有者限制/退回审计/修改重审/草稿隔离/重复申请/旧 Cookie 降权。构建/类型/lint、候选/正式/公网 PCB/Demo/管理员/认证/方案/工作流回归通过。
- Proxy: 发现 VibeHard 没有上传上限覆盖；仅该 location 加 6m，保留 5 MiB 应用限制。原 inode 写入及 nginx -t 后平滑 reload，不重启容器，公共入口超限 JSON 413 验证通过。
- Limitations: 两次公网真实合成 PDF（约 1.1 MB / <2 KB）均 90 秒模型超时，未得到可提交资料；不回退假内容、不更换模型/Key。不代表识别/Agent 长时稳定；浏览器连接工具超时，未完成真实点击端到端。下一步需排查上游模型兼容性与超时。
- Safety: 旧普通用户审核且生效资料为 0，不需修改旧知识。新 release 下独立 pg_dump 和服务/nginx 备份已留存。一次性测试库/账号/凭据及 SSH 隧道已清理，3211 关闭，无生产测试用户/知识写入；未提交/推送。

## 2026-09-20 Task: 知识申请与管理员/开发者审核分权

- Request: 用户修改治理规则，普通用户只申请，最终由管理员或开发者审核，替代所有者自审。
- Changes: 知识写事务按当前 DB 角色校验并锁定；普通所有者仅创建/修改/恢复草稿，审核者仅获得跨项目知识读取及 publish/reject/disable，不扩大工程/聊天/管理设置权限。新增分页审核 API/页面及侧栏/管理台入口；退回原因与修改后重审、普通用户查看申请状态。
- Evidence: 101 常规测试通过，类型、针对性 lint、Next 生产构建通过。覆盖旧/伪造 Cookie 角色、降权、开发者边界、普通所有者禁止审核、退回旧正式不变、列表分页/拒绝后清空、只读审核 UI。3 个 PG 专用测试跳过；审核夹具已更新但需隔离库重跑。
- Boundary: 无生产写入、角色授予、部署、迁移、服务重启或提交/推送。未做本轮浏览器/生产验收；旧正式版本保留不伪造审核记录，上线前盘点普通所有者历史发布并明确复审策略。

## 2026-09-19 Task: 知识库补测试与云端发布准备

- Request: 补齐测试后上线，评估附件 OSS 是否适合存数据库。
- Changes: 停用改页面内确认，组件覆盖取消/停用/恢复；准备精确命名、受限权限、可清理的临时 PostgreSQL 测试库脚本与 SSH 隧道验收入口。
- Evidence: 85 项非 DB 测试、类型/lint、前端与服务构建通过；本地浏览器发布 v1→取消停用→停用→历史复制草稿→人工复审 v2 通过。云端只读确认 PostgreSQL 15.18、回环 5432、磁盘数据目录，沿用现有库而非 OSS。
- Blocker: 创建 `vibehard_knowledge_test_20260919` 数据库/账号被安全审核拒绝，已申请用户明确批准权限与测试后删除范围。3 项 DB 集成未跑、无生产迁移或发布。
- Safety: 未上传 OSS 凭据、未改 Bucket、未修改 VibeBoard 失败的备份服务。该服务脚本缺失，正式迁移前需要独立 VibeHard 备份。未提交/推送。

## 2026-09-19 Task: 项目知识审核与 Agent 正式版本快照

- Goal: 用户确认项目所有者审核自己的项目；待审核原理图资料不能直接进入正式知识上下文。
- Scope: 项目知识 UI/API/数据库新增表、task.start 可选快照、Runner 校验和上下文重建、版本证据、测试/交接文档。不改账号角色、模型 Key、原理图分析模型或生产服务。
- Validation: 85 项通过、3 项 PostgreSQL 用例跳过；类型、lint、前端及服务构建通过。浏览器保存/发布/再编辑草稿隔离通过；停用确认框自动化超时，不能记为浏览器通过。独立 PostgreSQL 受 Docker 镜像存储 I/O 故障阻塞，迁移与 DB 并发测试待跑。
- Result: 本地实现，未提交、推送、部署。原理图自动分析/提交仅预留契约，未实现真实自动链路。
- Risks: 首版文本有界快照不是 RAG；版本变化会重建模型上下文，旧网页聊天不自动带入；模型实际使用/审批/长时稳定性需后续真实验收；生产未升级 Runner 不支持带知识任务。
- Next: 补独立 PostgreSQL 与真实模型验收，再经用户确认上线；C 部分依 `docs/project-knowledge.md` 将真实分析结果提交草稿。

## 2026-09-19 Task: 发布云端工程工作流并真实验收

- Scope: 用户明确要求上线；版本化平台和云端 Runner 发布，保持 Gateway、VibeBoard、nginx、USB Runner、账号、数据库及凭据不变。
- Release: `20260919-engineering-workflow`；archive SHA-256 `5bbdf70ac2e9340d20da4f587c213bcd6f251198534aada3cb6ffb6d953eb224`。原单元备份 root-only，新 Runner bundle 直接由 release 路径启动。
- Validation: 候选/正式完整前端和管理/认证/方案/工作流回归通过；公网登录/Demo 200。云端新心跳确认、临时服务回收，3211 关闭。
- Real model: 管理员下独立验收项目 `5b2696cb-75d8-4aae-83f6-5624492804f4` 保留。两轮真实分析、同会话受控修改、两次审批、make test 退出 0/WORKFLOW_TEST_OK、证据报告成功；独立核对三份保护文件原样和 ELF 产物。Chrome 验证报告展开、刷新恢复和 Markdown 下载完成。
- Incident: mktemp 打包根目录模式 0700 导致首轮 Runner 启动权限失败；仅将新 release 根目录改为 0755 后恢复，备份与验证目录保持 0700，无 Key 权限变更。后续激活前需用运行账号检查 bundle 可读。
- Boundaries: 未验证泰山派硬件、生产拒绝/中断或持续负载；观察到模型审批中间文案滞后，但最终结果正确。不是稳定性保证。

## 2026-09-19 Task: 审阅小智技能库并规划 Agent 接入

- Scope: 只读审阅附件与当前 Runner/协议/沙箱实现；新增接入建议文档，没有执行第三方脚本或修改生产。
- Evidence: 实际 50 份 SKILL.md（含模板）；检查归档分析、流程章节和代表性技能/脚本。当前每项目一个 runnerKey，任务仅发送文本，缺少平台技能版本记录和跨节点交接。
- Result: `docs/embedded-skills-integration-plan.md` 给出分批接入、只读技能包、项目知识路径、审批、资源与泰山派 APP 部署边界；澄清现有链路已打通但最近模型超时，不能称稳定。
- Validation: 文档 diff 检查；未运行构建/设备测试，未声明已安装技能。

## 2026-09-19 Task: 方案 BOM 参考价与知识资料文案

- Goal: 自动填写 BOM 参考价，并让知识库文案有实际调用依据。
- Implementation: 加入版本化内置基础工程规则，每次设计请求注入模型；返回知识版本。常见器件输出人民币小批量估算价，缺少依据时允许说明无法估算原因；页面和下载文档保留估算边界。
- Scope: 方案页、设计接口及 schema、内置规则、测试、发布与交接记录；没有导入团队泰山派资料，没有实现 RAG 或实时供应商查询。
- Validation: 65 项通过/2 项数据库专用测试跳过，类型、lint、构建通过；真实候选请求 13 条 BOM 均有人民币参考价；正式前端、PCB/Demo、管理台、认证回归通过。
- Deployment: `20260919-design-knowledge-pricing` 已上线；上一版 `20260919-auth-cookies` 可按发布脚本回滚，只重启平台。
- Browser: 新版文案可见；完整及简短需求两次均为上游 90 秒超时，未宣称正式网页带价表格验证成功。临时 unit 已回收、3211 关闭。

## 2026-09-19 Task: 修复认证 Cookie 并发布

- Authorization: 用户明确确认继续修复并上线；编辑登录、注册、退出及共用 Cookie 写入模块、回归测试、发布脚本与交接文档。
- Result: 发布 `20260919-auth-cookies`；分别序列化同名不同路径 Cookie，避免根路径旧会话残留；账号角色和密码未变。
- Validation: 路由与浏览器 Cookie jar 回归先红后绿（3 个原失败、6 个最终通过），全套 63 通过/2 数据库测试跳过，类型、lint、构建通过。候选/正式 PCB、Demo、管理台及 Cookie HTTP 检查通过，公网双头检查通过。
- Browser: 从真实 Chrome 退出后 `/api/auth/session` 返回未登录；已填写管理员邮箱等待用户自行输入原密码，未声明真实浏览器管理员登录完成。
- Operations: 只重启平台；临时预检已停止且 3211 关闭；上一发布 unit 保留可回滚。没有生产迁移、权限/密码修改或模型调用。

## 2026-09-19 Task: 排查管理员会话被识别为普通成员

- Scope: 只读检查浏览器当前身份和认证代码，未修改认证、账号权限或生产服务。
- Evidence: Chrome 直接访问 `/vibehard/api/auth/session` 返回 `ldcx@demo.com / member`；此前生产数据库检查确认 `ldkj@admin.com / admin`，管理员服务端接口验收通过。
- Reproduction: 用当前安装的 `next/server` 和虚拟 Cookie 值复现：连续设置同名根路径删除 Cookie 与 `/vibehard` 新 Cookie 时，响应只保留后者；请求同时携带新路径和旧根路径的同名 Cookie 时，解析结果选择后面的旧值。
- Finding: 登录/退出存在旧根路径 Cookie 清理缺陷，可导致账号切换后仍识别旧账号；尚未读取当前浏览器 HttpOnly Cookie 路径，不能把该缺陷视为这次浏览器状态的完全确证。
- Next: 修复各认证入口的旧 Cookie 清理并加入账号切换回归测试，再验证真实浏览器；认证属于团队规则要求明确确认的高风险编辑区域。

## 2026-09-19 Task: 平台管理台按功能分区

- Goal: 缩短管理页，按概览、模型设置、Runner 节点、用户管理、审计日志切换显示。
- Scope: 仅管理页呈现、组件测试及交接记录；不修改认证、密码重置逻辑、数据库、Runner 或生产部署。
- Changed files: app/app/admin/page.tsx,__tests__/admin-sections.test.tsx,.ai/TASK_LOG.md,.ai/PROJECT_STATUS.md,docs/current-status.md
- Validation: 3 项新增组件测试通过，覆盖单分区显示、未保存输入保留、权限拒绝；TypeScript 与针对性 ESLint 通过；`NEXT_PUBLIC_BASE_PATH=/vibehard pnpm build` 成功。
- Result: 已发布为 `/opt/vibehard/releases/20260919-admin-sections`；切换分区保留模型表单状态，不触发保存。
- Production validation: 候选与正式环境均通过 PCB/Demo 完整回归和管理台 bundle/API 校验；公网登录、Demo 返回 200；Gateway/VibeBoard PID 未改变；3211 临时服务已回收。
- Next: 由管理员在常用浏览器复核实际使用体验；需要回滚时恢复发布目录内备份的 `vibehard.service`。

## 2026-09-18 Task: 建立三人协作的云端文档交付与 Agent 读取规范

- Owner: 未填写
- Goal: 建立三人协作的云端文档交付与 Agent 读取规范
- Changed files: AGENTS.md,.ai/TEAM_RULES.md,.ai/PROJECT_STATUS.md,.ai/SKILL_REGISTRY.md,.ai/TASK_LOG.md,docs/team-cloud-delivery.md,docs/README.md
- Validation: 已对照生产 systemd、Runner workspace、Codex sandbox 和资源限制；git diff --check 待执行；未执行代码构建
- Result: implemented
- Risks: 受控项目文档导入工具/API 尚未实现；生产模型链路当前超时
- Next: 评审规范后实现按 project_id 导入 workspace 的工具，并清理不再需要的预检服务

## 2026-09-18 Task: 清理 device-routing 临时预检服务并收敛团队协作职责

- Owner: 未填写
- Goal: 清理 device-routing 临时预检服务并收敛团队协作职责
- Changed files: AGENTS.md,.ai/TEAM_RULES.md,.ai/PROJECT_STATUS.md,.ai/TASK_LOG.md,docs/current-status.md,docs/team-cloud-delivery.md
- Validation: 确认 transient unit 无依赖；停止后 unit not-found/inactive/dead；3211 无监听；三个正式服务 active；3210 返回 200；两个 Runner 心跳正常
- Result: implemented
- Risks: 模型 provider 超时仍未修复；项目知识导入工具仍未实现
- Next: 同伴通过 PR 交付普通变更；负责人合并后执行版本化部署

## 2026-09-18 Task: 生成可发送给同伴的 VibeHard 协作资料压缩包

- Owner: 未填写
- Goal: 生成可发送给同伴的 VibeHard 协作资料压缩包
- Changed files: out/VibeHard-Team-Onboarding-20260918/（忽略的交付目录）,out/VibeHard-Team-Onboarding-20260918.zip（忽略的交付文件）,.ai/TASK_LOG.md
- Validation: ZIP 完整性通过；包内 7 个文件 SHA-256 全部通过；敏感信息模式扫描通过；压缩包 12802 字节
- Result: implemented
- Risks: 压缩包是 2026-09-18 快照；同伴实际开发时必须读取仓库最新规则
- Next: 将 ZIP 发给两位同伴，并要求其通过独立分支和 PR 协作
## 2026-09-19 Task: 原理图识别结果申请进入知识库备选

- Goal: 先落实第一种来源（网页原理图分析），只申请备选，不自动入正式库；经验 MD 经 Agent 处理为下一阶段。
- Changes: 原理图页/真实附件 API、LLM 可选附件协议、文件与并发限制、知识 create 可选幂等编号、直达审核页、回归与说明文档。原固定模拟结果移除。
- Validation: 95 项常规测试通过，3 项独立 PostgreSQL 测试本轮跳过；类型/lint/生产及服务构建通过。云端只读配置 + 合成微型 PDF 实请求 36.753 秒通过，模型读取了仅存在附件中的随机编号/R7/D2并指出图形缺失。未触发真实工程 Agent、未写生产库、未调整模型配置。
- Result: 本地完成，未部署/commit/push；新入口是识别结果正文下方「目标项目」+「申请加入知识库备选」，成功后「前往审核此资料」。
- Limits: 原文件暂不持久存储；沿用项目所有者审核非全平台库；共用 design 模型；PNG/JPG 真请求、复杂多页 PDF、反向代理大文件及正式浏览器端到端验证待补。单进程限流/并发不等于全局配额。

## 2026-09-19 Task: 项目知识库补测试并部署云端

- Goal: 按用户“上线到云端”发布项目知识审核及任务快照；存储沿用 PostgreSQL，不把活动数据库放 OSS。
- Changes: 项目知识 API/页面、所有者审核版本状态机、数据库迁移、Runner 快照注入和上下文重建、回归测试、版本化打包/部署/验收脚本及交接文档。
- Validation: 85 项常规测试 + 3 项隔离 PostgreSQL 测试通过；类型/lint/build 通过；候选 HTTP 生命周期/权限/冲突通过；候选与正式 PCB/Demo/管理台/Cookie/方案/工程报告校验通过；真实模型三轮验证 v1 草稿隔离、v2 重建上下文、停用后排除全部完成。
- Deployment: `20260919-project-knowledge`，归档 v2 SHA-256 `51253c8e5a308868dde81c21b5db9d936fa14b63c18c163031c2d5cdbd55a449`。迁移前独立备份；零活跃任务时切换平台/云端 Runner；Gateway/VibeBoard/设备节点/账号/密钥未改变。首个候选因绝对依赖链接失败，修复打包后预检和上线通过。
- Cleanup: 删除精确隔离测试库、角色、测试凭据；停止预检服务和 SSH 隧道，3211 关闭。失败包保留供后续有范围的留存清理，不清理无关旧 release。
- Result: 已上线，正式验收项目 `aee4614b-2e78-4b5b-a89d-4ad5bd8c99bd` 保留；未 commit/push。
- Boundaries: 未接原理图真实分析/自动草稿提交、OSS、设备 Runner 知识能力、硬件烧录或长期压力验证；本轮不重复完整工具审批/SSE 浏览器验收。

## 2026-09-19 Task: 工程分析、受控修改与报告接入 Agent loop

- Goal: 按用户确认落地云端工程工作流第一阶段，区分执行接入点与观测埋点。
- Scope: Runner 会话上下文和脱敏事件摘要、工作台报告 UI、构建内嵌自有技能、测试与交接文档；不修改认证、数据库、Gateway 协议或生产服务。
- Implementation: 新建/恢复会话注入相同版本规则；开关默认关闭，禁用时清除旧覆盖规则；已有只读沙箱和网页审批不变。终态报告记录观察到的命令/文件/审批证据，不自动写工程报告、不声称全文件审计或硬件通过。
- Validation: 已核对 Codex 0.149.1 原生请求 schema；mock 合约覆盖新建/恢复/禁用/允许/拒绝/中断/超时/脱敏；组件验证报告回放和下载；技能格式校验通过。完整测试初次因回环监听 EPERM 失败，允许本地端口后 73 项通过、2 项独立数据库用例跳过；类型、针对性 lint、Next 生产构建和服务构建通过。
- Result: 本地完成，未提交/推送/部署；待独立云端测试项目实际分析、修改、验证和报告验收。
- Risks: 模型遵循软规则需真实验收；没有逐文件强制 allowlist；shell/MCP 变更未必有 fileChange 事件；本功能不解决模型上游超时。
