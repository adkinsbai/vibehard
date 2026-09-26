# 项目状态

## 2026-09-26 原理图 Agent 能力验收基线（开发分支，未部署）

- `codex/eda-agent-workflow` 新增三轮真实模型验收入口：按用户要求生成 LED 电路、修改电阻值、保留原支路并增加第二支路。确定性评估检查器件/参数、必须/禁止引脚网络、无关电路保留；另运行原生 KiCad ERC 与导出网表核对器件身份、封装及实际引脚拓扑。提案、原始 ERC、原生图/网表和哈希写入 Git 忽略的私有目录。新增电路模块包的结构预检与端口映射接口，团队真实模块包、KiCad 原生审核及目录发布尚未完成。
- 本机验证：EDA 定向 97 通过/2 跳过，TypeScript、定向 ESLint、带 `/vibehard` basePath 的生产构建通过；WSL KiCad 9.0.8 真实导出的 LED 网表经新解析器复核通过。Windows 进程 PATH 中没有可直接调用的 `kicad-cli`；真实模型入口运行一次因本地设计模型未配置在第一轮失败，模型成功 0、ERC 执行 0，本轮**没有新的模型画图通过证据**。线上既有单轮 LED 证据仍见 `docs/eda-cloud-acceptance-2026-09-26.md`，不能替代三轮验收。
- 架构、测试与团队模块交付说明见 `docs/superpowers/specs/2026-09-26-eda-agent-native-workflow-design.md`、`docs/eda-agent-evaluation.md`、`docs/eda-module-contract.md`。FreeRouting、立创/PDF、原生多轮修改仍处于后续阶段；本次未发布生产。

## 2026-09-26 云端 KiCad / noVNC 已上线

- 当前正式平台 release 为 `20260926-eda-grid-v1`；云端每 `(账号, 工程)` 独立 worker 与持久卷，同一工程多标签页共享自己的桌面。公网 `/vibehard/eda`、WebSocket/RFB、归属隔离、三账号并发、保存后重启恢复、真实 KiCad ERC/DRC 和 ZIP 已验收。没有多人共编工程的需求。
- 正式设计模型在基础 LED 电路上返回 6 条受控命令，生成 3 器件、3 网络的原生 KiCad 工程。首轮 ERC 3 项网格偏移已由 `7cdc6e0` 修正；云端 KiCad 复测 ERC 0。PCB 尚无走线，DRC 仍报 3 项未连接，不能称整板完成。
- 当前单机最多 3 个运行工程、每账号 2 个；没有排队/扩容/硬存储配额。Agent 不支持就地修改已打开的 KiCad 工程，广泛器件库、立创/PDF、复杂多页导入、自动布线和真实硬件制造验证仍待做。详见 `docs/eda-cloud-acceptance-2026-09-26.md`。
- 原先本地分支“未部署”“模型未配置”的记录是历史状态，不再代表当前云端。

## 2026-09-25 云端 KiCad 隔离设计（未实施）

- 用户明确：各账号只编辑自己的工程，不存在多人共同编辑同一工程的产品场景。目标隔离单位为账号加工程；同一账号的同一工程多标签页可重连同一个桌面，不增加协作锁或接管流程。
- 设计稿见 `docs/superpowers/specs/2026-09-25-cloud-kicad-isolation-design.md`：云端每工程独立运行实例和持久卷、会话服务与同源票据网关、容量控制及三账号验收。当前本机单账号适配器和生产禁用状态未改变；云端多账号未实现、未部署。

## 2026-09-25 原生 EDA 验收更新（本机分支，未部署）

- 完整验收见 `docs/eda-acceptance-2026-09-25.md`。当前工程的已保存 KiCad 文件真实存在；ERC 报 10 项电气问题；默认 PCB DRC 0 漏报了 3 项原理图/PCB 不一致。
- 本轮修正后 `/eda` 网页 DRC 带 KiCad `--schematic-parity`，实际显示 3 项不一致；旧版工程检查也已携带原理图。受控器件库已与桌面 KiCad 9.0.8 对齐，并补齐工程库表。
- 三项 Agent 基础任务全部因缺少设计模型返回 503，没有 AI 修改命令。隔离测试工程 ERC/DRC 0 只验证确定性导出链路，不算 AI 画图通过。
- EDA 定向 63 项无跳过、Python 服务 9 项、TypeScript、ESLint、生产构建通过；全仓 126 通过、2 个既有 Windows 符号链接权限 `EPERM` 失败、2 跳过。未发布生产。长期目标仍缺真实模型闭环、原生工程制造包、广泛器件/导入、多用户隔离与实物验证。

## 2026-09-25 KiCad / noVNC（本机运行，未部署）

