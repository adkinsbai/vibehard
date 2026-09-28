# 任务日志

每个有意义的开发任务追加一条记录。条目保持简短，并以证据为中心。

真实任务条目从本行下方开始。

## 2026-09-28 Task: 分项评审后分别提交四项修复补丁与真实 BOM

- Review: 复核已有四项修复 `473d794` 的 Worker 有界回收、索引多批次/版本和会话撤销；发现极端索引版本号可能形成不可选择目录，限制范围并加拒绝用例。Worker 在隔离 PG 的短观察窗内允许及时失败落库或租约失效后手动重试，均须回收连接。补丁独立提交 `6f0933c`。
- BOM: 复核项目归属、已完成方案来源、模型估价标签与 CSV 公式转义；发现“页面显示旧方案、导出时读取新方案”的版本漂移，下载链接现固定 `designId`，越界/不存在的方案不能悄悄替换。功能独立提交 `c03a635`。
- Evidence: 最终常规 302 通过/16 条件跳过、隔离 PostgreSQL 14/14、类型/定向 lint、Next `/vibehard` 与服务构建通过；构建版隔离 HTTP 的 CSV 200、错方案 409、跨账号 404、旧 Cookie 401 和受保护 PCB/Demo 通过。临时 SSH 隧道和合成记录已清理；本轮无模型计费、生产部署或新提交 push。
- Scope: 只供一次性候选验收的硬编码云端清理/配置脚本不纳入 Git 提交；本地同哈希候选归档及文档证据保留，但归档早于评审修正，不可直接上线。工程导入仍暂停。

## 2026-09-28 Task: 四项修复与真实 BOM 云端候选验收

- Scope: 用户同意按“先候选、分阶段发布”执行；工程导入暂停。候选包仅上传到独立路径，不激活正式服务或改正式索引/模型配置。
- Evidence: 完整本地 301 通过/16 条条件跳过、隔离 PG 14/14、构建与服务 bundle 通过；本机/云端候选真实 HTTP 的 BOM 所有者 200、CSV 200、跨账号 404、改密旧 Cookie 401、新登录 200，PCB/Demo/18 资源通过。完整旧索引＋合成新批次本地双并发 P95 1.63 ms；云端单/双索引候选各 60 次，P95 29.0/54.6 ms、峰值 34.3/36.7 MiB，双索引来源停用即时生效且正式 PID/指针哈希不变。
- Debug: 首轮云端候选登录 500 重复复现；隔离 env 的 15432 是 Mac SSH 隧道端口，在云端被拒绝。仅派生 `/run` 候选专用 0600 env 改为云端本地 5432 后原脚本通过；无业务代码修改。见 `docs/audit-bom-candidate-20260928.md`。
- Cleanup: 四个临时 unit、3211 端口、两条 SSH 隧道、候选专用 env/辅助脚本/合成索引及云端候选归档/展开目录均清理；本地同哈希归档保留。无正式发布、生产数据库迁移、付费模型调用、设备操作、commit/push。

## 2026-09-28 Task: 暂缓工程导入并启动独立候选验收

- 用户明确“先不做导入工程”，此前仅有的未接入 ZIP 预检代码/测试已移出本轮工作树；无项目文件、Runner 工作区或生产数据被删除。
- 下一步只在隔离/候选环境核对四项修复和真实 BOM，保持分阶段发布与回滚边界；未获候选证据前不切换正式服务。

## 2026-09-28 Task: 四项修复复验、功能矩阵与真实 BOM

- Scope: 独立 `codex/audit-boundary-fixes` 工作树；不改主工作区未提交文档、生产数据库/OSS/服务或模型配置；无付费模型调用。
- Four fixes: 定向 16/16；隔离 PostgreSQL 完整套件两轮各 14/14。超时场景补测慢查询已保存失败时仍回收 Worker；跨 SSH 落库延迟场景明确区分即时失败与租约失效后手动重试，均核对退出后连接清理。
- Acceptance: `docs/platform-feature-acceptance-matrix.md` 逐模块列真实输入、执行、持久结果、失败提示与下一门槛；本地证据不冒充生产验收。
- BOM: 项目归属校验读取最新已完成方案中的真实 BOM，页面不再展示静态库存/模拟下单；CSV 实际下载且防电子表格公式注入，价格明示为模型估算。隔离数据库跨用户与结果查询断言通过。
- Import: ZIP 预检只生成哈希和安全文件清单，不解包、不上传、不写 Runner 工作区；压缩 5 MiB、展开 20 MiB/500 文件及路径/链接/密钥限制。知识批量入库仍使用已存在的管理员 CLI 流程，未新增数据批次或网页导入。
- Evidence: 本轮完整本地 Vitest 312 通过、16 条依赖外部环境的条件跳过；类型/定向 ESLint、生产构建与 `git diff --check` 通过。四项隔离 PG 条件项另跑两轮，不计入本地跳过。工程导入和网页批量入库闭环未完成；设备烧录/调试留下一阶段。

## 2026-09-27 Task: 修复四项审计缺陷并重复验收

- Scope: 用户确认修复并测试；独立 `codex/audit-boundary-fixes`，原主工作区文档不动；无生产发布或付费模型调用。
- Changes: 90 秒预算内预留有界失败记录，Worker 连接级 SQL/锁超时和退出清理；追加多索引集合、分离原件批次和 build 版本、保留回滚历史；登录 Cookie 凭据 HMAC 绑定，改密后 API/私有知识页面拒绝旧会话。
- Evidence: 最终两轮各 296 常规 + 14 隔离 PG + 2 原生 KiCad 条件用例（312 去重 TS），另 27 Python；类型/lint（仅既有图片提示）、生产和服务构建通过。本地两次 PCB/Demo 18 资源回归通过，完整旧索引 122 查询/894 引用保持；与新批次联检两轮 P95 约 1.6 ms，停用/版本/容量/回滚检查通过。
- Debug: 真 pg_sleep 暴露客户端 end(timeout) 不等于取消服务器 SQL，增加 Worker 专属服务端超时后重复行锁/慢查询/退出连接检查通过。测试 Cookie 读取方式及短注入预算问题均明确修正重跑，不延长生产 90 秒预算。
- Boundary: 未验证生产资源限制或真实模型，本地性能不当作线上验收；无 DB schema 迁移，但未来发布将要求旧 Cookie 重新登录一次。索引新旧程序/指针须配套回滚。详见 `docs/audit-boundary-fixes.md`。

