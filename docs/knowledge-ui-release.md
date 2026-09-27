# 知识库 UI 发布任务确认

- 用户授权：2026-09-21「上线」，范围为当前知识库六类目录 UI、管理员/开发者只读访问及导航。
- 基线：只读确认活跃平台为 `20260920-module-help`。在独立临时目录使用该版本完整源码，叠加本次知识库改动；不发布本地方案后台任务、`0005_design_jobs`、泰山派独立入口等其他未上线改动。
- 新发布：`20260921-knowledge-library`，仅切换 `vibehard.service` 工作目录。线上源目录不原地编辑。
- 允许：上传版本化发布包、创建回环 3211 短期预检服务、现有账号只读权限验证、零活跃 Agent 任务时切换平台，失败恢复旧 unit。
- 禁止：数据库迁移/写用户/改角色、模型调用、修改密钥或配置、Runner/Gateway/VibeBoard/nginx 重启、原始资料入库或公开访问。
- 保护：完整继承 PCB/Demo overlay；候选与正式对实际包运行 `verify-frontend-release.mjs`。检查登录 Cookie、管理台、知识审核、方案/工作流/帮助 UI 与新知识库 HTML/RSC 角色限制。
- 回滚：恢复新 release 的 root-only backup 中旧平台 unit，只重启平台；无需恢复数据库。

## 发布结果

- 2026-09-21 22:28 +08:00 核查已激活，平台 PID 813457；公网地址 `https://ldcx.tech/vibehard/app/knowledge`。六类、63 板卡、1076 条目录引用已上线，原始资料与正式 Agent 知识接入仍未做。
- 独立发布构建 145 测试通过、3 个旧 DB 用例跳过；类型/生产构建通过。候选和正式全套保护通过；公网知识库 HTML/RSC 权限、伪造角色/删除账号拒绝、旧路由重定向、公开脚本不含目录、PCB renderer/Demo/18 资源/5 GIF 通过。生产现有角色只有 admin/member，developer 依据本地测试，不为验收新建线上账号。
- Runner/Gateway/VibeBoard PID 758750/727637/807921、nginx 和配置哈希与发布前相同。无数据库写入/迁移、模型请求、密钥/账号改动。预检 unit 已回收，3211 无监听。生产浏览器工具超时，未做本轮真实点击验收；此前本地交互与手机布局已验证。
- 初次候选验收因脚本未带 RSC `?_rsc` 标记而收到标准 307；修正脚本并重打包后通过。旧失败临时 unit reset 后重跑；这些均发生在切换正式服务之前。旧候选包保留为 `20260921-knowledge-library-preflight-v1`，不再运行。
- 发布包 SHA256：`0a72e566bc02fbbd1e4c5f81d6d77af1ba9888ee82bfe82010af3af53a44d154`。完整源码与哈希在云端 `RELEASE.json`，本地摘要在 `deploy/releases/20260921-knowledge-library/release.json`；本轮未 commit/push。

回滚命令（先确认没有活跃任务）：

```sh
node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260921-knowledge-library/scripts/deploy-knowledge-library.mjs rollback
```