- `/eda` 右侧现有“原理图 Agent”对话入口：设计模型可用时生成受控修改提案，显示命令清单，用户确认后创建新的原生 KiCad 工程。本机设计模型尚未配置，发送按钮禁用；未声称真实 AI 生成验收完成。
- 可从当前已保存单页原理图只读导入 Agent 草稿，快照通过 KiCad CLI 网表并检查并发保存；本次验收图中的 `4xxx:4001` 超出当前 7 类器件库，被明确拒绝，原文件未改动。就地原生编辑、多单元器件和更广器件库仍待实现。
- 本次新增后 EDA 60 项通过、2 项跳过，Python 7 项通过，TypeScript、定向 ESLint 和生产构建通过；本机浏览器确认面板、拒绝信息和 KiCad 重连。功能分支尚未部署生产。
- `/eda` 已使用实际 KiCad 9.0.8 + noVNC 1.7.0；旧版保留在 `/eda/legacy`。现有登录/工程归属检查，一次性票据，原生文件持久化、下载、ERC/DRC；重连不覆盖文件。
- 实际浏览器修改并保存 470R 电阻及 0603 PCB 封装，ZIP 内容、RFB 握手、401/403、票据重用拒绝、检查和服务重启恢复已验证。验收电路 ERC 5 / DRC 0，不代表完整电路通过。
- 本机 WSL KiCad 服务 6081；网页 3212；独立 PostgreSQL 18/main 5438 保存账号与项目，原 Windows 5432 未改。忽略的启动设置和数据不能提交。
- EDA 56 项回归通过，新增超限测试后桌面相关 9 项通过；Python 5 项、定向 lint 和构建通过。本次未重跑全仓。
- 当前适配器只允许可信本机单账号，生产模式禁用。Agent 对现有原生工程的就地读写、多租户隔离、完整多页导入、制造包迁移尚未完成。长期平台目标仍未完成。
- 启动、数据目录、验收和下一步详见 `docs/eda-desktop.md`。

## 2026-09-24 EDA 功能分支（未部署）

- `codex/web-eda-workbench` 已实现空白工程编辑、7 类官方 KiCad 器件、原理图网络/PCB 放置走线、撤销恢复、项目版本保存、原生导入导出、真实 ERC/DRC 与 Gerber/钻孔 ZIP。入口 `/eda`。
- 已验证：EDA 48 项测试；生产构建/类型检查通过。全仓 111 通过、2 个既有 Windows symlink EPERM 失败、2 个数据库测试跳过；不能称全绿。真实本机 HTTP 验证的工程 ERC/DRC 均退出 0，交付 ZIP 19 项。
- 本地设计模型未配置，真实 AI 调用未验收；库覆盖、原生导入、PCB 高级编辑、立创/PDF 仍需扩展。独立最终审查被账户用量限制中断。长期任务 `usageLimited`，未标完成。
- 完整边界、运行方式、证据与后续清单：`docs/eda-workbench.md`。以下生产历史不代表该功能已发布。

## 当前阶段

- Phase: 云端 Agent 平台内测与设备闭环准备
- Active focus: 管理台功能分区已上线；完善云端 Agent 与设备闭环
- Last updated: 2026-09-19

## 最新补充（覆盖以下历史验收结论）

- 9/19 方案参考价更新已发布 `20260919-design-knowledge-pricing`，加入内置基础工程规则与人民币估算单价；真实候选请求 13 条 BOM 均有价格。内置规则不等于团队泰山派资料或实时报价。65 项测试通过、2 项跳过，完整构建与发布回归通过。
- 本次正式 Chrome 的两次方案请求（完整与缩短需求）均遇上游模型 90 秒超时；新文案可见、错误正常回显，正式网页带价表格尚未验收。当前模型链路存在波动，候选成功不等于稳定可用。

- 9/19 认证 Cookie 修复已发布为 `20260919-auth-cookies`：登录、注册、退出正确发送当前路径与旧根路径的独立 Cookie 头，避免旧账号覆盖新登录身份。63 项测试通过、2 项数据库专用测试跳过，构建、类型和 lint 通过；候选、正式与公网 Cookie 检查通过，真实 Chrome 退出后会话为未登录。管理员原角色和密码不变，浏览器重新登录待用户输入原密码。

- 9/19 正式方案生成、Agent 三轮对话及刷新后上下文恢复已成功；此前 provider 429 仍需持续关注，不能保证长期可用。
- 账号 `ldkj@admin.com` 已经所有者明确确认后升为管理员，原密码不变；演示账号仍为普通成员。
- 管理台五分区已发布为 `20260919-admin-sections`；3 项新增组件测试、完整测试、类型检查、lint、构建与发布校验通过。
- 生产实际平台为 `20260919-design-knowledge-pricing`，Gateway 保留 `20260918-cloud-runner`。以下旧构建/风险/下一步记录仅供历史追溯，当前状态以 `docs/current-status.md` 为准。

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