## 2026-09-27 Task: 全仓两轮代码检查与隔离 Debug

- Baseline: `a32263e` 与 GitHub 默认分支 `9fc6ec5` 的代码树一致；主工作区原五项未提交文档未动。
- Evidence: 两轮常规测试各 288 通过，条件跳过的 11 项 PG 与 2 项原生 KiCad 均各补跑两遍；每轮 301 个 TS 用例、27 个 Python 用例，类型、lint（1 性能提示）、服务/网页构建、108 脚本语法和本地 PCB/Demo HTTP 资源检查通过。
- Findings: Worker 超时后失败写入仍可无限等待（真实隔离 PG 行锁两次复现）；新索引批次替换旧语料；同批次 v2 登记 EEXIST；密码重置不撤销旧会话。四项均未修复，详见 `docs/code-audit-20260927.md`。
- Boundary: 只诊断，不改业务代码或生产服务，不发收费模型请求，不 commit/push；仅测试库合成记录和临时本地环境。

## 2026-09-27 Task: 分阶段交付收尾

- 第三阶段代码 `e6c0b2e`、PR #6 已合并，归档 ba7d08ae…a872 验证后预检/备份/激活 `20260927-controlled-ingestion-v1`。只更新检索 unit 和发布管理 CLI；其余六项服务/容器 PID 保持，legacy 原索引 SHA 不变。
- 候选 P95 4.9 ms/140.3 MiB，正式 P95 34.5 ms/41.3 MiB；各 60 次双并发通过。管理员状态读取、member 拒绝、nobody socket 拒绝，公网 PCB/Demo/18 资源及 Runner 心跳/连接通过。停止候选和 SSH 隧道，保存失败证据/备份。
- 离线处理收尾增加损坏压缩包发现失败记录、流程开始先清除成功标识；7 项 Python 回归通过，不影响已发布 Node 服务，无需重启。主工作区仍为 a4abcaa 及原五项未提交文档，未覆盖。

## 2026-09-27 Task: 统一检索正式核验与受控批次候选

- PR #5 及 `20260927-unified-retrieval-v1` 已上线，公网 Agent 工具/方案/EDA 三入口实际调用通过，引用服务端回查和跨账号拒绝通过；21.717 秒方案任务保留供审查。验收脚本 403/404 断言修正与打包启动失败均单独记录，未伪称模型故障，未重复运行已成功 Agent 回合。
- 在独立 `codex/controlled-ingestion` 分支实现参数化离线处理、不可变清单、逐来源审核/失败状态、v2 索引包、管理员登记/60 请求评估/激活失败恢复/旧版回滚/来源停用。保留 legacy 内容，不新增原件或正文。
- TypeScript、定向 ESLint、288 项常规测试、6 项 Python 流程测试和服务构建通过；全套中的 13 项 DB 例跳过，本阶段未改 DB，上一阶段独立 PG 11 项通过。第三阶段候选/生产切换另行记录。原主工作区未提交文档不变。

## 2026-09-27 Task: 整合基线并实现方案阶段诊断（实施中）

- Scope: 用户批准完整分阶段计划。基线经 PR #3 合并；新增六阶段持久诊断、增量 schema、管理员诊断权限及用户进度，90 秒上限和手动重试不变。
- Evidence: 基线 257 测试通过；诊断实现首轮 273 通过/13 独立 DB 跳过，类型及生产构建通过；原 PostgreSQL 11 用例通过。新断言和专用模型数据库验收继续执行。
- Boundary: 首轮模型验收遭遇集成测试共用队列，已停止并保留证据，不能计为 12 次通过。专用验收库与受限进程已建立。尚未发布或修改生产 schema，未改模型、凭据、账号角色和受保护服务。

## 2026-09-27 Task: 发布板卡关联 RAG worker 并验收

- Scope: 新建 `20260927-rag-board-links-v1` worker-only release，仅切换方案 worker unit；旧 unit root-only 备份。平台、Runner、Gateway、VibeBoard、EDA manager、nginx、原索引、OSS、数据库结构、账号角色和模型设置均不改。
- Evidence: 归档 SHA256 `5420c17004b1165bf4eaf387672c1abb217c0758b1540faede167562a62c30dd`；云端 384 MB/50% 限制下 122 查询 P95 219.9 ms、RSS 91.4 MiB，894 条引用核验。匿名 401、跨用户明细/下载 404、列表隔离、所有者 200，索引非专用组不可读。首次方案模型 90 秒超时，第二次 `deepseek-v4-pro` 实际生成 8 行 BOM、2 条可回查引用；公网 HTTPS 与 Markdown 复验通过。正式 worker PID 946291、0 重启；其他受保护服务 PID 不变。
- Boundary: 两次合成任务保留。一次成功不足以证明长期稳定；4 款缺可检索原理图正文、资料自动审核未人工技术复核。未 commit/push；生产回滚仅恢复保存的 worker unit，详见 `docs/deployment-ldcx.md`。

## 2026-09-26 Task: 完善 ESP32-S3 RAG 索引关联（本地）

- Scope: 先写 `docs/oss-rag-index-refinement-task.md` 固定边界；只读审计本机已批准 SQLite 与处理清单，修复检索逻辑、生成经 SHA/别名核验的服务端板卡关联快照及回归脚本。原件、OSS、生产数据库/服务、Runner 均未修改。
- Evidence: 61 款板卡、1,229 个关联、401/402 份去重正文；5 条 UI 已排除路径不再作为错误型号引用，正确 Touch 版仍可命中，唯一无关联错误变体也从通用检索中排除。122 次本地检索 118 命中/4 个缺原理图正文、894 条引用回查通过，两次 P95 约 54–90 ms/RSS 约 98–153 MiB。257 项测试通过/13 DB 跳过，类型、lint、服务打包通过。
- Boundary: 仅本地代码和证据，不是线上 RAG 更新或真实模型端到端验收。上线前需独立版本包、实际生产索引匹配、权限/负载/引用测试。

## 2026-09-26 Task: 板卡规格新版知识库页面上线

