# 项目状态

## 当前阶段

- Phase: 云端 Agent 平台内测与设备闭环准备
- Active focus: 管理台功能分区已上线；完善云端 Agent 与设备闭环
- Last updated: 2026-09-19

## 最新补充（覆盖以下历史验收结论）

- 9/19 工程分析/受控修改/报告已发布为 `20260919-engineering-workflow`，云端 Runner 已开启工作流，Gateway/设备节点/凭据不变。真实工程两轮完成只读分析、审批修改 math.c、审批 make test（退出 0）、生成证据报告；独立核对其余文件未变。Chrome 已展开并下载报告。保留验收项目供管理员查看；原生 C 验收不等于泰山派/硬件验收或长期稳定性。见 `docs/current-status.md`。

- 9/19 方案参考价更新已发布 `20260919-design-knowledge-pricing`，加入内置基础工程规则与人民币估算单价；真实候选请求 13 条 BOM 均有价格。内置规则不等于团队泰山派资料或实时报价。65 项测试通过、2 项跳过，完整构建与发布回归通过。
- 本次正式 Chrome 的两次方案请求（完整与缩短需求）均遇上游模型 90 秒超时；新文案可见、错误正常回显，正式网页带价表格尚未验收。当前模型链路存在波动，候选成功不等于稳定可用。

- 9/19 认证 Cookie 修复已发布为 `20260919-auth-cookies`：登录、注册、退出正确发送当前路径与旧根路径的独立 Cookie 头，避免旧账号覆盖新登录身份。63 项测试通过、2 项数据库专用测试跳过，构建、类型和 lint 通过；候选、正式与公网 Cookie 检查通过，真实 Chrome 退出后会话为未登录。管理员原角色和密码不变，浏览器重新登录待用户输入原密码。

- 9/19 正式方案生成、Agent 三轮对话及刷新后上下文恢复已成功；此前 provider 429 仍需持续关注，不能保证长期可用。
- 账号 `ldkj@admin.com` 已经所有者明确确认后升为管理员，原密码不变；演示账号仍为普通成员。
- 管理台五分区已发布为 `20260919-admin-sections`；3 项新增组件测试、完整测试、类型检查、lint、构建与发布校验通过。
- 生产实际平台和 Runner bundle 为 `20260919-engineering-workflow`，Gateway 保留 `20260918-cloud-runner`。以下旧构建/风险/下一步记录仅供历史追溯，当前状态以 `docs/current-status.md` 为准。

## 构建

- Command: `NEXT_PUBLIC_BASE_PATH=/vibehard pnpm build`、`pnpm build:services`
- Last result: 已验证（2026-09-18 发布前记录；本次文档任务未重跑构建）
- Evidence: `docs/current-status.md`、`deploy/releases/20260918-cloud-runner/release.json`

## 测试

- Unit test: 已验证，41 项通过、2 项因缺少独立 PostgreSQL 测试库跳过
- Production web: 部分完成；登录、项目/会话、SSE、中断、PCB/Demo 已验证
- Cloud model E2E: 阻塞；浏览器持续重连，正式验收 5 分钟超时
- Hardware test: 未验证；`device-runner` 在线但未连接“小电脑”完成实机闭环
- Evidence: `docs/current-status.md`

## 当前风险

- `cloud-runner` 心跳正常不等于模型可用；provider/出口链路当前超时。
- 生产默认并发为 1，未经队列与配额控制的大批量导入/任务会阻塞其他用户。
- `/opt/vibehard/releases` 约 1.3 GB，旧 release 与 `/opt/vibehard/incoming` 尚无明确保留/清理策略。
- 当前没有受控的项目知识上传 API；禁止把旧 `incoming` 目录当作团队公共投递箱。

## 阻塞项

- 云端模型请求持续重连并超时。
- 项目知识导入工具/API 尚未实现。
- 小电脑工程、工具链、接线和烧录步骤尚未交接。

## 下一步

1. 修复 provider 网络链路并重跑完整生产验收。
2. 实现按项目 ID 解析 workspace 的受控文档导入工具或 API。
3. 发布执行器选择页面并验证云端/设备路由。
4. 导入小电脑基础工程，完成编译、烧录、重启和日志回传。
