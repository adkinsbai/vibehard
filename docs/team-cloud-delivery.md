# 团队云端交付规范

更新时间：2026-09-18。适用于 VibeHard 平台代码、项目知识文档和后续“小电脑”工程的三人协作。

2026-09-20 补充：[项目知识库](project-knowledge.md) 已于 9/19 上线，新权限规则（普通用户申请、管理员/开发者审核）及原理图识别申请已于 9/20 部署。小型文本不落 workspace，而由项目所有者通过 API 存入 PostgreSQL 草稿，审核后按任务快照提供给模型。以下 workspace 导入设计仍适用于未来基础工程、大文件和多文件交付包，不应把它误认为本轮已实现的能力。生产发布前同伴仍通过 Git 交付，不直接上传服务器。

## 一句话规则

普通协作只有一条主线：同伴及其 Agent 在独立分支完成修改、测试并提交 PR，由负责人在 GitHub 审查合并，再由负责人部署云端。同伴不需要生产 SSH 权限，也不需要阅读本文件余下的运维细节。

只有任务涉及生产发布、把产品资料/基础工程导入线上项目 workspace，或实现导入工具时，才继续阅读本文件。平台代码经版本化 release 发布；项目知识经项目 ID 解析后导入该项目唯一 workspace；大文件进入对象存储。禁止把文件散落到 active release、Runner 会话目录或旧 `incoming` 目录。

## Agent 开始前的阅读顺序

1. 根目录 `AGENTS.md`
2. `.ai/TEAM_RULES.md`
3. `.ai/PROJECT_STATUS.md`
4. 与任务直接相关的设计或硬件文档
5. 仅在生产发布或项目知识导入任务中阅读本文件

Agent 完成任务后向 `.ai/TASK_LOG.md` 追加证据化记录；状态变化时同步 `.ai/PROJECT_STATUS.md`。

## 生产服务器真实目录

| 路径 | 用途 | 团队是否可直接写入 |
| --- | --- | --- |
| `/opt/vibehard/releases/<release>/` | 不可变的平台/Gateway 发布包 | 否，只能由发布流程创建 |
| `/opt/vibehard/cloud-runner/` | 云端 Runner bundle 与隔离脚本 | 否 |
| `/etc/vibehard/` | 平台、Runner、模型配置及密钥 | 否 |
| `/var/lib/vibehard-runner/workspaces/<user>/<project>-<slug>/` | 某一项目的工程和知识文档 | 只能由受控导入流程按项目 ID 写入 |
| `/var/lib/vibehard-runner/codex/<user>/<project>-<slug>/` | Codex 会话状态 | 永远禁止人工上传 |
| `/opt/vibehard/incoming/` | 旧发布上传暂存目录 | 否，不作为团队公共投递箱 |

云端 Codex 只挂载当前项目 workspace 和该项目的 Codex 状态目录。把知识文档放在其他服务器目录，Agent 默认看不到；把文档放进 release 又会在下次发布时丢失或污染版本。

## 两条交付通道

### A. 平台代码与平台文档

适用于 `app/`、`components/`、`lib/`、`gateway/`、`runner/`、`deploy/`、`scripts/` 和仓库级文档。

1. 每人使用独立分支，默认前缀 `codex/`。
2. 提交小而可评审的 commit，附测试证据。
3. 推送 GitHub，合并前检查变更范围和生产迁移要求。
4. 由一名发布负责人构建版本化 release，运行预检，再切换 systemd。
5. 禁止在服务器 active release 中直接编辑文件；紧急修复也必须回写 Git。

这是三人日常协作的默认通道。对于普通功能优化、缺陷修复和页面修改，到 PR 合并即完成同伴职责；云端部署由负责人单独执行。

### B. 项目知识与产品工程

适用于产品需求、原理图分析、引脚表、驱动说明、构建/烧录步骤、验证记录和基础工程。

这条通道只用于需要让线上 Agent 直接读取的产品知识或工程资料，不适用于普通平台代码 PR。同伴先在仓库中生成标准交付包：

```text
team-deliveries/
  <owner-slug>/
    <YYYYMMDD>-<topic-slug>/
      DELIVERY.md
      docs/
        00-index.md
        product/
        hardware/
        firmware/
        verification/
        decisions/
      project/          # 可选；基础工程或补丁
      checksums.sha256
```