- Release: 版本 `20260926-board-spec-v2`，归档 SHA256 `b3cd6303cbe41d1a9816e23ae0639e2617fe06035f34bca19ec1be17fc61c855`。前序 976 个源码文件均覆盖，运行时仅改 6 个既有文件并增 3 个服务端只读证据/映射文件。v1 候选因漏设构建 basePath 导致 `/vibehard/login` 为 404，未激活；v2 构建与包校验固定该参数。
- Verification: 本地 253 测试通过、13 独立 DB 用例跳过，类型/lint/生产构建通过；回环候选、正式回环及公网均通过知识库角色/数据/静态包隐私与 Demo/PCB 资源校验。生产显示 61 款、762 条对应型号资源；设计 worker 等受保护服务 PID 与环境哈希不变。候选 unit inactive、3211 关闭，旧平台 unit root-only 备份可回滚。
- Boundary: 未改 OSS、数据库、RAG 索引或实物硬件。页面标签来自厂商资料，不等于全部电气参数及上板测试；5 条 UI 排除文件仍可能在现有 RAG 索引中，后续检索关联清理为单独任务。

## 2026-09-26 Task: 板卡原件全量核对与型号关联复查

- Scope: 先写 `docs/board-spec-release-task.md` 明确允许文件和发布门槛；原件只读核验，不操作 OSS、生产数据库或活跃服务。
- Evidence: `scripts/audit-board-resource-files.py` 读取 767 条页面候选引用的本机原件，767/767 文件存在、大小和 SHA-256 与 OSS 批次证据一致；573 PDF、173 ZIP、18 7z、3 RAR，PDF/ZIP 元数据错误 0。19 条硬件文件名与板卡型号不直观匹配。已视觉检查 LCD-1.9、LCD-2.8C、Touch-LCD-1.54 及 4G 系列的原理图第一页；LCD-1.9 确实是触摸版电路，4G V2 图中为 A7670，Touch-LCD-1.54 为共用板设计。详见 `docs/board-resource-audit-2026-09-26.json`。
- Boundary: `scripts/draft-board-spec-review.mjs` 的 61 板卡、315 条特性关键词命中仅作候选；后续复核产生 351 个展示标签。此条记录是阶段性发现，最终发布状态以下方新版任务记录为准。

## 2026-09-26 Task: 板卡规格逐项核对与页面关联修正

- Evidence: 61 款官方型号页/系列页、767 个本地原件 SHA-256/大小、旧标签逐项去向校验。来源摘要生成 315 条候选，人工按 SKU/版本筛查与补充精确 Touch SKU 来源后，服务端快照输出 351 个展示特性；5 条 Touch 版原理图不再误归无触摸/其他变体。页面为 61 款、762 条对应型号目录引用，568/88/106 状态分流。具体结论见 `docs/board-spec-release-task.md` 和 `docs/board-catalog-ui.md`。
- Scope: 仅 UI 与服务端只读目录快照，未修改原件、OSS、RAG 索引、生产数据库、角色或 Runner。文案明确官方资料核验不等于实物测试；尚待完整本地回归和生产发布预检。

## 2026-09-26 Task: 板卡硬件规格逐项核验发布闸门

- Request: 用户要求确认新版目录没有硬件规格漏项之后再发布云端。
- Evidence: 逐款找到 61 款拟展示型号的厂商页面（60 款直接型号页、1 款系列页）；抽查本地 ePaper-13.3E6 三页原理图与 LCD-2 一页原理图。确认 TF 卡槽漏标、基础 LCD-1.9 误标触摸、LCD-2/2.8 资料与分类/变体冲突、ePaper-13.3E6 厂商页面内部存储规格冲突；28 款带非硬件的软件标签。逐板来源矩阵见 `docs/board-spec-verification-2026-09-26.html`。
- Decision: 规格/变体/原理图尚未全部交叉核对，无法确认“没有漏掉”，发布闸门未通过。本轮没有构建或切换生产页面；只读 SSH 确认平台/设计 worker 仍在 `20260926-esp32-fts-v1` 且 active。自动盘点脚本不作为人工核验结论。

## 2026-09-26 Task: 板卡目录与真实 OSS 原件及索引关联

- Request: 用户要求网页知识库只显示有真实证据的数据，关联原有板卡目录与已上传资料和 RAG 索引。
- Changes: 加入只读证据生成器及服务端快照，在角色校验后筛掉无路径、损坏和隔离记录；UI 分别标明直接入索引、压缩包部分入索引、仅有原件，并保留 SHA256/相对路径供管理员和开发者核对。来源目录特性不冒充已验证板卡规格。
- Evidence: 原始 808 个带路径引用全部匹配私有原件清单；有效展示 61 款/767 引用，573/88/106 分流。生成器核对原始/处理清单及实际 FTS 文件和 402 份已索引文档片段数；253 测试通过/13 独立 DB 用例跳过，类型、定向 lint、生产构建、静态 JS 不泄漏及重建字节比较通过。
- Boundary: 仅本地代码/文档，不改生产、OSS 对象、数据库、权限规则或 Agent worker；网页仍不提供私有原件下载。当前证据是批次快照，不是实时 OSS 可用性或硬件参数正确性保证。

## 2026-09-25 Task: ESP32-S3 资料包原件私有 OSS 归档

- Request: 用户要求把附件大量资料先处理并存入既有 OSS。范围为原件盘点、去重、验证和私有对象上传；未请求将全部资料直接发布为可检索知识。
- Intake: 资料包 801 个可处理路径、11,579,857,863 字节；流式 SHA256 去重后 286 个对象、8,012,192,016 字节。149 份不重复 PDF 经 `pdfinfo` 可读取、共 12,237 页；134 份压缩包只检查目录，3 份 ZIP 目录损坏，标为隔离。未解压运行示例代码，未把隐藏/密钥文件当作独立上传对象。
- OSS: 只读核验 Store Dataset Bucket 为北京地域、私有 ACL；批次 `6cf96eea-af45-4e7d-96c0-c99afbe8c192` 的 286 个去重对象按 `knowledge/raw/v1/` 私有上传，逐一 HEAD 核对大小和 SHA256 元数据。私有映射清单 SHA256 `6d3a879a57d64c373db1883be618cbb8a0574241fd73b6b2c75cf78829734207`；首件、最大压缩包、PDF、隔离 ZIP 和清单回读哈希吻合。凭据只从用户已有本机文档读入进程内存，未写进仓库/对象/日志。
- Boundary: 无生产 DB、服务、账号、模型或网页修改；这批资料没有 OCR、切分、审核和 RAG 索引，不会被当前方案生成引用。私有对象清单及后续步骤见 `docs/oss-knowledge-import.md`。未 commit/push。

