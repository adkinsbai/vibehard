# 当前状态与交接

最新更新：2026-09-27，北京时间。以下核查结果分别标注时间，不代表持续监控。

## 2026-09-27 17:18 三阶段已发布

- 平台/方案 Worker/云端 Runner 已切换 `20260927-unified-retrieval-v1`（PR #5），只读私有索引独立 Unix socket 服务生效。方案、Agent、EDA 使用同一服务端权限/引用入口，Agent 索引版本变化重建上下文；索引故障显示部分不可用。
- 正式公网合成验收：Agent 已执行一次只读工具并完成回合，附两条自动索引引用；方案任务 `6e0f693e-c136-438d-9e0c-4e7f9d545137` 21.717 秒完成，引用逐项回查文件哈希/页/片段；EDA 生成 renameDocument 提案并带两条引用，未应用到用户工程。跨用户 Agent 返回 403，方案/下载/伪造 EDA 项目返回 404。初版验收脚本错把既有 Agent 403 写成 404，修正后复用原回合继续，没有重复付费 Agent 请求；一次重新打包缺依赖启动失败也未发起模型请求。
- 生产回环/公网 PCB、Demo、权限与前端静态资源保护通过；云端 Runner 新鲜心跳、真实工具回合和 Gateway 活连接已核对。模型配置/密钥/Runner 凭据不变，Gateway/VibeBoard/nginx 未重启。保留合成验收记录及独立库失败诊断，不将短期通过写成长期可用性保证。
- 第三阶段 `20260927-controlled-ingestion-v1` 已只切换独立检索服务，并发布管理员 CLI；平台/方案 Worker/Runner 仍为第二阶段版本，其他服务 PID 不变。PR #6 已合并。候选 60 次双并发 P95 4.9 ms、峰值 140.3 MiB；正式 60 次 P95 34.5 ms、峰值 41.3 MiB，均在 384 MiB/50% CPU 限制内。真实管理员可读状态、普通用户 CLI 拒绝，nobody 无法连接 socket；公网 PCB/Demo/鉴权/18 静态资源、Runner 新鲜心跳与连接复核通过。
- 当前控制指针仍指向原 legacy 索引，索引哈希/OSS 原件/95 条已发布文本不变；未新增批次正文。管理员后续可登记、评估、激活、回滚、停用来源，不等于已开放网页上传。各阶段备份和回滚入口见 deployment-ldcx.md。候选进程与本轮 SSH 测试隧道已停止，合成验收记录及失败诊断保留。
- 本地最终服务回归 288 项、类型/定向 lint/服务构建通过；Python 流程回归 7 项（含断点续跑、不可变清单、损坏压缩包失败状态与中断清除完成标识）。13 项 DB 用例在常规套件中跳过，前两阶段另跑隔离 PG 11 项通过。本轮没有声称新增资料的硬件规格已验证。使用步骤见 [管理员受控入库](controlled-knowledge-ingestion.md)。

## 2026-09-27 16:35 方案可靠性第一阶段已上线

- 平台与方案 Worker 均已切换至 `20260927-design-reliability-v1`；GitHub PR #3 合并 EDA 基线、PR #4 合并第一阶段可靠性。增量迁移 `0007_design_diagnostics` 已应用；旧任务无诊断仍可读。六阶段耗时、模型版本、脱敏错误及管理员诊断页已生效，保持 90 秒硬期限与手动重试。
- 专用隔离库中初次 12 请求仅 7 次成功，诊断定位为模型正文阶段超时；低推理强度/4096 token 候选 11 次成功、一次上游未完成；最终 low/8192 token 候选 12/12 通过并逐引用核对哈希/页/片段。该策略只用于官方 DeepSeek 指定模型的方案草稿，不修改模型设置/API Key/Agent 策略。此小样本通过不是长期 SLA。
- 候选、正式回环和公网 PCB/Demo/鉴权检查通过。Runner/Gateway/VibeBoard/EDA manager/nginx PID 和敏感配置哈希未变，Runner 新鲜心跳与连接已核对。备份、归档 SHA 与回滚脚本在该 release；新增诊断列在回滚时保留。
- 第二阶段统一检索仍为候选：本地 283 项通过、隔离 PostgreSQL 11 项通过；真实当前模型完整只读工具回合 5.7 秒通过。受限 Unix socket 检索 60 次双并发 P95 4.3 ms、cgroup 内存峰值约 40 MiB（限额 384 MiB/50% CPU）；未授权 nobody 无法连接。须完成第二阶段候选及正式切换验证后才可称三入口统一上线。

## 2026-09-27 板卡关联 RAG 方案 worker 已上线

