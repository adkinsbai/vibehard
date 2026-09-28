# 文档索引

- [9/28 审计修复与真实 BOM 发布](release-audit-bom-20260928.md)：两阶段 GitHub/候选/备份/上线证据、未覆盖验收和回滚步骤。
- [平台功能验收矩阵](platform-feature-acceptance-matrix.md)：逐模块记录真实输入、实际执行、持久结果、失败提示和下一道验收门槛；明确本地与生产边界。
- [四项修复与 BOM 候选验收](audit-bom-candidate-20260928.md)：隔离库、云端独立候选、检索资源限制、失败定位与候选清理；未切换生产。
- [四项修复与真实 BOM 分项评审](review-audit-bom-20260928.md)：代码评审发现、修正、独立提交范围及正式发布前剩余闸门。
- [四项审计缺陷修复](audit-boundary-fixes.md)：Worker 有界收尾、多批次/版本索引、改密撤销会话；本地修复与回归结果，未发布。
- [两轮代码检查与 Debug 报告](code-audit-20260927.md)：修复前基线、两轮回归与真实隔离数据库复现、4 个确认问题及验证边界。

- [管理员受控批量入库](controlled-knowledge-ingestion.md)：不可变清单、离线 OCR/切分、隔离评估、索引版本/停用/回滚；无用户大文件直传。

- [方案可靠性与统一检索交付](reliability-knowledge-delivery-20260927.md)：三阶段已发布，任务诊断、隔离模型验收、权限/引用与回滚证据。

- [OSS 原件归档与检索准备](oss-knowledge-import.md)：ESP32-S3 资料包 286 份去重原件已私有上传并校验；记录清单、隔离 ZIP 与后续解析/索引边界。
- [RV1106 / RV1126B 本地资料候选](chip-resource-local-candidates.html)：两块板的手册、原理图与开发经验文件路径初筛，尚未入库。
- [RV1106 / RV1126B 首批 RAG 验收](board-knowledge-rag-proof.md)：9 个明确源文件、95 条正式已发布检索正文与真实方案来源验收；原件未上传 OSS。

- [Laya 本地部署](../laya/README.md)：M4 GPU 独立后台服务、固定模型、API 调用和启停；已做真实推理小样例，尚未接平台 RAG。

- [Laya 选型与 RAG 评估](laya-evaluation.md)：能力与限制、代码接入点、器件证据预筛及对照验证建议；仅评估，未集成。

- [知识库正文与方案检索](knowledge-rag.md)：审核正文、项目隔离的有界关键词检索及方案来源展示；9/25 首批已上线，历史设计/测试阶段见文内。

- [官网首页更新](homepage-refresh.md)：9/22 已上线的功能介绍、大字开放注册提示、公开页验收与回滚。

- [知识库 UI](board-catalog-ui.md)：六类研发资料目录、管理员/开发者访问、官方板卡规格核对和真实原件/索引关联。
- [RAG 索引关联完善](oss-rag-index-refinement-task.md)：板卡型号、去重文档别名、错误变体排除及本地检索验收；9/27 worker 发布与生产验收见 [部署记录](deployment-ldcx.md)。
- [ESP32-S3 板卡规格核对报告](board-spec-verification-2026-09-26.html)：61 款官方型号来源、展示特性、变体提示及排除文件；不代替实物验证。
- [知识库 UI 发布记录](knowledge-ui-release.md)：9/21 已上线的独立版本、验收、排除项及回滚。

- [泰山派入口整合与发布](remote-integration-20260921.md)：GitHub PR 合并来源、VibeBoard 嵌入、独立账号/数据边界及 9/22 云端验收。

- [方案后台任务与项目归档](design-background-jobs.md)：已上线；自动创建/关联项目、持久化队列、恢复进度和下载方案。

- [模块使用说明弹窗](module-help.md)：已上线的各模块标题问号、集中帮助文案、演示/真实能力边界。

- [当前状态与交接](current-status.md)：线上功能、实时复测结果、Runner 心跳、模型请求路径与待办。
- [KiCad / noVNC 工作台](eda-desktop.md)：原生原理图/PCB 网页编辑、启动、保存、下载及当前功能边界；[云端发布验收](eda-cloud-acceptance-2026-09-26.md)记录多账号隔离和真实模型测试。
- [部署与回滚](deployment-ldcx.md)：服务边界、发布历史、SSH 钥匙串使用和验收命令。
- [项目说明](../README.md)：架构、开发启动、数据库与功能说明；仓库能力不等同于已部署能力。
- [脚本说明](../scripts/README.md)：构建、数据库迁移、素材处理和发布检查入口。
- [云端 Runner](../deploy/runner/README.md)：非 root 执行器、隔离边界、工具链、API 配置与验收。
- [LLM 配置与验收](llm-settings.md)：管理员修改模型和 Key、协议要求、加密边界、真实调用成功证据与历史 429。
- [方案参考价与内置资料](design-reference-prices.md)：BOM 人民币估价方式、知识资料版本及与项目知识库的区别。
- [项目知识库与审核](project-knowledge.md)：已上线的用户申请、管理员/开发者审核、草稿/正式版本与 Agent 快照。
- [原理图识别与知识库备选](schematic-knowledge-candidates.md)：真实附件识别、申请按钮、目标项目、重复提交保护及审核入口（9/20 已发布；模型可用性见当前状态）。
- [嵌入式 Skills 接入方案](embedded-skills-integration-plan.md)：参考小智技能库的云端选技能、现场设备执行和项目文档交接设计（尚未实现）。
- [团队云端交付规范](team-cloud-delivery.md)：同伴和 Agent 的交付包格式、目标目录、审核流程与负载限制。
- [当前发布与回滚](deployment-ldcx.md)：`20260926-board-spec-v2` 的服务状态和回滚步骤；历史发布清单见部署文档。

维护约定：运行情况写入 `current-status.md` 并注明核查时间；发布变更记录在 `deployment-ldcx.md`；不在文档中保存密钥或会话令牌。