## 2026-09-25 Task: 正式发布首批 RAG 与方案 worker

- Authorization: 用户明确要求生产迁移、worker 发布、正式知识正文导入和真实带来源方案验收。范围限新增 `0005`/`0006`、方案与知识路径，不改 Runner/Gateway/VibeBoard、角色或模型密钥。
- Release: 基于线上 819 文件哈希清单构建 `20260925-board-rag-v3`，归档 SHA256 `280158926ce97bb331d22aba072ba6365c86ffad9c538ecfc43bc6a02a1e427d`；预迁移 dump SHA256 `f15f159d3b6fd51c9227b4f615bff10d385c41c5193874f81b8641a9e3f1c23a`。v2 因继承旧泰山派校验脚本自动恢复旧版，v3 使用正式脚本通过回归。
- Import: 固定 9 文件干跑再次确认 95 条及批次哈希，管理员归属的事务导入写入正式库 95/95 已发布，审计 `manualReview:false`。未复制原始 PDF/MD、未操作 OSS。
- Evidence: 隔离真实 DeepSeek 方案成功；隔离数据库 7 项方案 + 4 项知识测试通过，候选/公网 PCB、Demo、认证、目录权限、泰山派、模型发现回归通过。正式公网任务 `3780b4de-fe12-455d-ab15-74ee1f34e0dd` 在项目 `aa0e51b7-3c8e-465a-a34c-e9b9b1489ad6` 完成，8 条 BOM、5 条 RV1106 来源逐项与发布版本吻合，Markdown 下载包含引用。
- Incident: 初次 worker 203/EXEC 重启循环已立即停止；其 Node 路径指向 root 私有目录。将同哈希 Node 22.23.1 复制到 `/opt/vibehard/runtime/` 并仅改 worker unit，PID 899646 稳定完成真实任务。已同步修正本地 unit 模板与部署稳定性检查；v3 不可变源码仍有旧 unit 模板，不应直接重装。没有 commit/push。
- Limits: 一次真实生成不证明长期稳定、资料正确或硬件可用；首批为有界关键词检索，不是 8 GB OSS 原件上传或向量检索。回滚只恢复平台/停 worker，不自动回退新增表和导入数据。

## 2026-09-25 Task: RV1106 / RV1126B 首批 RAG 链路准备

- Request: 用户允许这批资料暂不人工审核，要求直接处理并接入方案生成检索链路。
- Changes: 新增 allowlist 导入器与逐页 PDF 文字提取、稳定 ID/哈希/凭据扫描、干跑及受控事务写入模式；单一导入文件的检索引用上限为 2，方案与 UI 将“已审核”改成准确的“已发布”。普通网页审核权限未修改。
- Evidence: 9 个源文件干跑为 95 条，RV1106 与 RV1126B 样例均有资料命中；全量 171 常规测试通过、11 DB 专项跳过，TypeScript、ESLint、Next 构建通过。Docker PostgreSQL 镜像仍有 I/O 错误，本次未完成数据库实写、真实 LLM 或浏览器端验收。
- Boundary: 未运行 `--apply`、未写生产/测试 DB、未上传 OSS、未部署。用户的上线范围选择通过非阻塞问题单独确认；上线前必须完成隔离 DB/迁移/worker/备份及真实模型验收。

## 2026-09-25 Task: RV1106 / RV1126B 知识资料候选初筛

- Request: 只读阅读两个本地文件夹，列出可加入知识库审核候选的文件。
- Evidence: 读取根 README/RESOURCES、docs 章节与候选文件列表，检查主要 PDF 的格式/页数；两个目录约 1.3 GB/16 GB，总计约 7451 个普通文件（含非候选产物）。报告中的 37 个本地链接全部验证存在。
- Output: `docs/chip-resource-local-candidates.html` 按硬件、软件、烧录/量产分组，区分首批与按需，标注脱敏、型号匹配、授权和验证状态。
- Boundary: 没有复制或上传原件、访问 OSS、写数据库或建立索引；不是全部 PDF 的逐页审校。附件目录内的 AGENTS/README 等仅作为资料，不作为本项目执行指令。

## 2026-09-25 Task: 确认首阶段使用现有 Store Dataset Bucket

- Request: 用户决定先复用已有 Bucket，后续可新建专用 Bucket 再迁移。
- Changes: 将 Store Dataset Bucket 固定为首阶段目标，新增不含 Bucket 名/用户文件名的 `knowledgeRawObjectKey()` 与验证用例；文档定义资料 ID、哈希、对象 Key 稳定和迁移时复制/回读校验/切换/回滚的边界。
- Boundary: 这只是本地设计与代码准备；未读取或使用 OSS 长期凭据，未配置 RAM/CORS，未写入 Bucket、建索引或部署。真实迁移机制和上传链路尚未实现。

## 2026-09-25 Task: 8 GB 知识资料的 OSS 上传与检索准备

- Request: 用户准备后续提供约 8 GB 资料，要求预备 OSS 上传和检索并询问是否需重发 OSS 信息。本轮只做本地准备，不操作现有 Bucket、长期密钥、生产数据库或服务。
- Changes: 新增只读资料盘点 CLI、文件类型分流和有界文本切分原语；OSS 配置检查只列缺项不输出值；写明直传、隔离解析、审核、索引、成本和权限的分阶段方案。
- Evidence: 167 项常规测试通过、11 项数据库专用测试跳过；TypeScript、修改文件 ESLint、Next.js 生产构建及 `git diff --check` 通过。对 `docs/` 做只读 CLI 试跑，18 份文本文件被分类，无上传或建索引；配置检查仅报告 4 个待配置字段。现有 `OSS-Access.md` 可用作非敏感配置核对，但没有足够证据认定短期 STS 角色已配置。
- Boundary: 未上传、未获取或使用长期凭据、未部署，未把当前 6000 字/200 份小型资料库误称为 8 GB 检索系统。此时尚待负责人选择 Bucket；后续已选择现有 Store Dataset Bucket，仍需最小权限 RAM Role ARN/CORS 后才能实现并验收实际直传。

