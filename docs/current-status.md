# 当前状态与交接

最新更新：2026-09-21，北京时间。以下核查结果分别标注时间，不代表持续监控。

## 2026-09-21 本地整合 GitHub 泰山派入口

- fetch `github/codex/agent-platform-foundation` 至 `bc8b57a`，先以 `a972b99` 保存原有 100 个文件的本地成果，再 merge 保留双方历史；侧边栏自动合并。补齐新泰山派页与本地 PageHeader 帮助参数的兼容性，新增第 16 类说明。
- `/app/taishan` 内嵌独立 `/Vibeboard/`，账号单独登录，不代表统一 Agent/知识库/项目数据或完成硬件链路。127 常规测试、类型/生产构建/针对性 ESLint 通过；本轮 10 个数据库用例未重跑。
- 本地代码现已提交整合，未 push、未上线、未迁移数据库；线上仍是 `20260920-module-help`。下文“未 commit”是历史时点记录。详见 `docs/remote-integration-20260921.md`。

## 2026-09-20 方案持久化后台任务本地完成，未上线

- 用户确认新增方案任务表与归属校验，仅本地实现/测试。点击生成事务创建或关联自己的 Agent 项目并保存需求，独立 `design-worker` 后台处理，结果和失败记录归档到“项目 → 方案记录”；刷新/离开不取消已保存任务。
- 新增 `0005_design_jobs` 迁移，尚未应用到生产。方案模型全局并发 1、每用户 1 个活跃任务、队列上限 20、模型硬超时 90 秒、执行租约 120 秒；故障不自动重放计费请求，手动重试复用项目。
- 124 常规 + 10 隔离 PostgreSQL 测试、类型/lint/生产与服务构建通过；本地真实 HTTP/独立处理器、内置浏览器新建→离开→恢复→刷新→原项目重试通过；PCB/18 资产/5 GIF 保护回归通过。成功模型响应为受控测试，真实供应商超时未复测。
- 不自动发布知识库、不写 Runner 工作区、不自动将方案加入 Agent 上下文。临时测试服务/数据库已回收，未操作云端、未 commit/push；线上仍为 `20260920-module-help`。详见 `docs/design-background-jobs.md`。

## 2026-09-20 13:51 模块使用说明弹窗已上线

- 平台切换到 `/opt/vibehard/releases/20260920-module-help/standalone`，各模块标题问号可查看用途、步骤与真实能力限制；15 类说明覆盖 17 个页面入口。仅平台服务重启，Runner/Gateway/VibeBoard/nginx 及配置哈希保持不变，无账号/角色/Key/数据库写入或迁移。
- 118 常规测试通过（含 17 项帮助组件测试），3 项 DB 专用用例跳过；生产构建/类型/lint 通过。发布前逐文件确认 API、server、db、agent 协议、Runner/Gateway、迁移、依赖及 Next/proxy 源码与线上旧版完全一致。候选、正式、公网 15 类页面帮助绑定/引用 bundle、PCB 详细 renderer/18 个资源/五个 GIF、管理/知识审核、Cookie、方案/工程报告保护通过。
- 候选仅回环开放，使用现有配置进行只读验证，不运行模型、不创建测试业务记录或数据库；预检服务已停止，3211 回收。旧平台 unit 在新 release 的 root-only backup 中可回滚。
- 浏览器连接工具本轮仍超时，未完成真实浏览器点击或移动端视觉验收；不能把组件/HTTP 验证当浏览器实测。原理图此前两次 90 秒模型超时并未修复或复测，此次帮助发布不改变模型可用性结论。
- 归档 SHA256 `93c8cd9298ddd70b5e5d5a86f2112b893dd24e6a7fac504064751fa62e2f140c`，完整源码快照基于 `54fa2ca`，尚未 commit/push。维护和验证范围见 `docs/module-help.md`。
- 时点说明：发布脚本切换期间的保护 PID 校验通过；后续公网核查发现外部 VibeBoard PID 从最初的 775438 变为 776211，仍为 active。本次脚本没有对该服务发出 stop/start/restart，也未修改其文件；不将“切换期间校验通过”扩大成整个期间 PID 从未变化。VibeHard 新 PID 776035，Runner/Gateway 仍为 758750/727637。

## 2026-09-20 模块问号与帮助弹窗（本地完成，未部署）

- Agent 项目及其他模块标题旁增加问号，共 15 类说明、17 个页面入口；内容为用途、步骤和当前限制。复用现有 Base UI Dialog，支持 Esc/遮罩关闭、键盘焦点管理、移动宽度与内容滚动，不发送模型请求、不改变任务或草稿。
- 明确区分真实 Agent/方案/知识流程与芯片资料、调试、嵌入式等模拟演示，不将烧录演示当硬件验证，也不隐藏已知原理图模型超时。
- 新增 17 项组件测试，完整 118 常规测试通过；3 项 DB 用例本轮跳过（无 DB 变更）。类型、针对性 lint、standalone 生产构建通过；未做真实浏览器/手机视觉验收。
- 本轮仅 UI/帮助文案/测试/交接文档，无云端变更、commit/push。线上仍为下节 `20260920-knowledge-review`，尚无新增问号。维护说明见 `docs/module-help.md`。

