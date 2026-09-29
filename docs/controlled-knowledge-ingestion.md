# 管理员受控知识批次（v2）

2026-09-27。本工具是首版管理员/运维 CLI，不是普通用户网页上传，也不授权同伴直接登录生产机。正常团队交付仍走 Git PR。原件继续放私有 OSS；解析/OCR 在离线受控工作目录串行执行，不占用生产 Runner。数据库保存的小型已发布文本不迁移。

2026-09-28 发布补充：`build-id` 和多索引集合规则已随 `20260928-audit-fixes-v1` 的受限检索进程上线；匹配的管理员 CLI v2 已发布到独立 `20260928-knowledge-control-v2` 目录。生产指针仍指向原 legacy 索引，未激活新批次。任何新索引仍须按下述清单、隔离评估、权限、容量和回滚门槛执行。修复证据见 [四项审计缺陷修复](audit-boundary-fixes.md) 和 [工作台发布记录](release-project-dashboard-20260928.md)。

## 数据流与边界

已验证 OSS 上传清单 + 同哈希本地原件 → 不可变输入快照 → 解析/OCR → 页内切片 → 自动筛查/隔离 → 独立索引包 → 管理员登记 → 隔离评估 → 显式激活。

- 输入为既有 `vibehard-oss-raw-batch/v1` 私有上传状态（`batchId/manifestUploaded/objects`）；对象包含相对 `paths`、`sha256/bytes/key/mode/validation`。只能使用真实上传并校验的状态，不能手工把 `manifestUploaded` 改成 true。OSS 下载的原件先落离线目录并核对 SHA，不将生产服务器用作 8 GB 中转站。
- 首版支持 PDF（可按需调用本机 Vision OCR）、ZIP 内 PDF/板级说明，以及直接 Markdown/文本。既有 RAR/7z PDF 提取兼容保留。对不支持的文件保留原件，不冒充正文已入库。OCR 助手为 `scripts/ocr-pdf-page.swift`，PDF 提取依赖 `pypdfium2`。
- 拒绝路径逃逸、软链接、不匹配的原件哈希；限制 ZIP 目录/展开量、单文档页数/文字数。单进程锁防止重复批次并发；断点续跑不得更换输入清单。
- `input-manifest.json` 固定输入；`discovery-status.json` 记录原件的发现/无可选正文/隔离/压缩包失败；`documents/*.json` 保存逐来源审核/页/片段/原件哈希；`failures/*.json` 仅保存错误码；`processing-status.json` 表示本次完成情况（开始处理先置为未完成，避免中断残留成功标识）。失败记录保留历史，最终以成功来源和当前批次状态为准。
- 低质量、疑似密钥、明显提示词注入、未完成 OCR 进入隔离，不能生成可发布片段。规则筛查不是完整安全扫描，也不验证器件参数、电路正确性或 OCR 阅读顺序。展示始终为“未人工复核”。

## 离线处理

```sh
python3 scripts/process-oss-knowledge-batch.py \
  --raw-state /absolute/private/upload-state.json \
  --source-root /absolute/private/originals \
  --output-root /absolute/private/processed-batch \
  --ocr --include-text --ocr-binary /absolute/private/ocr-helper
python3 scripts/build-controlled-knowledge-index.py \
  --processed /absolute/private/processed-batch \
  --policy /absolute/private/source-policy.json \
  --output /absolute/private/immutable-index-package
```

`source-policy.json` 需要明确标注每个来源的板卡、芯片家族和分类，禁止按模型猜测板卡变体；未知时 `boards: []`，不要随便关联到相似板卡。最小结构：

```json
{
  "batchId": "原始批次 UUID",
  "version": 1,
  "sources": [{"sha256": "原件内容 SHA256", "boards": [], "families": ["RV1106"], "category": "manuals"}],
  "probes": [{"query": "有判别力的检索需求", "expectedSha256": "预期来源 SHA256"}]
}
```

生成的三个工件是 `knowledge-fts.sqlite`、`.meta.json`、`.manifest.json`。后两者同文件名前缀；清单包含原件 OSS Key/父文件哈希、页级来源策略、审核状态和回归查询，不传给浏览器。输出目录已经存在时拒绝覆盖；失败候选必须另建版本重新构建。

## 云端管理命令

发布负责人先将三个工件放到固定 `/opt/vibehard/knowledge/staging/<build-id>/`；只接受该前缀内普通文件，不接受链接。原件 `batchId` 保持不变；索引 `build-id` 为 `<batch-uuid>-v<version>`，例如同一原件批次可登记 v1、v2，两版均不可覆盖。以 root 的既有部署通道执行打包后的 `knowledge-batch-control.cjs`，并加载平台环境文件（不要将数据库密码放到命令参数或日志）。命令第二参数必须是数据库中当前 `admin` 用户 UUID；`developer/member` 均拒绝。

```text
register <admin-uuid> <固定 staging 目录> <manifest SHA256>
evaluate <admin-uuid> <build-id>
activate <admin-uuid> <build-id>
rollback <admin-uuid> previous
rollback <admin-uuid> <build-id>
disable <admin-uuid> <source SHA256>
enable <admin-uuid> <source SHA256>
status <admin-uuid>
```

评估命令必须在独立 systemd transient unit 中执行，`MemoryMax=384M CPUQuota=50% TasksMax=16`。它逐片核对策略、哈希和隔离状态，做 60 次双并发有界检索及错误变体排除，要求 P95 < 500 ms、进程 RSS < 384 MiB，记录清单/索引版本。没有通过评估的版本不能激活。

生产控制目录 `/opt/vibehard/knowledge/control/`：

- `batches/<build-id>/` 不可变工件及登记/评估记录；兼容读取旧 `batches/<uuid>/` 登记。每索引最多 256 MiB/100,000 片段，最多 3 个登记版本且合计不超过 768 MiB。初始 legacy 基线约 102 MiB，另外保留，不自动删除。配额满时停止导入，由管理员另行制定归档，绝不自动清除当前/回滚版。
- `current.json/previous.json` 保存 `vibehard-index-set/v1` 集合，兼容读取旧单索引指针。激活不同原件批次追加到集合；激活同批次新版本只替换该批次，旧批次仍可搜索。最多同时读 4 个索引，活动 SQLite 总容量不超过 256 MiB，最多 12 个引用、同一原件最多 2 片、跨批次去重；并发仍为 2。注册容量与活动容量是两项独立限制。
- `rollback previous` 恢复整个上一集合，指定 `build-id` 则只替换同批次版本。只重启检索 unit，不重启网页、Runner、Gateway、nginx；健康检查失败恢复旧集合、旧进程以及原有回滚历史。
- `disabled.json` 是全局停用来源哈希，切换/回滚也保留停用列表。片段返回前再次过滤；版本指纹包含清单哈希和停用列表，下一 Agent 回合重建旧资料上下文。
- `transition-*.json/sources-*.json` 记录操作者和变更。一个操作锁串行化管理；进程异常退出导致遗留锁时，管理员先确认无导入进程，再处理精确锁文件，不自动抢占。

发布多索引修复时先备份旧 Worker/CLI 及单索引指针，以旧指针验证新 Worker，再同时发布新 CLI。新批次激活前还要在受限候选进程验证整个活动集合的旧/新查询、停用和引用，单批次 `evaluate` 通过不等于合集满足生产负载门槛。回滚到旧版程序时，必须恢复与其匹配的旧单索引指针，不能只回滚二进制。

当前线上仍使用经核对的 legacy 索引及 95 条已发布文本；本地修复不新增或替换线上知识正文。FTS 是关键词检索，不是向量索引；不能宣称已实现混合/语义检索。