## 2026-09-25 Task: 将 Laya 部署整理到项目根目录

- Request: 用户要求在项目内新建名为 `laya` 的文件夹并将部署内容放在其中。
- Changes: 将部署脚本/说明和原 `out/laya` 运行文件迁至 `laya/` 及 `laya/.runtime/`；更新路径、Git 忽略、LaunchAgent 配置与文档。未触碰 `out/` 中其他文件。
- Validation: Python 编译及文档 diff 检查通过；迁移后后台 `/health` 返回多语言/MPS，中文支持/冲突/未知三态样例 3/3；10 次短请求中位数 38.0 ms。未更改平台业务或云端服务。

## 2026-09-25 Task: 部署 Laya 本地推理服务

- Authorization: 用户要求部署，并由 Agent 比较本机/云端选址。只读核查云端 2 核/7.4 GiB、本机 M4/16 GB 后选择本机 MPS。
- Changes: `laya/` 独立服务/锁文件/调用与验证/LaunchAgent 安装脚本/说明，`laya/.runtime/` 忽略目录中的环境、固定模型、私有 key 和日志；安装当前用户 `tech.ldcx.laya` LaunchAgent。未改平台业务、数据库、Runner/Gateway 或云服务。
- Evidence: 官方权重 revision/哈希已记录；真实离线 MPS 推理，支持/冲突/信息不足 3/3，401/413/422 与回环监听检查通过，后台预热 10 请求中位数 32.3 ms；调用脚本通过。
- Limits: 合成短样例不代表硬件选型准确率，尚未接 RAG/云端，Mac 休眠或注销时不可用。未 commit/push；详细结果 `laya/.runtime/verification.json` 与 `laya/README.md`。

## 2026-09-25 Task: 评估 Laya 对器件选型及 RAG 的价值

- Scope: 阅读上游文档、基准、推理源码、模型卡及本地知识/方案实现；仅补评估文档及索引/任务状态。
- Finding: 建议用于召回后的证据预筛/排序，配合参数卡与硬约束规则；不作为整机可行性裁决，不假定直接加速关键词检索。
- Evidence: `docs/laya-evaluation.md` 保留来源、接入点、三态判断与对照实验，区分本地实现和最近生产发布范围。
- Validation: 文档 diff 检查；未运行模型/性能/硬件测试，未修改运行时代码或操作生产、数据库、部署。

## 2026-09-25 Task: 知识库正文与方案生成检索

- Request/approval: 用户同意把已审核知识用于方案 RAG、页面展示来源/无匹配；明确只本地实现和测试。高风险数据库与权限范围仅用于本地代码和迁移文件，未改生产。
- Changes: 新增平台正文审核表/API/UI 与 `0006`，复用项目已审核版本；后台方案任务有界检索、项目归属校验、服务端来源记录及页面/Markdown 展示。原板卡目录仍只是线索，不被伪装成已接入正文。
- Evidence: 163 常规测试通过、11 DB 跳过；类型/修改文件 ESLint/Next 生产构建通过。新增纯检索、伪造引用和数据库隔离测试；数据库专项未实跑，Docker PostgreSQL 镜像读取 I/O 错误。未做真实模型/浏览器完整流程。
- Delivery: 本地未 commit/push/迁移/部署。生产仍为 `20260922-taishan-integration`；上线需连同 `0005`、`0006`、独立 worker 经备份与隔离 PG 验证。详见 `docs/knowledge-rag.md`。

## 2026-09-22 Task: 融合泰山派入口并发布云端

- Authorization: 用户要求把昨日合并的泰山派开发系统融合进已有网页并上线。范围为认证页面、桌面/移动导航与帮助；不统一账号/项目数据，不迁移数据库，不修改 Runner/Gateway/VibeBoard/nginx。
- Release: `20260922-taishan-integration`，基于完整 `20260922-homepage` 生产源码只叠加 4 个运行时文件；设计后台任务/0005 未夹带。归档 SHA256 `62ea10a404a784953e30ac55bdc2764adb5439daafe0d92f90b9a7c6f21b855e`。
- Evidence: 151 passed/3 DB skipped，类型/针对性 lint/生产构建通过；候选/正式全套保护与公网泰山派 HTML/RSC、匿名重定向、桌面/移动入口、VibeBoard 200 和 iframe 响应头通过。浏览器工具三次连接超时，不作视觉点击结论。
- Result: 21:45 正式平台 PID 834514；Runner/Gateway/VibeBoard/nginx PID 758750/727637/807921/501913 不变，无数据/账号/角色/模型/Key 变更。临时调试与候选单元回收、3211 关闭；未 commit/push。

## 2026-09-22 Task: 放大开放提示并发布首页

- Authorization: 用户要求上线且加强开放信息。首屏改高对比公告卡、20/24px 粗体主文案，导航与 CTA 加强；保留当前邀请码内测说明。
- Release: `20260922-homepage`，当前生产 manifest 验证 803 个源文件后独立构建，仅覆盖 7 个首页运行时文件；部署/打包/公开只读验收脚本新增。无本地未上线业务夹带。
- Evidence: 148 passed/3 DB skipped；类型/构建/首页 lint 通过；桌面/320px 公告视觉通过（20px 无溢出）。候选/正式全套保护及公网首页、知识权限、PCB/Demo 通过；生产浏览器超时，不作点击通过结论。
- Result: 09:38 正式平台 active PID 823384，其他服务 PID/配置不变，无数据库/模型调用；预检已停止、3211 回收，旧 unit 可回滚。未 commit/push。

## 2026-09-22 Task: 未登录官网功能与注册预告更新

- Scope: 首页路由、首页组件、仅首页使用的 Footer、测试/文档；不改注册规则、已登录业务、私有目录、Demo、部署或数据库。
- Changes: 左右分栏首屏与明确标注的工作流示意、四项能力摘要、六类功能卡、人工确认流程、开放注册预告/FAQ；移除旧模板数量宣传和暗示公开注册的 CTA，保留已有邀请码入口。同步首页 metadata，修复 320px 换行和 sticky 受 overflow 限制。
- Validation: 全量 157 passed/10 旧 DB skipped；类型/ESLint/生产构建成功。桌面和 390/320px 浏览器检查、FAQ 鼠标/键盘、锚点/固定导航、注册页、Demo 往返通过，无末轮控制台 error。仅本机匿名预览，没有真实 DB、模型调用或账号写入。
- Delivery: 本地 3212 预览留给用户查看；未 commit/push/上线，生产仍为 knowledge-library。后续首页发布需与本地未上线业务隔离。