- 正式 worker 为 `/opt/vibehard/releases/20260927-rag-board-links-v1/services/design-worker.cjs`，平台仍是 `20260926-board-spec-v2`。只切换 `vibehard-design-worker.service`，它保留动态用户、专用索引组、384 MB 内存和 50% CPU 限制；Runner/Gateway/VibeBoard/EDA manager/平台 PID 未变。原 SQLite SHA256 `cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9`、OSS 原件和数据库结构未变。旧 worker unit 备份于新 release 的 `backup/`，归档 SHA256 `5420c17004b1165bf4eaf387672c1abb217c0758b1540faede167562a62c30dd`。
- 云端在同等专用组/384 MB/50% 限制下只读查询 61 款板卡×2 意图：122 次、118 次命中、4 款如实缺原理图正文，894 条引用与已核验别名、SHA 和索引页码/片段一致；P95 219.9 ms，RSS 91.4 MiB。索引目录 0750、文件 0640，非专用组 `nobody` 不可读。生产 API：匿名明细 401，跨用户明细和下载 404、列表不含该任务，所有者 200。
- 候选首次完整方案任务 `dcaf534a-1bca-4610-b9dc-f801d3260cc1` 运行 92.7 秒并在 90 秒模型截止时间超时；独立短模型请求 1.3 秒成功。第二次真实方案任务 `99f43e71-90b5-42e9-9298-8bbdec425b50` 运行 57.2 秒后成功，`deepseek-v4-pro` 产出 8 行 BOM，服务器保存 2 条自动入库引用，含目标板原理图；引用的型号别名/文件 SHA/页码/片段及 Markdown 经正式公网 HTTPS 再次回查。两个合成任务保留；前一次失败说明模型延迟仍不稳定，不能由一次成功推断持续可用。候选已停，正式 worker PID 946291、重启次数 0；公网登录 200。详情与回滚见 [部署记录](deployment-ldcx.md)。

## 2026-09-26 RAG 板卡索引关联本地完成记录（已由 9/27 发布覆盖）

- 新增经原件 SHA/处理清单别名核验的服务端板卡—正文映射，61 款板卡、1,229 个关联、覆盖 401/402 份去重正文；错误归属的 5 条图纸引用被阻断，正确 Touch 版可按自身别名引用。原 SQLite 20,582 片段和 OSS 原件均未改。
- 本地 122 组检索 118 组命中、4 组缺该板卡可用原理图正文；894 条返回引用与映射路径及索引页码/文件 SHA 对上，预热 P95 约 54–90 ms、RSS 约 98–153 MiB；257 测试通过、13 DB 跳过，类型/lint/服务打包通过。具体范围与缺口见 [RAG 索引完善任务](oss-rag-index-refinement-task.md)。
- 当时生产 worker 仍是旧检索版本；该状态已由上方 9/27 生产发布记录覆盖。

## 2026-09-26 板卡知识库新版页面已上线

- 正式平台已切换到 `/opt/vibehard/releases/20260926-board-spec-v2/standalone`，原正式 `20260926-esp32-fts-v1` 保留可回滚；设计 worker 继续运行原 release，Runner/Gateway/VibeBoard/EDA manager/nginx 未变。新版受限知识库按 61 款官方型号页核对当前展示的 351 项板级特性，排除 5 条误归其他 Touch 变体的原理图，页面展示 762 条对应型号原件引用（568 直接索引、88 部分索引、106 仅原件）。这仅是资料核验，不是所有电气参数/实物上板验证；既有 RAG 索引未因此改写。
- 本地 253 项测试通过、13 项独立 DB 用例跳过，TypeScript/ESLint/生产 `/vibehard` 构建通过。候选 3211、正式 3210、公网 HTTPS 的 `verify-frontend-release.mjs` 与 `verify-knowledge-library.mjs` 均通过：Demo 五个 GIF/PCB 详细渲染、61 款/762 条统计、管理员可读、普通用户/伪造角色拒绝和公开 bundle 无目录数据泄漏。正式 unit active，候选 unit inactive/3211 关闭；受保护服务 PID 与配置哈希不变。完整清单/回滚见 [部署记录](deployment-ldcx.md)。
- 第一个 `20260926-board-spec-v1` 候选因本机构建遗漏 `NEXT_PUBLIC_BASE_PATH=/vibehard`，回环预检发现 `/vibehard/login` 为 404，**从未激活**。v2 明确校验构建内 basePath，并重新完整预检后上线。两份候选归档均保留供审计。v2 归档 SHA256 `b3cd6303cbe41d1a9816e23ae0639e2617fe06035f34bca19ec1be17fc61c855`。

