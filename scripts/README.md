# 脚本说明

脚本保留现有位置，以免破坏调用路径。

| 脚本 | 用途 |
| --- | --- |
| `build-standalone.sh` | 构建 Next.js standalone，并补齐 public、static、SWC 运行依赖；按当前脚本约定处理跨平台 sharp 依赖 |
| `build-services.mjs` | 构建 Gateway、Runner、数据库迁移 bundle |
| `design-worker.ts` | 独立方案任务处理器：数据库串行队列、90 秒模型硬超时与结果归档；需先应用 0005 迁移 |
| `verify-design-local.ts` | 仅限本机隔离 `vibehard_design_test` 库，验证真 HTTP/独立处理器/缺模型配置失败保留；清理自身合成账号 |
| `migrate.ts` | 执行数据库迁移；只针对明确指定且已备份的目标数据库运行 |
| `bootstrap-llm-settings.ts` | 从既有独立模型环境配置导入加密设置；不覆盖已保存设置，不输出 Key |
| `deploy-llm-settings.mjs` | 本次发布专用 prepare/activate/rollback，备份数据库、隔离预检并只重启平台和云端 Runner |
| `verify-llm-release.mjs` | 临时测试身份、角色权限、密钥不回显与可选真实模型/Agent 验收；会写库及消耗模型额度，生产执行须明确授权 |
| `verify-codex-provider.mjs` | 检查固定 Codex app-server 是否接受托管 provider 配置；不等于真实模型推理成功 |
| `verify-schematic-model.ts` | 只读加载当前模型配置，向服务商发送人工合成的一页微型 PDF 验证唯一编号和器件提取；不写业务库，需显式 `ALLOW_SCHEMATIC_MODEL_TEST=synthetic-only`，会消耗少量模型额度 |
| `llm-browser-fixture.mjs` | 仅限精确隔离库创建/清理浏览器测试账号；禁止用于生产 |
| `verify-frontend-release.mjs` | 只读检查登录保护、PCB v0.2 页面及其实际引用的绘图代码、Demo 文案和五个 GIF 哈希 |
| `verify-cloud-preflight.mjs` | 仅限独立测试数据库／3211 与 8788 端口，创建测试账户和项目，模拟 Runner 验证消息链路与 ZIP 下载；不验证模型推理，拒绝连接正式库 |
| `generate-demo-gifs.mjs` | 早期 Demo 动图生成工具，保留用于追溯 |
| `prepare-live-demo-gifs.mjs` | 产品实录 GIF 处理工具 |
| `prepare-pcb-reference-gif.mjs` | PCB 参考素材动图处理工具 |
| `prepare-showcase-media.mjs` | 展示媒体转换与准备工具 |

发布检查示例（在服务器执行）：

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260916-pcb-restore/verify-frontend-release.mjs \
  https://ldcx.tech /opt/vibehard/releases/20260916-pcb-restore/standalone
```

检查脚本通过环境读取 `SESSION_SECRET`，只为虚构用户签发短时页面渲染会话，不访问账户数据，不输出令牌。它验证页面和资源交付，不等于真实模型对话或 EDA 生成验收。

媒体脚本可能包含历史输入路径；使用前检查配置，避免覆盖用户提供的原始素材。不要为了整理目录重新生成已发布 GIF。