## 2026-09-20 09:48 审核分权与原理图申请上线

- 已发布 `/opt/vibehard/releases/20260920-knowledge-review/standalone`，替代 `20260919-project-knowledge` 平台；Runner bundle 仍为旧 release `services/runner.cjs`，Gateway 仍为 `20260918-cloud-runner`。仅重启平台，账号/角色/密码/模型设置/凭据及数据库结构不变。
- 普通用户只能申请/编辑自己的资料；`admin` / `developer` 通过「平台管理 → 知识库审核」发布、退回、停用。原理图页真实文件模型请求、申请按钮及状态链接一并部署。正式审核队列 admin=200、member=403；未给任何账号升权，线上仍 1 admin + 1 member。
- 101 项常规 + 3 项隔离 PostgreSQL 测试通过；候选 HTTP 完整覆盖普通所有者不能自审、管理员/开发者跨项目知识权限、开发者无模型设置/密码重置权限、伪造/旧角色拒绝、退回审计、修改重审、草稿不覆盖正式版本、重复申请。类型/lint/生产及服务构建通过；候选、正式及公网 PCB/renderer/15 个资源/五个 GIF、管理员分区、认证 Cookie、方案与工程工作流保护通过。
- 上线前盘点仍生效的普通用户审核资料为 0，未删除或重写正式知识。`pg_dump` 备份及旧平台/nginx 配置存于新 release 的 root-only `backup/`，已校验归档目录，未做完整恢复演练。无新 SQL 迁移。
- 原 nginx VibeHard location 未设上传限制，已只给 `/vibehard/` 加 `client_max_body_size 6m`；原 inode 写入、`nginx -t` 后平滑 reload，容器/master PID 不变，其他站点配置不变。公网 >5 MiB 请求到达应用并返回 JSON 413，应用仍限 5 MiB。
- **真实模型未通过本次端到端验收**：公网约 1.1 MB 和小于 2 KB 的合成单页 PDF 两次均进入流式识别接口后触发 90 秒模型超时，未生成可申请草稿。没有假结果、未把测试内容写正式知识；不据此宣称原理图可稳定演示或模型稳定。9/19 直接服务商 PDF 成功是历史证据，不替代本次失败。PNG/JPG、复杂板卡准确度本轮未实测；经验 MD 经 Agent 整理专用通道未实现。
- 浏览器连接工具超时，未完成本轮真实浏览器点击验收；以上为 API/组件/HTTP bundle 与公网检查，不能称浏览器全流程成功。
- 临时测试库/同名角色 `vibehard_knowledge_test_20260919`、两端测试凭据和 SSH 隧道已删除/关闭；候选服务 inactive、3211 无监听。切换后核查 active turns=0，cloud-runner/device-runner 心跳分别约 3/9 秒，Gateway 8787 存在实时连接；Runner 758750、Gateway 727637、VibeBoard 731323 PID 未变。心跳不是本轮 Agent 模型验收。
- 归档 SHA-256 `47f0fc1524a561014605790155bbed5f6b4ca12322c30b65fe434a68e2a92f04`，包含完整源码快照（基于 `54fa2ca`）与 `RELEASE.json`；尚未 commit/push。后续优先排查识别模型超时/兼容性，再做真实浏览器识别→申请→审核验证，不自动换 Key 或提高超时上限。

下节“本地完成、未部署”为本次发布前历史记录。

## 2026-09-20 知识申请与平台审核分权（本地完成，未部署）

- 用户明确推翻此前“项目所有者自审”的决定：普通用户只能创建/修改本项目候选资料；publish/reject/disable 仅 `admin` / `developer`。新增退回原因，编辑后重新待审核，退回不撤销旧正式版本。
- 新增「平台管理 → 知识库审核」及管理概览快捷入口；审核者可分页查看跨项目知识并批准/退回/停用，但不能编辑他人草稿。普通用户从原理图申请成功后的「查看申请与审核状态」进入；看不到发布/停用按钮。
- 后端每次按数据库当前角色授权（写事务内锁定角色/项目）；签名 Cookie 自带角色、旧角色或前端隐藏不能绕过。开发者不获得模型设置、密码重置、管理概览或他人聊天/工程访问。未提升任何现有账号，注册仍为 member。
- 101 项常规测试通过，类型/lint/生产构建通过；3 项 PostgreSQL 专用用例跳过，已更新审核者测试夹具但本轮未创建隔离库实跑。新增角色/伪造 Cookie/降权/权限隔离/退回再申请/分页及 UI 测试。未做本轮浏览器端到端或生产验收。
- 无新增 SQL 迁移，无生产数据变更、服务重启、部署或 commit/push。线上仍为 `20260919-project-knowledge`，仍有旧版所有者自审权限；必须部署后新规则才生效。旧正式资料保留，上线前需盘点普通所有者历史发布并明确停用/复审策略，不静默删除。
- 下一步发布需重新跑隔离 PostgreSQL 与候选 HTTP 分权验收、确认原理图上传代理限制、保护 PCB/Demo，并审核角色授权名单。开发经验 MD 经 Agent 整理专用通道仍未实现。