## 2026-09-26 板卡硬件规格核验早期记录（已由上方结论覆盖）

- 用户要求逐项确认硬件规格且无漏项后再发布新版知识库页面。已对拟展示的 61 款板卡定位厂商官方资料页（60 款直接型号页，1 款 N8R8 位于 NXRX 型号系列页）；另外 2 款无可用原件证据，仍不拟展示。逐板来源矩阵见 [规格来源核验报告](board-spec-verification-2026-09-26.html)。定位页面不等于完成板级规格核验。
- 确认旧特性集合有漏项与错误：例如 `ESP32-S3-Touch-AMOLED-1.43` 的官方页明确列 TF 卡槽，但目录未标；`ESP32-S3-LCD-1.9` 基础 SKU 无触摸，旧目录却标“电容触摸”；28 款拟展示板卡混入“小智 AI”或“MicroPython”等软件标签。目录中部分非触摸板卡资料指向触摸版原理图，如 `ESP32-S3-LCD-2`。厂商 `ESP32-S3-ePaper-13.3E6` 页面自身模块/存储规格冲突，本地原理图更支持 WROOM-2-N32R16V，需要按版本建立可靠记录。
- 进一步逐条读取本机原件并与已核对 OSS 批次证据比较：767/767 个引用存在且大小与 SHA-256 完全一致（573 PDF、173 ZIP、18 7z、3 RAR；PDF/ZIP 元数据读取错误 0）。但硬件资料中 19 个文件名需判定具体型号/版本；可确认 `LCD-1.9` 文件为触摸版电路，不宜直接作为基础款原理图。`Touch-LCD-1.54` 官方称两 SKU 除屏幕触摸外相同，基础板原理图可作共用设计来源。逐条结果见 `docs/board-resource-audit-2026-09-26.json`，自动候选线索见 `docs/board-spec-review-draft-2026-09-26.json`，均不是规格放行结论。
- 此阶段未放行。后续对 61 款当前 UI 展示特性和旧标签完成逐项处理，并按上方记录发布；自动来源盘点脚本仍只是审查线索，不自动判定硬件真值。

## 2026-09-26 板卡目录原件/索引关联早期记录（已由上方结论覆盖）

- 将现有 ESP32-S3 板卡目录与已校验的私有 OSS 原件批次、自动处理清单及实际 FTS 索引逐条核对，生成不含 Bucket/Object Key/凭据的服务端证据快照。管理/开发者页面拟只展示 61 款有原件证据的板卡、767 条资料目录；其中 573 条有直接索引正文、88 条压缩包内部分文档入索引、106 条仅有原件。268 条无路径、35 条仅有隔离正文及 6 条损坏 ZIP 引用不展示。型号、分类有来源路径；目录特性尚未技术复核，不宣称板卡规格获证实。
- 253 项常规测试通过、13 项独立数据库测试跳过；这条是首次本地证据关联的阶段记录。最终页面按官方型号资料再筛掉 5 条错误归属，并已按上方记录上线。详见 [知识库 UI](board-catalog-ui.md)。

## 2026-09-26 ESP32-S3 私有索引接入方案 RAG 并上线

