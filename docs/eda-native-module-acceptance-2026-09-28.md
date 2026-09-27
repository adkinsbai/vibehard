# 原生模块到 PCB 自动布线的本地验收

基线：`9fc6ec5`，开发分支 `codex/eda-native-module-chain`。本报告记录 2026-09-28 在本地 checkout 上完成的验证；未据此声称线上版本已经更新或硬件电路已通过审核。

## 样板与接入方式

团队正式模块尚未交付，因此新增 `lib/eda/modules/sample-led/` 作为**软件链路测试样板**。它包含 KiCad 原生单页原理图、PCB 设计块、工程文件、库表和 `manifest.json`。清单固定模块 ID/版本、每个原生文件的 SHA-256、VCC/GND 端口的方向、电压范围和实际引脚位置。结构校验会拒绝未声明文件、路径穿越、哈希不符、缺失或位置错误的端口；KiCad CLI 导出的真实网表再确认端口所在网络。该样板的电阻、LED、封装和供电范围**没有经过硬件工程审核**。

Agent 的受控命令增加 `insertModule`：按版本插入模块内部器件、网络和 PCB 设计块内已有的走线，仅向外暴露清单声明的端口。模块内部器件、网络和走线不可由后续受控命令任意改写；必需端口未连接时，页面不允许生成原生工程。生成的 KiCad 原理图携带来源属性，保存并读回时可以恢复模块实例和其内部走线。Agent 仍须提交可审阅的修改，用户接受后才进入草稿。

当前目录只注册此样板；`manifest.json` 和包校验函数是今后接收团队模块的入口。**还没有**用户上传原生模块包、数据库模块版本目录、自动审版和任意第三方 KiCad 库映射。现有模块在生成工程时展开为单页器件与网络，暂非多页层级子图。保存后从原理图读回可恢复模块来源，但从已保存 PCB 读取人工改动并合并回下一次 Agent 草稿尚未完成。

## 可复核的真实工具链结果

- KiCad CLI `9.0.8` 导出样板网表，VCC/GND 与清单端口相符；样板原理图和 PCB 能读入现有 EDA 文档模型。
- 插入模块、添加两针电源接口并连接端口后，生成原生 `.kicad_sch`、`.kicad_pcb`、`.kicad_pro`。候选为 3 器件、3 网络；原始空工程保持不变。候选原理图再经 KiCad 导出网表并由平台读回，模块 ID 和锁定的内部成员可恢复。
- 手动参考布线候选的 KiCad ERC **0 项**、含原理图一致性检查的 DRC **0 项**。这是软件样板的规则检查结果，不等于功能、电气裕量或可制造性验证。
- 将同一候选的外部走线清除、保留模块原生 PCB 内部走线后，KiCad 原生 DRC 报 **2 项未布通、0 项原理图不一致**。使用 Freerouting `2.4.1` 可执行 JAR，经 KiCad `pcbnew` 导出 DSN、自动布线、导入 SES 后，新候选的未布通数为 **0**，原理图不一致仍为 **0**，其他 DRC 问题未增加。原板 SHA-256 `9999112aa2038083de48ffb73f8470314c41b4b5de7450f10d6d88696840893a` 在布线期间不变；自动布线候选 SHA-256 为 `fcdd7ad7333282e2e31f73119ae96af68c43afa9fb7af6f457253bba315a89aa`。
- 测试 JAR 下载自 Maven Central 的 Freerouting 2.4.1 发布包，校验 SHA-256 `fb2e91df901fa50cd23a09ab42793af0ece4f3b1f3857d6724dd6f9c0c00be98`；JAR 不进入仓库。适配器要求部署方固定完整 SHA-256，且只返回独立候选，不直接覆盖用户工程。

本地完整证据位于被 Git 忽略的 `.eda-data/module-chain-verification/`：`result.json`、`freerouting-result.json`、原生工程、KiCad ERC/DRC 报告、DSN、SES 和自动布线候选 PCB。可先运行 `pnpm exec tsx scripts/verify-eda-module-chain.ts` 复查模块/原生文件；自动布线需在装有 KiCad 9 的 Linux 上配置 `FREEROUTING_JAR`、`FREEROUTING_JAR_SHA256` 后运行 `scripts/verify-eda-module-freerouting.ts`。

## 代码检查与边界

- EDA 定向 Vitest：**87 通过、2 跳过**；定向 ESLint、TypeScript 检查、Next 生产构建通过。
- 全仓 Vitest：**303 通过、13 跳过、5 失败**。4 项失败于本机 Windows 创建符号链接返回 `EPERM`，与 EDA 无关；另 1 项私有 Unix 检索服务测试在 5 秒限制下超时，独立重跑仍超时。不能称全仓测试全绿。
- 当前开发分支**未发布到 `ldcx.tech`**，本轮没有新功能的登录浏览器验收、真实模型对话评测、多人负载测试、服务器部署、生产数据库/OSS 写入或硬件打样。
- Freerouting 已有真实、可重复的本地适配器和候选生成；云端 manager 与 worker 源码位于本仓库的 `services/eda-desktop/`，但当前控制协议只允许 `start/status/stop/archive/check/snapshot`，worker 镜像尚未装 Java/Freerouting，noVNC 工作台也没有候选审阅/接受接口。线上用户暂时不能从网页直接调用本次自动布线流程。

下一阶段应先把团队正式模块按同一清单制作、通过工程师审核并映射其符号/封装；再在云端 manager 侧为每个用户工程创建隔离布线任务、存候选、展示 DRC 差异和接受/回滚操作。完成后用真实设计模型连续测试“理解需求 → 选择模块 → 接端口 → 修改原理图 → 原生保存读回 → PCB 自动布线”，并在公网按账号隔离验收。PDF 与立创 EDA 的可靠导入仍是独立工作，不能由此样板结果推断已跑通。