## 2026-09-19 原理图识别与备选申请（本地完成，未部署）

- 发现原理图页只有定时器和固定 STM32 示例；已替换为认证后真实上传/模型调用，支持 PNG/JPG/PDF 输入协议，生成带证据要求与来源/hash 的待审核 Markdown。暂共用硬件方案生成模型，不改变现有 Key/配置。
- 结果区可下载 MD，正文下选择自己的项目并点击「申请加入知识库备选」，只创建草稿；成功后直达该条资料审核页。增加重复申请保护、格式/大小/并发限制、取消和明确失败，不自动发布，不扩大跨项目权限。经验 MD 经 Agent 整理通道留待下一步。
- 95 项常规测试、类型、lint、前端与服务构建通过；3 项 PostgreSQL 专用测试本轮未重跑。云端只读加载现有模型配置，用无用户数据的一页微型 PDF 实测，36.753 秒正确读取唯一标识和器件且保留不确定项；不是泰山派精度验收或正式浏览器上线验收。
- 本轮没有部署、迁移、重启服务或写正式业务库，线上仍为下节 `20260919-project-knowledge`。新申请按钮目前仅在本地版本，未 commit/push。上线前需核查 nginx 上传限制与完整候选流程，详见 `docs/schematic-knowledge-candidates.md`。

## 2026-09-19 21:35 项目知识库上线与三轮真实验收完成

- 用户再次要求上线后，获准创建精确的一次性 PostgreSQL 测试库及受限账号；85 项常规测试、3 项独立数据库集成测试均通过。类型、针对性 lint、生产与服务构建通过。回归初次因回环监听 EPERM 失败，授权端口监听后通过。
- 候选服务使用独立测试环境，HTTP 验证项目所有权、匿名/其他用户拒绝、草稿→发布→编辑隔离→停用→恢复草稿→再发布及过期 revision 409。预检安全检查要求提供服务器归档中实际 EnvironmentFile 绑定证据，核实后获准运行；没有把验收账号写入正式库。
- 已发布 `/opt/vibehard/releases/20260919-project-knowledge`，平台与 cloud-runner 更新，Gateway 仍用 `20260918-cloud-runner`。先备份正式数据库到新 release 的 root-only `backup/platform.dump`，验证归档清单，确认无活跃任务后应用新增表迁移 `0004_project_knowledge`。未做完整备份恢复演练。
- 候选及正式 PCB/renderer/15 个资源/五个 GIF、管理台分区/API、Cookie、方案与工程报告 bundle 校验通过；公网登录和 Demo 为 200。保留账号、角色、密码、模型 Key 与 Runner 凭据；Gateway/VibeBoard PID 不变，未重启 nginx 或设备 Runner。新云端 Runner 心跳新鲜并声明 `project-knowledge-v1`。
- 首个候选因 Node cpSync 将 pnpm 相对链接转为 Mac 绝对路径而无法启动，从未正式激活；修正 `verbatimSymlinks` 后发布成功。成功归档 SHA-256：`51253c8e5a308868dde81c21b5db9d936fa14b63c18c163031c2d5cdbd55a449`，完整源码快照基于 `54fa2ca`，本轮尚未 commit/push。
- `ldkj@admin.com` 下保留“项目知识库上线验收-20260919”，项目 ID `aee4614b-2e78-4b5b-a89d-4ad5bd8c99bd`。三轮真实模型全部完成：v1 正确引用随机验收编号且不读取未发布草稿；v2 正确引用新编号及版本并记录 contextReset=true；停用后快照为空、contextReset=true，模型回答“无已审核资料”。原始事件留在新 release 的 root-only `verification/knowledge-events.json`，网页会话可回看。验收不调用工具、不改工程文件，不代表编译/烧录、压力或长期稳定性验收；本轮没有重复完整审批/SSE 浏览器验收。
- 临时预检服务已回收为 not-found/inactive，3211 无监听；已删除隔离测试库、同名角色及本地/云端测试凭据，关闭数据库隧道。21:35 最终检查活跃任务为 0，cloud-runner 心跳约 2 秒、device-runner 约 7 秒。正式数据库沿用本机 PostgreSQL，未接入或修改 OSS。

以下“未上线/待授权”均为此前历史记录，以本节为准。

## 2026-09-19 知识库补测试与发布准备（等待临时测试库授权）