## 2026-09-21 Task: 知识库 UI 云端发布

- Scope: 用户明确「上线」；从当前线上完整源码独立构建，只叠加 12 个知识库运行时文件，不发布本地后台方案迁移或泰山派入口。
- Validation: 发布构建 145 测试通过/3 DB 跳过、类型/构建通过；候选与正式全套保护、公网知识库角色 HTML/RSC/伪造拒绝/跳转/静态数据隔离、PCB/Demo/18 资产通过。实际线上 admin/member 验证，developer 为本地覆盖。生产浏览器连接超时，未做点击验收。
- Delivery: 22:28 核查 `20260921-knowledge-library` active、平台 PID 813457；只重启平台，其他服务 PID/配置不变，无业务或账号写入，无模型请求；预检已回收，旧 unit 可回滚，未 commit/push。目录不是原始资料上传或正式 Agent 知识。
- Preflight notes: 首次脚本 RSC 缺少 `?_rsc` 标记引发标准 307，修正后重打包；旧临时失败 unit reset 后重跑通过，正式服务只在全套通过后切换。旧候选包保留为 `20260921-knowledge-library-preflight-v1`，未激活。

## 2026-09-21 Task: 知识库统一分类与简化状态展示

- Goal: 统一命名为「知识库」，按项目研发场景分六类，取消「待补充」状态标注。
- Changes: `/app/knowledge`、旧地址重定向、分类索引/组件、资料搜索与分页详情、现有板卡页文案简化、导航/帮助/测试/文档；权限实现、数据存储、原始目录、Agent 与生产均未改变。
- Validation: 154 常规测试通过、10 DB 旧测试跳过；类型/lint/生产构建通过；临时内存角色 HTTP HTML/RSC 与重定向通过；开发者浏览器六类导航、搜索/详情、手机390px、空分类与无错误控制台通过。
- Result: 本地完成，未 commit/push/上线；取消标签不等于资料已上传/审核，未新增真实下载或 Agent 知识。

## 2026-09-21 Task: 管理员/开发者专属板卡知识库 UI

- Goal: 按用户两张截图集成板卡目录，先做 UI，后续补资料；仅 admin/developer 访问。
- Changes: 新页面与服务端逐请求最新角色检查、规范化服务器端目录 JSON、卡片/筛选/详情/对比/看板/帮助、侧栏及手机入口、测试及交接文档；无数据库/现有认证/审核/Agent/部署改动。
- Validation: 148 常规测试通过（新增 20 专项 + 1 通用帮助），10 DB 旧测试跳过；类型/lint/生产构建通过；公开脚本目录样本检查、临时内存账号 HTML/RSC 权限隔离、真实浏览器搜索/弹窗/看板/390px 手机布局通过。
- Result: 本地完成，未 commit/push/上线；没有文件上传、下载、知识审核或 Agent 注入。测试仅用临时回环服务及内存账号，不连接生产。
- Next: 用户验收 UI 后再按范围发布；收到真实资料后另做私有存储、审核和受权下载，不把当前目录误当正式知识。

## 2026-09-21 Task: 拉取 GitHub 并整合本地成果

- Request/scope: 用户授权拉取远端并整合信息；保护未提交成果、merge 保留双方历史、补齐兼容并测试。本轮不 push、不上线、不改数据库/认证/Runner/硬件。
- Git: 本地原有 54fa2ca 和未提交成果保留，100 文件快照为 a972b99；fetch GitHub 至 bc8b57a（泰山派入口及 PR 合并），侧边栏自动合并，没有文本冲突或丢弃历史。
- Compatibility: 发现远端新页缺少本地必需的 PageHeader.helpKey，补齐 taishan 帮助与独立账号/iframe边界说明，加入页面测试。
- Validation: 127 常规测试通过，10 数据库用例本轮跳过；Next.js 生产构建、类型和针对性 ESLint 通过。未验收目标平台真实登录、模型或设备功能。
- Handoff: 更新 current-status、PROJECT_STATUS 和整合说明，准备保留 merge commit；线上仍为 module-help，方案后台任务及泰山派入口仍待发布。

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
## 2026-09-26 Task: 云端 KiCad 多账号隔离发布与真实模型验收

- Goal: 让每个账号使用自己的 KiCad 工程和文件系统，多个账号可同时编辑各自工程；同工程多个窗口可重连。通过公网在真实服务上验证 Agent → 原生文件 → KiCad。
- Implementation: 非 root KiCad 9.0.8 worker、每工程独立 Docker 容器和持久卷、私有 manager、一次性票据及同源 nginx WebSocket 路由；平台归属鉴权和原生文件 API。固定单机容量 3 工程、每账号 2 工程。正式平台先发布 `20260925-eda-isolated-v2`，后以 `20260926-eda-grid-v1` 修复原生符号 1.27 mm 连接网格偏移。
- Evidence: 三账号/三 worker 并发、跨账号 404/403、票据重放 401、三个同工程窗口 RFB、manager 重启与文件哈希恢复、真实 ERC/DRC/ZIP 通过；公网 HTTPS 和普通账号复测。正式设计模型返回 6 条有效命令，3 器件/3 网络原生文件；修复前 ERC 3 个 off-grid，修复后同一提案 KiCad ERC 0；PCB 无走线，DRC 仍 3 个未连接且一致性 0。候选首版遗漏 `/vibehard` 构建参数，未切换；重建后候选与公网均 200。测试账号和卷已清理。
- Validation: 网格修复后 EDA 定向 65 通过、2 跳过（包含导出/再导入坐标回归），Python 20 通过；TypeScript 和带 basePath 的生产构建通过。此前全仓为 237 通过、2 个既有 Windows `EPERM` 失败、13 跳过，不称全绿。没有人工登录浏览器拖动/保存或长期稳定性验收。
- Boundary: 未实现 Agent 就地修改原生工程、PCB 自动布线、广泛器件/立创/PDF/复杂多页导入、硬配额/排队扩容及制造验证。完整记录见 `docs/eda-cloud-acceptance-2026-09-26.md`。

