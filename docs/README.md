# 文档索引

- [方案后台任务与项目归档](design-background-jobs.md)：本地已完成，未上线；自动创建/关联项目、持久化队列、恢复进度和下载方案。

- [模块使用说明弹窗](module-help.md)：已上线的各模块标题问号、集中帮助文案、演示/真实能力边界。

- [当前状态与交接](current-status.md)：线上功能、实时复测结果、Runner 心跳、模型请求路径与待办。
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
- [当前发布清单](../deploy/releases/20260920-module-help/release.json)：完整前端保护清单、服务变更与验收结果；模型超时限制和历史归档哈希见当前状态及部署文档。

维护约定：运行情况写入 `current-status.md` 并注明核查时间；发布变更记录在 `deployment-ldcx.md`；不在文档中保存密钥或会话令牌。