- 用户要求补测试后上线，并提供 OSS 配置评估存储位置。云端只读确认 PostgreSQL 15.18 已在 `127.0.0.1:5432` 运行，数据目录 `/var/lib/pgsql/data`，正式库约 9 MB；沿用数据库，OSS 留作附件/备份对象，不用作活动数据库或 workspace。
- 停用改为页面内二次确认，补齐组件和真实本地浏览器取消/停用/恢复草稿/重新审核 v2；85 项非数据库测试通过，前端/服务构建与类型/lint 通过。
- 创建隔离数据库及受限账号 `vibehard_knowledge_test_20260919` 被安全审核拦截，已向所有者说明范围及测试后删除计划，等待明确授权。数据库专用 3 项测试尚未实跑，未迁移、未上线、未改正式账号/密钥/服务。
- 服务器约 5.6 GB 可用内存、17 GB 可用磁盘，核查时活跃任务为 0。生产仍为工程工作流版本；Gateway/VibeBoard 未重启。VibeBoard 的既有备份任务因脚本缺失失败，不在本轮修改该服务；上线前独立备份 VibeHard。

## 2026-09-19 项目知识库本地实现（未上线）

- 用户确认第一版由项目所有者审核本项目；入口在 Agent 项目内，不增加管理员权限要求。草稿/正式版本分离、人工确认发布、停用与历史复制为草稿、审核记录已实现。
- 任务排队时捕获正式资料快照；Runner 校验后送入模型参考上下文，报告带版本/hash。资料变化时重建原生模型上下文，旧网页聊天不会自动带入。原理图模块的草稿提交 API 已提供，但真实原理图分析及自动提交尚未接上。
- 85 项测试通过，3 项独立 PostgreSQL 用例跳过；类型、lint、前端与服务构建通过。浏览器验证草稿→发布→再编辑仍保留旧正式版本；停用确认框自动化超时，该分支浏览器验收未完成。
- Docker 存储 I/O 错误阻止一次性数据库测试，数据库迁移/并发集成和真实 LLM 验收待补。未修改生产、未提交/推送本轮改动。生产仍为下文工程工作流 release。
- 使用/接入/限制/上线门槛详见 [项目知识库](project-knowledge.md)。

## 2026-09-19 工程 Agent 工作流上线与真实验收

- 新增平台自有 `cloud-project-workflow` v1：会话新建/恢复时注入工程分析、受控修改、变更报告规则；沿用原沙箱、网页审批与事件协议。
- 已发布 `20260919-engineering-workflow`，平台和云端 Runner 指向新 release；云端 unit 显式开启 `RUNNER_ENGINEERING_WORKFLOW=true`，代码默认仍关闭。工作台新增版本提示、可折叠和下载的执行证据报告。
- 无运行任务时切换，保留原 Runner 凭据、模型 Key、账号、数据库与现场设备 Runner。Gateway/VibeBoard PID 不变。候选及正式 PCB/renderer、15 个资源、五个 Demo GIF、管理员分区/API、Cookie、方案页与新工作流 bundle 验证通过；公网登录/Demo 为 200。预检 unit 已回收、3211 无监听。
- 真实验收项目“工程工作流上线验收-20260919”保留在 `ldkj@admin.com` 下，ID `5b2696cb-75d8-4aae-83f6-5624492804f4`。第一轮实际只读工程、识别加法函数写成减法，106.6 秒完成；没有声称已运行测试。第二轮恢复同一会话，经过一次文件修改审批、一次执行审批，仅将 math.c 的 `a-b` 改为 `a+b`，`make test` 退出 0 并输出 `WORKFLOW_TEST_OK`，211.3 秒完成（含人工审批等待）。
- 独立核验 README.md、test.c、Makefile 与原始 fixture 逐字一致；目录只有四个预设文件和允许的 ELF 产物 test_app。两轮都有同一技能版本/哈希与真实事件报告。Chrome 已确认新页面、SSE 事件、刷新恢复、报告展开和 Markdown 下载完成。
- 这是原生 C 验收，不是泰山派或硬件测试；未重新实测拒绝/中断分支（本地合约覆盖），未做压力或连续稳定性测试。模型中间有已批准后仍说“等待审批”的滞后文案，最终报告与工具证据一致；不能据两轮成功宣称长期稳定。
- 本地完整测试 73 项通过、2 项独立数据库用例跳过；构建、类型、lint 与技能格式校验通过。归档 SHA-256：`5bbdf70ac2e9340d20da4f587c213bcd6f251198534aada3cb6ffb6d953eb224`。发布根目录 0700 导致初次 Runner 无法读取，修正该目录为 0755 后恢复，未放宽密钥/备份权限；发布经验及回滚见部署文档。
- 实现和验证边界见 [嵌入式 Skills 接入方案](embedded-skills-integration-plan.md)。

## 2026-09-19 方案参考价与内置规则资料上线