- 已拉取并合并 GitHub PR #2（EDA 工作台）到隔离分支 `codex/eda-rag-integration`，合并提交 `9851878`；新检索接入提交 `4158831`。正式平台与方案 worker 现使用 `20260926-esp32-fts-v1`，保留已上线 EDA 网格修复、PCB/Demo、95 条 RV1106/RV1126B 平台已发布正文及原有项目知识。无数据库迁移、模型/Key/账号角色变更，也没有改 Runner/Gateway/VibeBoard/EDA manager/nginx。
- 9/26 私有 OSS 处理清单哈希 `3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1` 对应的 20,582 片段 FTS5 索引，校验后只将约 102 MiB 的只读索引安装到云主机 `/opt/vibehard/knowledge/20260926-esp32-s3-v1/`；8 GB 原件仍在私有 OSS，不在云服务器或 PostgreSQL。索引文件 SHA256 `cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9`，root:专用组 0640、目录 0750，普通系统用户不可读。只有串行方案 worker 持专用组读取，无公网检索/原件下载接口；用户须先通过现有登录与项目归属校验才能发起方案任务。
- 受限检索每次最多 12 个词、24 个候选、12 个源、同文件 2 段，最终仍受 5 条引用/3200 字上下文限制；索引启动校验私有清单标识、大小、哈希和行数，SQLite 只读且 `query_only`。自动入库资料在页面、提示词和 Markdown 中明确标为“未人工复核”，不冒充正式人工已发布知识。原有 RV/项目资料仍走已发布库；索引不是向量检索。
- 验收：本地 249 项通过、13 项独立数据库用例跳过；类型、lint、Next 生产构建和服务打包通过。云端专用组/内存/CPU 限制下 90 次查询预热 P95 74 ms、独立进程 RSS 约 70 MiB；候选 worker 真实调用现有模型完成一条 ESP32-S3 合成任务，BOM 8 项、4 条服务端引用均可按页码/片段/文件 SHA 回查索引正文，Markdown 同步带引用。匿名 401、跨用户明细 404、跨用户列表空、所有者 200；正式公网重新读取该任务，4 条引用再次回查通过。PCB/Demo、知识目录、管理台、首页、泰山派和 EDA 入口回归通过。当前一次验收不证明长期模型稳定、OCR 图表理解或资料技术正确性。
- 版本包 SHA256 `159e68f4f6a7125b71d147ad1400e16834006ccd9aa90ff362acbfee0ab72b47`，976 个源码文件指纹见 `RELEASE.json`。切换前两个 unit 已备份在新 release 的 `backup/`；正式平台/worker 启动稳定，其他受保护服务 PID 与环境文件哈希未变；候选服务 `not-found/inactive`、3211 已关闭。合成验收任务与项目保留供管理员检查，回滚见 [部署记录](deployment-ldcx.md)。本次尚未 push GitHub；原主工作树有其他未提交文档改动，未覆盖。

## 2026-09-26 云端 KiCad / noVNC 上线