## 2026-09-25 Task: 明确云端 KiCad 账号与工程隔离方案

- Goal: 按用户澄清的真实场景设计每个账号独立使用自己的 KiCad 工程，删除多人共同编辑同一工程的假设。
- Result: 形成按 `(账号 ID, 工程 ID)` 隔离的云端运行实例、工程卷、票据网关及重连/资源回收设计；同一账号的同一工程多标签页连接同一桌面。
- Evidence: `docs/superpowers/specs/2026-09-25-cloud-kicad-isolation-design.md`；对照现有单账号 broker、生产禁用适配器和静态 WebSocket 重写。
- Boundary: 本次仅为设计文档，未修改认证、租户隔离、部署代码或生产环境，云端多用户尚未验收。

## 2026-09-25 Task: 原生 EDA 工作台逐项验收及检查修复

- Goal: 验证 Agent 基础任务、已保存 KiCad 输入文件、ERC/DRC 的真实有效性，并划清测试夹具与 AI 生成边界。
- Finding: 三项 Agent 基础任务均因本机未配置设计模型返回 503；当前工程原生文件真实存在，ERC 报 10 项；原默认 DRC 0 遗漏 3 项原理图/PCB 不一致；KiCad 10 库源数据使 KiCad 9 无法加载测试导出文件。
- Implementation: 受控 7 类器件改用桌面 KiCad 9 官方库；补齐工程库表；原生/旧版 DRC 都启用原理图一致性检查；页面区分问题数量与检查边界。
- Validation: 浏览器 ERC 10、DRC 一致性 3；隔离的三器件测试工程 ERC/DRC 0、故意改错 PCB 后 DRC 2；EDA 定向 63 项通过、Python 9 项、TypeScript、ESLint、生产构建和源文件哈希检查通过。全仓 126 通过、2 个既有 Windows 符号链接权限 `EPERM` 失败、2 跳过。
- Boundary: 测试工程不是 Agent 生成；原生工作台制造包、模型闭环和完整器件/导入覆盖未完成，未发布生产。详见 `docs/eda-acceptance-2026-09-25.md`。

## 2026-09-25 Task: 在 KiCad 工作台加入原理图 Agent 对话

- Goal: 用户在 `/eda` 直接和 Agent 对话，审阅电路修改，再打开可编辑的原生 KiCad 工程。
- Implementation: 右侧对话面板、设计模型状态与设置入口、逐条命令预览、确认后从受控电路草稿新建原生工程；只读读取已保存原理图和 KiCad CLI 网表，保存期间变化则拒绝快照。
- Validation: EDA 60 项通过、2 项跳过；Python broker 7 项通过；TypeScript、定向 ESLint、生产构建通过。浏览器确认面板、模型禁用状态、已保存 `4xxx:4001` 的明确拒绝及 KiCad 重连；当前设计模型未配置，真实 AI 生成未验收。
- Boundary: 不覆盖现有 KiCad 工程，不支持 `4xxx:4001` 等库外器件、复杂单页结构和原生就地应用；本机分支未发布生产。详见 `docs/eda-desktop.md`。

## 2026-09-25 Task: KiCad / noVNC 原生网页编辑

- Goal: 根据用户明确选择，用 noVNC 将实际 KiCad 原理图/PCB 编辑器接入现有平台。
- Implementation: 本机 Linux 桌面 broker、项目权限 API、单次票据、原生持久化/ZIP/检查、主工作台和旧版入口；WSL 依赖、独立本地数据库、启动与验收脚本。
- Validation: 浏览器放置和修改 470R 电阻、0603 封装，下载核对、真实 ERC 5/DRC 0、RFB 与认证、源文件哈希不变、服务重启恢复。EDA 56 项通过；新增边界后相关 9 项通过；Python 5 项、定向 lint/构建通过。
- Boundary: 未修改生产或 Runner。只支持可信本机单账号，不是托管多租户；Agent 原生编辑与生产制造包迁移尚未完成。见 `docs/eda-desktop.md`。

## 2026-09-24 Task: 真实网页 EDA 工作台

- Goal: Agent 与用户共同编辑可交付的原理图和 PCB，用户明确要求不提供示例代替实现。
- Implementation: 原子电路编辑内核、真实官方 KiCad 库、空白画布、PCB 精确焊盘布线、保存冲突保护、Agent 校验提案、原生导入/导出及实际 CLI 检查/生产文件生成。
- Validation: 48 项 EDA 测试含真实 KiCad；全仓 111 passed / 2 existing EPERM failed / 2 database skipped；构建通过。实际 HTTP 导入、保存、冲突、ERC/DRC、19 项 ZIP；桌面编辑/撤销/刷新及移动布局检查。
- Boundary: 未部署；无本地模型配置，未完成真实 AI 端到端。任意库、复杂原生结构、立创/PDF、高级 PCB 与真机仍未完成。长期任务因账户用量限制受限。
- Evidence: `docs/eda-workbench.md`，`docs/superpowers/plans/2026-09-24-web-eda-workbench.md`。
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
## 2026-09-25 Task: 云端隔离 RAG 入库与真实模型验收门禁

- Scope: 按用户确认先用云端隔离库测试，合格才生产迁移及发布；无生产写入。
- Validation: 创建两个固定名称、独立账号的测试库，迁移成功；方案数据库 7 项、知识/归属数据库 4 项通过；9 个文件提取 95 条入隔离库，二次导入全跳过，审计标记未人工审核。只读确认生产方案模型元数据为 `tokenadvent.com/v1 / gpt-5.6-sol / Responses API`。
- Gate: 真实模型请求将发送板卡笔记和手册的检索片段至外部服务商，安全审核要求对具体资料与服务商明确授权。未发模型请求，未执行生产备份/迁移/导入或 worker/网页发布；不能宣布上线。
- Cleanup: 临时云端模型验收 bundle 已删除，SSH 隧道关闭；两个隔离库及 root-only 凭据暂留，待继续验收后按精确标记清理。

## 2026-09-25 Task: 管理台从服务商发现并选择模型