- 平台已发布 `20260919-design-knowledge-pricing`，上一版为 `20260919-auth-cookies`；只有平台服务重启，Gateway/VibeBoard PID 保持不变，没有数据库、账号或模型配置变更。
- 方案请求加载带版本的内置基础工程规则，页面显示“已接入内置方案知识库”；该资料是供电、接口和 BOM 规则，不是团队泰山派知识库，也不包含数据手册检索或实时报价。
- BOM 自动填写人民币小批量参考单价，页面与下载文档明确是 AI 估算。模型无法合理估算时必须说明原因，不能靠强制数字校验编造价格。
- 65 项测试通过，2 项独立数据库测试跳过；类型、lint、生产构建通过。候选与正式 PCB/Demo、管理员分区/API、Cookie 双路径清理及新版方案 bundle 校验通过。
- 候选端口真实模型请求成功返回 13 条 BOM，全部具有参考价，响应包含知识版本 `2026.09.19-v1`。正式 Chrome 已确认新文案和生成中状态，但完整示例及缩短需求的两次请求都触发上游模型 90 秒超时，未取得浏览器带价表格截图；不能据候选成功宣称线上模型稳定。错误正常回显，没有回退假结果。
- 临时预检 unit 已回收为 not-found/inactive，3211 无监听。
- 归档 SHA-256：`92736a70cffa287c01a14d298c1d49a394386248c39c508148e29f9dd89c054c`。功能边界见 [方案参考价](design-reference-prices.md)。

## 2026-09-19 认证 Cookie 修复上线

- 平台已切换 `/opt/vibehard/releases/20260919-auth-cookies/standalone`，上一版为 `20260919-admin-sections`。用户明确授权修复认证并上线；没有修改账号角色、密码、数据库、Runner 或 Gateway。
- 根因复现：NextResponse 的 Cookie 集合以名称作为键；在同一响应上连续设置旧根路径删除和 `/vibehard` 新 Cookie，会丢失前一条。请求携带两个同名 Cookie 时，旧账号可能覆盖新账号。
- 登录、注册和退出统一改为分别序列化并追加独立 `Set-Cookie` 头，保留 HttpOnly、Secure、SameSite 和有效期；响应禁止缓存。
- 6 项路由级回归覆盖带/不带 basePath 的账号切换、退出、注册降为成员和错误密码。旧版 3 项失败，修复后全过；完整测试 63 项通过、2 项独立数据库测试跳过，类型、lint 和生产构建通过。初次沙箱内测试因监听端口 EPERM 失败，允许本地回环监听后完整回归通过。
- 候选 3211 与正式 3210 均通过 PCB/Demo、管理分区 bundle、管理员 overview API 和双路径 Cookie 头校验；公网 Cookie 校验通过。只重启平台，Gateway/VibeBoard PID 保持不变；临时预检服务已停止，3211 无监听。
- 真实 Chrome 原会话返回 `ldcx@demo.com / member`；上线后从网页退出，会话变为 `authenticated:false,user:null`。登录页已填 `ldkj@admin.com`，等待用户输入原密码完成实际管理员登录；不把签名管理员 API 验收当作该浏览器登录成功。
- 归档 SHA-256：`28db450ecc76f5171a75d3caebaf8e76e9552f76fd989d4424957c1841d3e4db`。回滚步骤见 `docs/deployment-ldcx.md`。

## 2026-09-19 管理台功能分区上线

- 管理页改为概览、模型设置、Runner 节点、用户管理、审计日志五个分区，一次只显示一个；窄屏导航可横向滚动，切换保留未保存模型输入。
- 仅调整呈现，认证、密码重置逻辑及后端接口不变。3 项新增组件测试通过；完整回归为 57 项通过、2 项数据库专用测试跳过；类型检查、针对性 lint 和生产构建通过。
- 正式平台已切换 `/opt/vibehard/releases/20260919-admin-sections/standalone`；无数据库迁移，只重启 `vibehard.service`。Gateway 保留 `20260918-cloud-runner`，VibeBoard、Gateway 与 nginx 未重启，相关 PID 保持不变。
- 候选端口 3211 和正式端口 3210 均通过管理台五分区 bundle、管理员 overview API、PCB 详细 renderer、15 个资源及五个 Demo GIF 校验；公网登录与 Demo 返回 200。
- 临时预检 unit 已回收为 not-found/inactive，3211 无监听。发布归档 SHA-256：`dd873a1357cd91d0f5dab553d4bd905354d863d59ebb5ac0b18cbe42155fb0d9`。
- 账号状态更新：经所有者明确确认，已将 `ldkj@admin.com` 从 member 升级为 admin 并记录审计，密码不变；`ldcx@demo.com` 保持 member。下文“等待管理员授权”为此前历史记录。

## 2026-09-19 LLM 设置上线与真实网页复测