不要把 `node_modules`、构建缓存、`.git`、Codex session、密钥或无关日志放入交付包。

## `DELIVERY.md` 模板

每个交付包必须有一个入口文件：

```markdown
---
schema: vibehard-delivery/v1
delivery_id: 20260918-owner-topic
owner: teammate-name
target_kind: project-knowledge
target_project_id: <平台项目 UUID；未知时写待确认>
target_relative_path: docs/knowledge/<topic-slug>
created_at: 2026-09-18T19:00:00+08:00
status: 待确认
max_uncompressed_mb: 20
---

# 交付说明

## 目标

## 内容索引

## 已验证

## 未验证 / 待确认

## 禁止覆盖的文件

## 导入后检查
```

`target_project_id` 是平台项目 UUID，不是服务器路径。Agent 不得猜测 `<user>/<project>-<slug>`；受控导入工具应从数据库验证项目归属并解析 `workspace_key`。

## 受控导入流程（待实现）

当前生产已有小型知识文本草稿 API，但没有向 workspace 导入多文件交付包的上传 API 或审核后导入脚本。该交付包通道实现前，同伴的 Agent 到“提交 GitHub 交付包”即停止，不得自行 SSH/SCP。

建议的导入器按以下顺序工作：

1. 接收 `delivery_id`、Git commit SHA 和 `target_project_id`。
2. 从数据库只读解析该项目的唯一 `workspace_key`，校验项目归属和 Runner 类型。
3. 在 `/var/lib/vibehard-runner/import-staging/<delivery_id>/` 解包，而不是直接写目标目录。
4. 拒绝软/硬链接、路径逃逸、隐藏密钥、设备文件、超过限制的文件和未列入清单的内容。
5. 校验 `checksums.sha256`、文件数、总大小和 `DELIVERY.md`。
6. 仅允许写入目标 workspace 下的相对路径；不得触碰 `.codex`、其他项目或 release。
7. 在同一文件系统内原子替换目标目录，并保留一份可回滚备份。
8. 写入审计记录，返回导入 commit、目标项目、文件数、字节数和哈希。
9. 删除 staging；导入动作本身不触发模型、构建或设备任务。

## 负载与容量限制

- 单个交付包解压后不超过 20 MB、500 个文件；大于限制的 PDF、数据集、固件和媒体进入对象存储，只在文档中保存校验哈希和引用。
- 同一时间只执行一个导入；导入与模型任务分开排队。
- 不在导入时运行依赖安装、全仓扫描、索引、编译或模型总结。
- 每个知识主题只保留当前版和一个回滚版；临时 staging 最长保留 24 小时。
- 文档优先使用 Markdown/JSON/CSV；图片按主题归档，避免重复副本。
- 生产 Runner 当前 `MemoryMax=2G`、`CPUQuota=150%`、`TasksMax=128`、任务并发数为 1；任何批处理都必须尊重这些上限。

## 给同伴 Agent 的标准提示词

```text
先阅读根 AGENTS.md、.ai/TEAM_RULES.md、.ai/PROJECT_STATUS.md 和
docs/team-cloud-delivery.md。不要连接或修改生产服务器。

为本任务创建一个符合 vibehard-delivery/v1 的交付包，放到
team-deliveries/<你的名字>/<日期>-<主题>/。生成 DELIVERY.md、docs/00-index.md
和 checksums.sha256；区分已验证、未验证和待确认。若不知道平台项目 UUID，
将 target_project_id 写为“待确认”，不要猜测服务器路径。完成后提交到独立分支，
报告 commit、文件数、总大小、验证证据和需要发布负责人确认的事项。
```

## 发布负责人检查表

- 交付 commit 已评审，目标项目 UUID 已确认。
- 没有密钥、个人数据、生产日志、依赖目录或路径逃逸。
- 文件数、解压大小和 SHA-256 与清单一致。
- 平台变更进入新 release；项目知识只进入目标 workspace。
- 导入前后记录磁盘、服务、Runner 心跳；不要仅依据数据库 `online`。
- 导入失败时删除 staging，不留下半完成目录，不重启无关服务。