- Scope: 本地模型设置界面、管理员专属模型列表接口、服务商响应解析、回归测试与交接文档；不改认证/角色规则、数据库、Runner 协议或生产模型设置。
- Changes: 服务器对已校验的 HTTPS API 根地址请求 `GET /models`，复用已保存 Key 或用表单新 Key；DNS 固定/私网拒绝、超时/响应体上限、限流和无缓存。前端搜索/选择模型，保留手动输入兜底；选择不自动保存，保存后刷新下方 Agent Profile。
- Validation: 全量 178 项通过，11 项隔离数据库用例跳过；TypeScript、针对性 ESLint、生产构建通过。沙盒初次禁止本机回环监听导致 4 项 Gateway 超时，放行回环后通过。未使用生产 Key 或真实服务商请求。
- Result: 本地完成，未提交/推送/上线；模型列表不等于模型对指定协议、Agent 工具调用或配额已验证。

## 2026-09-25 Task: 将管理员模型发现功能发布到云端

- Scope: 只切换 VibeHard 平台服务；不发布本地 RAG/方案 worker、数据库迁移、其他服务或模型配置更改。
- Release: 从原正式 `20260922-taishan-integration` 复制并哈希校验 814 个源码文件，仅叠加 6 个运行时文件与 3 个测试文件，构建 `20260925-llm-model-discovery-v2`。首次候选包带旧泰山派验证脚本而预检失败，从未激活；v2 改用现行正式发布目录的脚本重新打包。
- Validation: 隔离正式源码 158 项测试通过、3 DB 跳过，类型/lint/Next 构建通过；v2 候选与正式 3210 全套 PCB/Demo/认证/管理/知识/泰山派回归通过。公网 design 与 agent 配置各真实列出 2 个模型；管理员准入、普通用户拒绝、换 URL 要新 Key、按钮 bundle 都通过。公网 PCB renderer 与 18 资产/5 GIF 回归通过。未运行完整 Agent 工具流程或 RAG 方案生成。
- Production: 仅 `vibehard.service` 切到新 release，PID 894091；部署脚本核对模型配置指纹与运行环境/其他服务 PID 未变。3211 候选已停，归档 SHA256 `3596b27e9ba65cf247ff38f85054ce9e71bf078ae8216c86d454fe5e4662197b`，旧 unit 在 release 的 root-only `backup/` 中。未 commit/push。
## 2026-09-28 Task: 工作台真实数据、CI 及分阶段发布

- Goal: 按平台优化顺序先确保项目入口显示真实持久记录，补自动化检查并独立发布；保留项目工程导入暂缓和设备/知识服务边界。
- Changes: 默认分支 PR #13/#14/#15；项目首页改读所属项目与方案任务，新增 GitHub CI；数据库行锁测试超时仅放宽单个测试用例。独立知识 CLI v2 打包并上线，不激活新索引。
- Validation: PR #15 Verify 全绿；合并提交 `2280836` 的 `/vibehard` 构建和完整源码清单通过。工作台候选、正式回环与公网 PCB/Demo/BOM/匿名权限通过，切换前备份；受保护服务 PID、Runner 新鲜心跳与 Gateway 活连接复核。正式平台 `20260928-project-dashboard-v1`，未迁移数据库或改模型/OSS。
- Limits: 生产浏览器登录态项目/BOM 点击、新付费方案和 RV1126B USB 本轮未复测；服务器约 4.8 GB 空余，8 GB 原件禁止云端本地处理。详见 `docs/release-project-dashboard-20260928.md`。

# 2026-09-27 统一检索候选

- 在独立 `codex/unified-knowledge` 工作树实现方案/Agent/EDA 服务端权限与引用入口、私有 socket Worker、旧 Runner 降级和语料版本上下文重置。
- 全仓 282 测试、类型检查及隔离 PostgreSQL 11 项通过；云端真实工具回合/负载/发布待验证。仅第一阶段可靠性通过门槛后才按序发布，不修改主工作区未提交文档。

## 2026-09-28 Task: BOM 公开价格快照

- Scope: 本地方案 BOM、项目 BOM/CSV 的价格展示；不变更数据库、生产服务、模型配置或物料采购流程。
- Changes: 对 5 个完整精确型号录入带供应商料号、URL、核查日期、币种及 1+ 档的公开网页报价快照；缺货的 ESP32-S3 模组仅供参考。模糊候选型号继续使用模型估算，不以近似型号的商品价冒充实价。
- Validation: BOM 与方案定向测试、TypeScript、定向 lint、Next 生产构建通过；全仓 305 项通过、16 项条件跳过（无隔离数据库环境）。
- Result: 本地候选，未提交、推送或上线。报价并非实时且未含税费、运费或汇率换算，采购前需重新询价。

## 2026-09-28 Task: 整理现状、提交推送并分阶段上线

- Scope: 评审合并四项审计修复、真实 BOM/公开价格快照，按审计修复 → BOM 两阶段发布；不改数据库结构、模型/Key、OSS、Runner 或设备。
- GitHub: PR #9（业务）、#10（发布闸门）、#11（相对 URL 验收修正）均已合并默认分支。构建源分别为 `6f0933c` 与 `dbde731`，发布脚本与文档单独提交。
- Validation: 305 测试通过/16 条件跳过、TypeScript、定向 lint、两个 `/vibehard` 构建通过；两个不可变候选均通过 PCB/Demo、资源和匿名权限预检，正式回环与公网再验。BOM v1 脚本预检失败且未激活；v2 修正并完整重跑。零活跃任务、两份可回查数据库/旧 unit 备份、配置/PID/索引指针保护均已检查。
- Deployment: 平台 `20260928-bom-pricing-v2`；设计 Worker/检索 `20260928-audit-fixes-v1`。Runner/Gateway/VibeBoard/EDA manager 未重启；Cloud Runner 心跳 13 秒，设备 Runner 7 秒。3211 候选已停。详情与归档哈希、回滚见 `docs/release-audit-bom-20260928.md`。
- Limits: 未在本轮上线后使用真实用户会话点开 BOM/CSV，也未调用付费模型；Mac 锁屏导致浏览器验收不可用。旧报价非实时采购价；自动知识仍非工程师验证。下一步由项目所有者登录后验证真实已完成项目 BOM/CSV，再抽样检查新方案与引用。