- 正式平台已切换 `/opt/vibehard/releases/20260918-llm-settings/standalone`，应用迁移 `0003_llm_settings`，更新云端 Runner bundle；Gateway 仍使用 `20260918-cloud-runner`。VibeBoard、Gateway、nginx 未重启，Runner 凭据未轮换。
- 原方案页的 `setTimeout`、固定 ESP32 方案和假 ERC 通过已移除。`/api/design` 真实请求管理员配置的 LLM，不接知识库，带结构校验、等待心跳、取消和错误提示；结果标注未核验 AI 草案。
- 管理概览新增独立的“硬件方案生成”和“云端 Agent 对话与执行”设置：Base URL、模型、协议、加密 API Key、真实连接测试及保存。cloud-runner 按新任务读取受控运行时配置，保存无需重启。
- 发布当晚现有 provider 的直接测试和真实 Agent 任务均返回 HTTP 429，任务能正常失败退出。**9 月 19 日 09:33 起重新测试恢复响应**：管理页真实连接测试 3.5 秒成功；隔离副本完整生成温湿度方案；正式网页完成三轮 Agent 对话，第二轮和刷新后的第三轮均正确复述 `VH-0919-A`，已验证上下文和刷新恢复。
- 正式账号保留验收项目“云端对话验收-20260919”，便于用户检查真实结果；三轮任务不调用工具、不修改工程文件。本次不等于重新验收编译/烧录或长期服务 SLA。
- 09:36 正式网页方案生成成功：不联网、USB 供电的温湿度显示器返回 CH32V003/AHT20/OLED 等建议、5 条 BOM、接口和风险，而非原来固定 ESP32 结果。该结果仍明确标注未核验参数与价格。
- 54 项测试通过、2 项 PostgreSQL 专用旧测试跳过，类型检查、变更文件 lint 和生产构建通过；前端发布校验覆盖 PCB 及真实引用 bundle、15 个资源和五个 Demo GIF。
- 管理页浏览器测试使用隔离数据库副本，不提升生产账号权限。生产唯一账号 `ldcx@demo.com` 仍为 member，等待所有者明确授权提升为管理员，才能自行使用设置页。
- 测试结束已删除隔离临时登录账号、停止并回收 `vibehard-llm-ui-preflight.service`（not-found / inactive）、关闭 SSH 隧道，确认 3211 无监听。隔离数据库及 root-only 备份保留供审计。
- 部署预检曾因子进程继承 `DATABASE_URL` 优先于 `--env-file`，提前在正式库执行了新增空表的迁移；既有数据未覆盖，执行前已有备份。已修正为显式传入副本 URL，并分别核验副本和正式迁移。后续部署不可仅依赖 env-file 切库。

配置操作、安全边界及验收方法见 [LLM 设置](llm-settings.md)。以下同日更早条目均为历史记录，以本节最新实测为准。

## 2026-09-18 19:21 预检服务清理

- `vibehard-device-routing-preflight.service` 是运行于 `/run/systemd/transient` 的临时 unit，只监听 `127.0.0.1:3211`，没有 `WantedBy`、`RequiredBy` 或反向依赖。
- 已停止该 transient unit；systemd 随即将其回收为 `not-found / inactive / dead`，3211 不再监听。
- 候选发布 `/opt/vibehard/releases/20260918-device-routing` 保留，后续正式发布执行器选择页面时仍可复用。
- 清理后 `vibehard.service`、`vibehard-gateway.service`、`vibehard-runner.service` 均为 active，3210 登录页返回 200，`cloud-runner` 与 `device-runner` 心跳正常。

## 2026-09-18 19:02 生产网页复测

本次从真实浏览器和生产验收脚本重新检查当前版本，结论覆盖本页更早的同日验收记录：

- 公开首页、Demo、主题切换、登录和退出正常；未登录访问工作台会跳转登录页。
- 使用一次性账号从网页创建项目、创建 Agent 会话、连接 SSE 和中断任务均成功。普通成员访问管理页会得到“仅管理员可以查看平台管理台”。
- 浏览器提交的最小无工具任务连续四次显示 `Reconnecting... waiting for network`，未收到模型回复，随后从网页成功中断。
- 随后运行正式 `verify-cloud-production.mjs`，任务在 5 分钟内未完成并报 `Production task timed out`，因此没有进入文件写入、审批、GCC 编译、二进制运行或 ZIP 下载验证。
- 超时后 `vibehard.service`、`vibehard-gateway.service`、`vibehard-runner.service` 仍为 `active`；`cloud-runner` 和 `device-runner` 心跳新鲜，旧 `mac-local` 离线。当前故障边界位于 Runner 启动任务之后的模型网络/provider 链路，不能用节点 `online` 代替端到端可用性。
- PCB 示例生成、装配/布线视图切换和缩放正常；PNG 已生成并到达 Safari 下载许可提示，未授予浏览器持久下载权限；Gerber 按设计禁用。
- 发布自带的前端校验在服务器回环地址通过：认证保护、PCB v0.2 详细 renderer、15 个前端资源、Demo 页面和五个 GIF 均正确。服务器访问自身公网域名时连接超时，但外部 Safari 和 HTTP 请求可正常访问站点。
- 一次性测试账号、项目及两个精确 Runner 工作目录已清理。验收后生产库恢复为 1 个用户、0 个项目、0 个 thread、0 个 turn、0 个审批。

