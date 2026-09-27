# 文档索引

- [当前状态与交接](current-status.md)：线上功能、实时复测结果、Runner 心跳、模型请求路径与待办。
- [KiCad / noVNC 工作台](eda-desktop.md)：原生原理图/PCB 网页编辑、启动、保存、下载及当前功能边界；[云端发布验收](eda-cloud-acceptance-2026-09-26.md)记录多账号隔离和真实模型测试。
- [原理图 Agent 验收](eda-agent-evaluation.md)：三轮生成/修改任务、拓扑与保留判定、真实模型和 KiCad 证据边界；[模块交付契约](eda-module-contract.md)说明团队模块的端口 manifest 与当前结构预检。
- [EDA OSS 资料库](eda-knowledge-oss.md)：当前数据盘点、只读查询接口、Agent 资料引用与原生器件发布边界。
- [部署与回滚](deployment-ldcx.md)：服务边界、发布历史、SSH 钥匙串使用和验收命令。
- [项目说明](../README.md)：架构、开发启动、数据库与功能说明；仓库能力不等同于已部署能力。
- [脚本说明](../scripts/README.md)：构建、数据库迁移、素材处理和发布检查入口。
- [云端 Runner](../deploy/runner/README.md)：非 root 执行器、隔离边界、工具链、API 配置与验收。
- [LLM 配置与验收](llm-settings.md)：管理员修改模型和 Key、协议要求、加密边界、真实调用成功证据与历史 429。
- [方案参考价与内置资料](design-reference-prices.md)：BOM 人民币估价方式、知识资料版本及与项目知识库的区别。
- [团队云端交付规范](team-cloud-delivery.md)：同伴和 Agent 的交付包格式、目标目录、审核流程与负载限制。
- [当前发布与回滚](deployment-ldcx.md)：`20260926-eda-grid-v1` 的服务状态和回滚步骤；历史发布清单见部署文档。

维护约定：运行情况写入 `current-status.md` 并注明核查时间；发布变更记录在 `deployment-ldcx.md`；不在文档中保存密钥或会话令牌。