- 平台当前 release `20260926-eda-grid-v1`，入口 [KiCad 工作台](https://ldcx.tech/vibehard/eda)。每账号每工程独立 worker 与持久卷；同工程多个窗口重连同一桌面。跨账号拒绝、票据重放、三账号并发、manager 重启恢复和公网 RFB 均通过验收。
- 真实设计模型生成了基础 LED 电路的 6 条有效命令；网格修复后原生 KiCad ERC 0，PCB 未布线 DRC 3 项。此结果只证明这份基础电路的生成/文件/检查链路，不证明自动 PCB 布线或硬件功能。
- 单机当前最多 3 个运行工程、每账号最多 2 个；没有自动扩容。详见 [云端 EDA 验收](eda-cloud-acceptance-2026-09-26.md)。

## 2026-09-26 ESP32-S3 资料本机 OCR/切分/自动审核及 OSS 索引候选

- 先提交本地既有平台/知识库工作区检查点 `c2cca66`（未 push）；常规测试 180 通过/11 跳过，TypeScript 与 Next 生产构建通过。随后只在本机对 9/25 已私有上传的原件批次做批量处理，没有更改生产代码、数据库、worker 或网页。
- 从 149 份直放 PDF、540 份 ZIP 内 PDF、13 份 RAR/7z 内 PDF 及 366 份筛选出的板级文本，处理 1068 个来源位置、PDF 30,837 页。237 页低文字层已尝试本机 Vision OCR，202 页采用 OCR 结果；按内容哈希合并后 439 份不同正文。自动规则审核、无工程师人工审核：402 份允许作为索引候选，37 份因低质量/疑似凭据等隔离；有效页 14,727、片段 20,582。
- 私有 OSS `knowledge/processed/v1/` 已保存正文页、切片、SQLite FTS5 trigram 检索工件及审核清单，3 组中文/型号检索抽查命中，所有工件和清单完成 HEAD 与全量回读 SHA256 校验。处理清单 SHA256 `3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1`，定位与规则边界见 `docs/oss-knowledge-import.md`。3 份损坏 ZIP、代码/二进制和未选中的依赖文档未进入索引。
- **这不是生产 RAG 发布**。正式 PostgreSQL 仍有 95 条 RV1106/RV1126B 已发布知识，首版 `shared_knowledge` 上限 200；网页方案 Agent 尚不会引用本批 ESP32-S3 索引。后续需要独立检索服务/权限与负载验收，再接方案 worker 并上线。自动审核只对基本质量/敏感模式把关，不验证电气事实或 OCR 图表阅读顺序。

## 2026-09-25 ESP32-S3 资料包私有原件已入 OSS

- 用户提供的本地资料包有 801 个可处理文件路径、11,579,857,863 字节；SHA256 去重为 286 个 OSS 对象、8,012,192,016 字节，重复路径 515 条。现有 Store Dataset Bucket 经只读检查为北京地域、私有 ACL；对象按随机批次 `6cf96eea-af45-4e7d-96c0-c99afbe8c192` 存在独立 `knowledge/raw/v1/` 前缀，均显式私有。286/286 对象逐个核对大小与 SHA256 元数据，首件、最大压缩包、PDF、隔离 ZIP 和私有清单抽样回读哈希匹配。
- 149 份去重 PDF 可读取；134 份去重压缩包只保留原件和目录检查结果，3 份损坏 ZIP 标记隔离、不得自动索引。完整相对路径、来源链接、类别、内容哈希和对象键映射在私有 OSS 批次清单，Key/SHA256 见 `docs/oss-knowledge-import.md`。原件未进入平台 PostgreSQL、Agent workspace 或云服务器本地磁盘；没有改网页/worker/模型/Runner/Gateway/VibeBoard。
- 在 9/25 时点仅归档原件；其后的 9/26 一次性本机解析、OCR、自动审核与私有 OSS 索引候选见上节。既有 RV1106/RV1126B 95 条已发布正文和方案检索不受影响；这批 ESP32-S3 资料尚不会被方案生成引用。网页 STS 直传、持续解析队列与生产检索容量规划仍待实现。

## 2026-09-25 22:02 首批知识检索与持久化方案已上线

- 正式平台为 `/opt/vibehard/releases/20260925-board-rag-v3/standalone`，`vibehard-design-worker.service` 独立串行运行。正式 PostgreSQL 在自定义格式备份后增量迁移 `0005_design_jobs`、`0006_shared_knowledge`；既有账号、项目、模型配置与 Runner/Gateway/VibeBoard 未改。版本归档 SHA256 `280158926ce97bb331d22aba072ba6365c86ffad9c538ecfc43bc6a02a1e427d`，备份及回滚见 `docs/deployment-ldcx.md`。
- RV1106/RV1126B 固定 9 个本地源文件按批次哈希 `7373380e3214781ed7967b29f27ad087de875290d7a782c1b861bc11998abb84` 导入正式 `shared_knowledge` 为 95 条已发布正文，审计标记为用户授权直接导入、未逐份人工审核。原始 PDF/MD 未上传至云主机或 OSS；8 GB 上传、OCR 与向量索引仍未实现。当前检索为有界关键词片段，不是向量 RAG。
- 正式公网通过同一方案 API 创建验收项目 `aa0e51b7-3c8e-465a-a34c-e9b9b1489ad6`、任务 `3780b4de-fe12-455d-ab15-74ee1f34e0dd`。后台用已配置的 `deepseek-v4-pro` 完成 RV1106/GC1084 方案，BOM 8 项，命中 5 条 RV1106 平台来源；服务端保存的来源 ID、版本、哈希、路径与正式库发布版本 5/5 一致，Markdown 下载也含引用。验收任务保留供管理员查看；一次成功不证明长期模型稳定或硬件参数正确。
- 隔离发布构建 TypeScript/Next/服务打包通过，175 项常规测试通过、11 项 DB 用例在无 DB 环境跳过；云端隔离 DB 另跑 7 项方案与 4 项知识测试全部通过，隔离真实模型先行成功。公网知识目录权限、模型设置、PCB/Demo、泰山派等回归通过。第一次未激活的 v2 候选校验脚本过时，自动回滚；v3 成功切换后发现 worker 的 `/usr/local/bin/node` 指向 root 私有目录，停掉重启循环并将受限 worker 单元改用校验过的 `/opt/vibehard/runtime/node-v22.23.1`，随后真实任务成功且 PID 保持稳定。源码模板已同步修正；v3 发布包内旧模板不能直接重装 worker，运维须使用当前单元或修正后的模板。

## 2026-09-25 18:19 管理员模型发现已上线

- 正式平台切换到 `/opt/vibehard/releases/20260925-llm-model-discovery-v2/standalone`（PID 894091）。管理台两栏均可用已保存 Key 或表单新 Key 请求服务商 `GET /models`，搜索/选择返回的模型 ID；获取不保存，仍须“测试连接”与“保存配置”。保存 Agent 配置会刷新下方 Profile 列表；不支持列表的服务商仍可手动填写。
- 基于原正式 `20260922-taishan-integration` 的 814 个哈希校验文件构建，只叠加 6 个运行时文件与 3 个测试文件；隔离基线 158 项测试通过、3 项 DB 专项跳过，类型/lint/生产构建通过。候选、切换后 3210 与公网的模型列表/权限验证通过：design 和 agent 配置各返回 2 个可选模型，普通用户拒绝，换地址不输新 Key 拒绝；列表不证明 Agent 流式工具调用已通过。公网 PCB/18 资源/5 GIF、Demo、泰山派、知识库、管理页和认证回归通过。
- 仅 `vibehard.service` 重启；Runner/Gateway/VibeBoard/nginx PID 与配置文件哈希保持不变，数据库没有迁移或模型配置写入，生产 Key 没有回传浏览器或被更换。候选服务已停止、3211 空闲。首次候选 `20260925-llm-model-discovery` 因发布包沿用过时泰山派验证脚本而停在预检，从未激活；v2 使用原正式发布目录的修正版脚本后完整通过。归档 SHA256 `3596b27e9ba65cf247ff38f85054ce9e71bf078ae8216c86d454fe5e4662197b`；回滚命令与证据见 `docs/deployment-ldcx.md`。没有对生产浏览器做人工点击，也没有运行完整 Agent 工具任务或 RAG 方案闭环；本轮未 commit/push。

## 2026-09-25 管理员模型发现与选择（本地实现时点；上线见上）

- 管理台模型设置新增“获取模型列表”：管理员填 HTTPS API 根地址与新 Key，或对当前地址沿用已存 Key，由服务端限时、限流请求该地址的 `GET /models`；列表可搜索/选择 ID，服务商不提供标准列表时保留手动输入。模型发现不保存或激活配置，仍需单独测试连接并保存；更换地址必须重输 Key。
- 只允许管理员访问，沿用原有凭据加密/SSRF 防护；不把 Key 或服务商原始错误正文回传浏览器。保存 Agent 模型后管理页的 Profile 列表自动刷新；模型列表本身不证明 Responses/工具调用兼容。
- 178 项测试通过、11 项隔离数据库用例跳过；TypeScript、针对性 ESLint、Next.js 生产构建通过。首次全量测试因沙盒禁止本机监听导致 4 项 Gateway 超时，允许回环监听后全量通过。没有读取用户生产 Key、调用真实服务商、修改线上模型配置或部署。上一节模型元数据只是当时的只读快照，当前值以管理页为准。

## 2026-09-25 云端隔离 RAG 库已验证，真实模型与生产发布暂停

- 云端新建互不共享凭据的 `vibehard_design_test`、`vibehard_rag_test`；在隔离库完成 `0005`/`0006` 及此前迁移，7 项方案数据库测试和 4 项知识/归属数据库测试通过。首批 9 个文件、95 条来源哈希固定的知识仅进入隔离 RAG 库，均可检索；重复导入 95 条全部跳过。没有复制生产数据或修改正式服务。
- 当前方案模型元数据为 `tokenadvent.com/v1`、`gpt-5.6-sol`、Responses API。真实验收会把板卡资料片段发给第三方；安全审核要求用户对这批资料外发明确确认，故没有运行真实请求，也没有迁移/导入生产库、发布 worker/网页或改模型配置。临时验收程序已从云主机删除，测试库和 root-only 凭据暂留，SSH 隧道关闭。详见 `docs/board-knowledge-rag-proof.md`。

## 2026-09-25 RV1106 / RV1126B 首批 RAG 资料干跑（本地，未上线）

- 用户授权该首批资料暂不做逐份人工审核。受限 CLI 从 9 个明确源文件提取正文，按页/段切成 95 条，带源文件 SHA256 与稳定 ID；两条板卡检索样例命中，单一源最多占 2 条引用。既有网页审核规则未降权，直接导入需管理员/开发者身份、目标库确认和批次哈希，审计标记未人工审核。
- 目前只读干跑、**没有写入任何数据库/OSS，也未部署**。本机 Docker PG 镜像 I/O 错误，数据库专项用例未实跑；`0005`/`0006` 与独立 worker 仍未上线，不能称网页已调用这批知识。171 项非 DB 测试、类型/lint/构建通过，11 DB 用例跳过。详见 `docs/board-knowledge-rag-proof.md`。

## 2026-09-25 8 GB 资料 OSS 导入准备（本地，未上线）

- 新增只读本地盘点/可选流式哈希去重、文件类型分流和有界文本切分；OSS 配置检查仅列缺项，不读旧密钥文档或访问 Bucket。方案拟用私有 OSS 存原件、PostgreSQL 存状态/权限、独立受限处理器解析并建立索引、审核后检索。
- 用户已选现有 Store Dataset Bucket 作为首阶段目标；原件 Key 与 Bucket 名分离，为以后复制校验并迁到独立 Bucket 留出空间。尚无网页分片上传、STS 角色颁发、真实 OSS 写入、PDF/OCR 处理或 8 GB 索引；现有小型知识库上限不能承载整批资料。仍需核验 Bucket 私有性/地域及最小权限角色/CORS，再在隔离环境实施与验收。详见 `docs/oss-knowledge-import.md`。
- 本地 167 项常规测试、类型/ESLint/Next.js 构建通过，11 项旧 DB 专项跳过；对 `docs/` 做只读试跑并核对 18 份文本，无 OSS/生产连接或资料写入。

## 2026-09-25 知识库正文与方案检索本地实现，未上线

- `/app/knowledge` 六类目录旁新增管理员/开发者可提交、审核、发布和停用的 Markdown/文本正文；板卡目录仍只是路径线索，不参与检索。新表 `shared_knowledge` 与迁移 `0006` 尚未应用到云端。
- 尚未上线的持久化方案 worker 现在从平台已发布正文与本项目已发布正文进行有界关键词片段检索；结果保存服务器生成的参考来源/版本/哈希，无命中及旧方案均有明确说明。不允许模型伪造引用，不跨项目读取草稿或私有资料。
- 本地 TypeScript、ESLint、生产构建和 163 项常规测试通过；11 个 DB 专用测试跳过。新增隔离 PG 测试未实跑：本机 Docker PostgreSQL 镜像 I/O 错误。未做真实模型或浏览器闭环；没有生产迁移、部署、资料导入、账号/模型/Runner 变更。上线必须先备份并迁移尚未上线的 `0005`、`0006`，启动独立 worker 后再做隔离/真实请求验收。详见 `docs/knowledge-rag.md`。

以下为较早阶段的历史记录；最新生产状态以上方 2026-09-25 条目为准。各项核查仅代表标注时点，不代表持续监控。

## 2026-09-22 21:45 泰山派开发入口已融合上线

- 平台切换到 `/opt/vibehard/releases/20260922-taishan-integration/standalone`（PID 834514）。已登录用户可从桌面侧栏或移动端顶部进入「泰山派开发」，在现有工作台内打开独立 `/Vibeboard/`；模块问号同步说明使用步骤与真实边界。
- 页面明确提示 VibeBoard 账号独立，首次使用需在嵌入页单独登录；VibeHard 与 VibeBoard 的项目、知识资料和 Agent 上下文暂不自动同步。本次没有把独立系统包装成统一账号或已验证的 USB/烧录闭环。
- 从 `20260922-homepage` 完整发布源码只叠加 4 个运行时文件；151 项通过、3 项 DB 旧用例跳过，类型、针对性 lint、生产构建通过。候选和正式环境均回归登录、管理台、方案、工作流、帮助、知识库、PCB/Demo、首页与新入口；正式公网 HTML/RSC、匿名重定向、双端导航、iframe 地址及 VibeBoard 响应/响应头通过。
- 只重启 `vibehard.service`。Runner/Gateway/VibeBoard/nginx PID 758750/727637/807921/501913 保持不变；无数据库写入或迁移、账号/角色、模型、Key、Runner 或 nginx 配置变更。隔离调试/候选单元已回收，3211 关闭。
- 生产浏览器工具连接三次超时，因此没有宣称人工视觉点击验收；公网真实 HTTP 验证已通过。归档 SHA256 `62ea10a404a784953e30ac55bdc2764adb5439daafe0d92f90b9a7c6f21b855e`；未 commit/push，详情见 `docs/remote-integration-20260921.md`。

## 2026-09-22 09:38 首页与开放注册大字预告已上线

- 平台切换到 `/opt/vibehard/releases/20260922-homepage/standalone`（PID 823384），首页按现有功能重新组织；首屏蓝底公告主文案 20px/24px 加粗，导航/页尾加强。保持“当前邀请码内测、即将开放注册使用”，未改变注册规则。
- 从当前生产完整源码叠加 7 个首页文件，148 测试通过/3 DB 旧用例跳过，类型/构建通过；其他运行时代码逐文件一致，仍不含本地方案后台任务/0005 和泰山派入口。
- 候选、正式所有保护通过；公网首页/12 资产、知识库 HTML/RSC 权限、PCB renderer/Demo/18 资源/5 GIF 通过。公告本地桌面及 320px 视觉通过，无溢出；生产浏览器连接超时，没有生产点击验收结论。
- 仅重启平台，其他服务 PID/nginx/配置哈希不变；无数据库写入或迁移、账号/模型/密钥变更。预检 unit 已回收，3211 关闭。SHA256 `ded0c621873788ca3bf67e4f8e5c305c6bcfa46ec5d7b9528f908f41da1960fb`；旧 unit 可回滚。未 commit/push，详情 `docs/homepage-refresh.md`。

## 2026-09-22 官网首页本地更新，未上线

- 未登录首页以云端 Agent、受控工程变更、方案/BOM、原理图申请、知识审核与六类目录重新组织介绍，区分内测/目录/演示；不宣传尚未上线的后台方案任务或已验证的硬件闭环。
- 首屏/导航/页尾加入即将开放注册使用；保留登录和明确标注的已有邀请码入口。新增协作流程、三项 FAQ 和首页 metadata，既有登录/注册机制、私有目录及 Demo 文件不变。
- 157 测试通过、10 旧 DB 用例跳过；类型/ESLint/生产构建通过。真实浏览器桌面、390/320px、无横向溢出、固定导航/锚点、FAQ 键盘展开、注册页/Demo 往返通过。预览仅公开页，不连接真实 DB。未 commit/push/上线，详见 `docs/homepage-refresh.md`。

## 2026-09-21 22:28 知识库 UI 已上线

- 当前平台 `/opt/vibehard/releases/20260921-knowledge-library/standalone`，入口 `/vibehard/app/knowledge`，六类目录、63 款开发板、1076 条资料引用；仅数据库当前 admin/developer 可读。原始文件未上传、不提供下载、不自动进入项目正式知识或 Agent 检索。
- 以线上 `20260920-module-help` 完整源码为基线，仅叠加 12 个知识库运行时文件；本地方案后台任务/0005 迁移、泰山派 iframe 入口未发布。隔离发布构建 145 测试通过、3 个旧 DB 用例跳过，类型与生产构建通过。
- 候选、正式及公网 HTML/RSC 权限、匿名/删除账号/伪造角色拒绝、旧地址重定向、公开 bundle 不含目录通过；线上只有 admin/member，developer 由此前本地测试覆盖，未创建线上开发者。PCB renderer、18 资源/5 GIF、Demo 回归通过；候选及正式管理/Cookie/方案/工作流/帮助保护通过。
- 只重启平台，PID 813457；Runner/Gateway/VibeBoard PID 758750/727637/807921 与发布前一致，nginx 和密钥/配置哈希不变。无数据库写入/迁移、角色更改或模型调用。临时预检 unit not-found/inactive，3211 已关闭。浏览器工具本轮连接超时，未完成生产浏览器点击验收，不替代已有本地交互测试。
- 发布包 SHA256 `0a72e566bc02fbbd1e4c5f81d6d77af1ba9888ee82bfe82010af3af53a44d154`；旧 unit 在新 release 的 root-only backup 中，可仅回滚平台。未 commit/push。详情 `docs/knowledge-ui-release.md`；下文未上线均为历史时点。

## 2026-09-21 知识库统一分类（本地更新，未上线）

- 按用户要求将入口/标题统一为「知识库」，新地址 `/app/knowledge`，旧 `/app/board-library` 重定向；开发板选型、芯片手册、原理图、PCB、驱动与示例、开发经验六类导航。保留 admin/developer 服务端限制，无角色或账号变更。
- 资料条目移除「待补充」与上传状态标注；原始资料未接入，不提供假下载。已有目录分组后可搜索/查看详情，每批 24 条；未匹配类别为空，不伪造内容。项目知识审核/Agent 注入仍独立。
- 154 测试通过、10 旧 DB 测试跳过；类型/lint/构建通过；本地 HTML/RSC 权限、旧路由跳转、开发者浏览器分类/搜索/详情/手机/空态通过。无生产/数据库变更，未 commit/push/上线。详见 `docs/board-catalog-ui.md`。

## 2026-09-21 板卡知识库 UI 本地完成，未上线

- 新增 `/app/board-library`：参照用户截图实现 63 款 ESP32-S3 板卡卡片、搜索、分类/多特性筛选、分组资料弹窗、最多四款对比、数据看板与问号说明；侧栏「平台管理 → 板卡知识库」和移动顶栏入口。
- 新页面服务端按数据库最新角色仅放行 admin / developer；普通用户无入口，直达也不返回数据；目录 JSON 不在 public 或客户端静态包。未更改现有账号、登录实现、项目隔离或审核规则。
- 当前 1076 条目录记录均为待补充（808 个文件路径记录、268 条无本地路径记录），无原始资料上传/下载、无正式审核/Agent 注入、无数据库迁移或 OSS 操作。
- 全量 148 测试通过、10 旧 DB 测试跳过；类型/lint/生产构建通过。临时本地内存账号 HTTP HTML/RSC 角色隔离与匿名跳转、浏览器搜索/弹窗/看板/手机布局通过，不等于生产角色或真实文件接入验收。
- 本轮未 commit/push、未部署，云端仍为 `20260920-module-help`；先前方案后台任务迁移仍未上线。详见 `docs/board-catalog-ui.md`。

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