因此当前状态应表述为：**Web 平台、Gateway、Runner 心跳和 PCB/Demo 可用；云端模型执行链路当前退化，等待修复与重新验收。** 当天早些时候的完整成功验收仍是有效历史证据，但不代表 19:02 时的实时可用性。

## 2026-09-18 云端执行首次上线（历史验收）

- 正式平台、Gateway 和 `cloud-runner` 均已切换到 `/opt/vibehard/releases/20260918-cloud-runner`，systemd 状态为 active。
- 正式数据库已备份到 `/opt/vibehard/backups/20260918-before-cloud/platform.dump` 并应用迁移 `0002_lucky_daimon_hellstrom`。
- 默认执行器为 `cloud-runner`，模型为 `tokenadvent / gpt-5.6-sol`。模型 API Key 只存在于本机忽略文件和服务器 root-only 环境文件。
- 真实生产验收通过：模型回复、工作区文件生成、2 次审批、GCC 编译、二进制运行和 ZIP 下载均成功。验收项目已从业务数据库删除，生成工作区作为 root-only 发布证据归档。
- 正式数据库验收后仍为 1 个用户、0 个项目、0 个任务；没有迁移旧 Mac 项目或覆盖用户内容。
- PCB v0.2、Demo 页面与五个 GIF 通过公网回归；VibeBoard、nginx 的 PID 未改变。
- Mac mini 上的 `device-runner` 已作为 LaunchAgent 常驻，状态 online，声明 USB、串口和烧录能力。它尚未用“小电脑”实机验证。
- “新建项目选择云端／USB 设备执行器”的代码、测试和生产构建已完成，但因 macOS 钥匙串后台授权再次失效，`20260918-device-routing` 尚未发布到正式平台。

本次用户已提供独立云端模型配置中的 Base URL `https://tokenadvent.com`、模型名 `gpt-5.6-sol` 和 API Key。Key 仅保存于被 Git 忽略且权限为 600 的本地 `.env.cloud-runner`，并已通过 SSH 写入服务器 root-only 的 `/etc/vibehard/model.env`，未输出到日志或提交到 Git。

接口探测确认实际地址为 `https://tokenadvent.com/v1`，`/v1/models` 返回 200，模型列表包含 `gpt-5.6-sol`。最小 `/v1/responses` 请求到达上游，但约 61 秒后返回 429 `rate_limit_error`（上游限流）；因此仍不能把真实模型对话标记为成功。

## 2026-09-17 云端迁移准备（历史记录）

用户已授权迁移执行工具到云端，并选择**独立云端 API 配置，由用户提供**。不要迁移或复用 CC Switch / Mac Codex 的现有凭据。

已完成：

- 服务器安装固定版 Codex CLI 0.149.1、bubblewrap 0.10.0、GCC/G++、Make、CMake 和 zip。Docker 官方镜像仓库连接超时，改用系统软件源提供的原生 Linux 隔离。
- 建立非 root 账号 `vibehard-runner`，安装隔离脚本和 systemd 单元。Runner bundle 已放入 `/opt/vibehard/cloud-runner/`；服务尚未启用或启动，缺少模型配置时会由 `ConditionPathExists` 阻止启动。
- 隔离自检确认平台环境文件、Runner 凭据、root SSH 目录不可见；实际编译并执行简单原生 C 程序成功。没有验证 MCU SDK 或可烧录固件。
- 补齐“下载工程”按钮与有项目归属校验的 ZIP API，加入链接／隐藏文件过滤及大小限制。40 项测试通过；2 项原有 PostgreSQL 测试因未设置测试数据库 URL 而跳过，另做了下述服务器副本集成检查。
- 当前完整分支的生产构建成功。候选包位于 `/opt/vibehard/releases/20260917-cloud-runner/`，本地构建工作区为 `/tmp/vibehard-cloud-release.eRDpMJ`。
- 正式数据库备份在 `/opt/vibehard/backups/20260917-before-cloud/platform.dump`（root-only）。迁移 `0002` 仅应用在数据库副本 `vibehard_cloud_preflight_20260917`，没有修改正式库。
- 候选平台临时端口 `3211` 与候选 Gateway 临时端口 `8788` 完成注册、项目、模拟 Runner 命令投递／事件 ACK／完成状态、ZIP 下载检查。此检查不调用模型，不能作为真实模型验收。
- 新版 PCB、Demo 文案、五个 GIF 的前端预检通过。正式平台和 Gateway 没有切换；完成预检后临时服务停止，候选包与测试数据库保留供继续验收。

该阶段的限流随后恢复，真实模型、生成和编译验收已经成功。所有 localhost-only 临时服务已停止。当前 SSH 阻塞只影响后续设备路由页面发布，不影响已上线的云端执行链路。

后续继续：恢复 SSH 钥匙串访问，发布 `20260918-device-routing`，验证账号页面能看到两个在线执行器并创建分别绑定云端和设备节点的项目。

## 线上版本

- 主站：https://ldcx.tech/vibehard/
- PCB 示例：https://ldcx.tech/vibehard/app/pcb（需要登录）
- 宣传展示：https://ldcx.tech/vibehard/demo
- 活跃平台发布：`/opt/vibehard/releases/20260919-engineering-workflow/standalone`；云端 Runner 使用该 release 的 `services/runner.cjs`；Gateway 保留 `20260918-cloud-runner`。
- PCB v0.2 已恢复上线，包含精细绘图、装配／布线切换、图层显示、缩放和平移、PNG 下载。它是固定示例预览，并非已接通真实 EDA 自动设计；Gerber 导出仍禁用。
- Demo 保留标题下简介、下方模块说明和五段自动循环 GIF，PCB GIF 使用已裁剪版本。
- 本次平台发布包含当前完整前端、真实方案生成与 LLM 设置，云端 Runner 同步更新，已执行数据库迁移 `0003`。
- 54 项测试通过，2 项依赖独立 PostgreSQL 测试库的测试跳过；本次最新网页验收见顶部，历史编译成功不可替代新版本工具链回归。

发布目录、回滚及检查命令见 [deployment-ldcx.md](deployment-ldcx.md)。可追溯覆盖清单见 [release.json](../deploy/releases/20260916-pcb-restore/release.json)。

## 对话与执行节点

| 节点 | 当前用途 | 2026-09-18 状态 |
| --- | --- | --- |
| `cloud-runner` | 长期在线对话、代码生成、原生 C/C++ 编译、工程下载 | 9/19 正式网页三轮回复成功，包含上下文和刷新恢复；历史有 429 |
| `device-runner` | Mac mini 本地 USB、串口、烧录和实机日志 | online，尚未接入小电脑基础工程和实机 |
| `mac-local` | 旧开发 Runner | offline，不再作为默认节点 |

云端对话架构不依赖 Mac mini，上游可用性仍会波动。现有实体数据线任务使用 `device-runner`，需要设备节点、工具链和硬件准备好；泰山派跨电脑连接方案另行实施。

## Mac mini 与模型的位置

平台、数据库与默认 Runner 位于云服务器。设备 Runner 位于 Mac mini，使用 `/Users/hushaohong/vibehard/.runner-workspaces` 存放现场项目。Runner 启动 Codex CLI、运行工具并转发模型请求；Runner 不是模型推理服务。

核查时本机 Codex 配置为 `model_provider = "custom"`、`model = "gpt-5.6-sol"`，入口为 `http://127.0.0.1:15721`，监听进程为 CC Switch。这里只确认到本地代理入口，未核验其当前上游模型服务或可用性，不能据此宣称模型权重在 Mac 上运行。

正式平台已导入既有 `tokenadvent / gpt-5.6-sol` 为托管配置，模型列表中的 providerId 为 `vibehard`。云端按任务读取管理员设置；设备 Runner 不接收云端密钥，仍使用自己的配置。

## 下一步

### 四天演示目标与分工

用户确定的重点是把“小电脑”产品的已验证开发知识库迁入平台，通过对话开发 APP，再经数据线部署到真实设备；同时展示已有模块。原理图识别为重点功能，分析后须在开发者／开发文档页面展示 AI 可读文档，供后续任务使用。原理图识别、知识库迁移和该页面的整合尚未实施，不能标记为已完成。

三人分工已规划：A 负责产品知识库、基础工程和两个稳定 APP 案例；B 负责云端对话、执行链路与本地数据线部署；C 负责原理图识别、证据定位和可查看／编辑／确认／下载的开发文档。四天按基础整理、打通主线、稳定性验证、冻结彩排推进，首要验收为真实设备运行和可重复成功。

详细规划按用户要求移至桌面：`/Users/hushaohong/Desktop/最终演示四天分工规划.md`，未保留在仓库；本节保存团队目标摘要供远程协作使用。还需交接实际产品工程、原理图、已验证知识库、设备连接与部署步骤。

### 云端执行后续步骤

1. 经所有者确认后为其账号启用管理员角色；配置可用服务并继续观察 429，补做完整 Agent 工具链验收。
2. 执行器选择页面已随本次发布上线，云端项目已验证；设备项目仍需实机验证。
3. 接收“小电脑”基础工程、产品知识库、构建／烧录／日志命令，在设备 Runner 工作区中落盘。
4. 连接真实数据线，验证设备识别、编译、烧录、重启、日志回传和失败恢复。
5. 用两个固定 APP 做至少三轮全链路彩排，记录成功率和剩余人工步骤。

## 仓库整理边界

- `docs/` 保存状态、运维记录和文档索引；`deploy/releases/` 保存不含密钥的发布清单；`scripts/` 保存构建、素材处理与验收工具。
- 保留现有页面、媒体和运行时目录的位置，避免破坏引用。`.next/`、`dist/`、`node_modules/`、`.runner-workspaces/` 等已由 `.gitignore` 排除。
- SSH 私钥、钥匙串口令、环境密钥、Runner 凭据和运行日志不纳入提交。打包产物及完整发布源码归档保留在服务器发布目录，不放入 Git。
