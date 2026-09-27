# 已审核电路模块交付契约

VibeHard 的电路模块是可复用的**原生 KiCad 子原理图**及明确的对外端口，不是截图或仅供模型阅读的文字。团队首批交付 ESP32 最小系统、WiFi/蓝牙等电路时，请为每个模块提供一个独立包；平台把同一 `moduleId + version` 的内容视为不可变，更新电路必须升版本。

当前已实现的 `lib/eda/module-package.ts` 只做**结构入库预检**，还没有用户上传、目录发布或自动放置模块的网页功能。预检验证文件路径与大小、文件 SHA-256、版本/审核字段、入口 `.kicad_sch` 和原理图顶层 `hierarchical_label` 与 manifest 端口一一对应，并返回由规范化 manifest 派生的 `packageSha256` 供项目固定版本。返回 `nativeCheckRequired: true`，表示 KiCad CLI 网表/ERC、库/封装解析、数据手册和人工复核仍是发布门槛；任何人都不能靠填写 `review` 字段直接让模块进入可生成目录。

交付包的 `manifest.json` 字段：

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | 数值 `1` |
| `moduleId`, `version` | 如 `team.power-input` 与语义版本 `1.0.0`；发布后不可重用同版本改内容 |
| `review` | `reviewer`、ISO 日期 `reviewedAt`、来源 `source`；入库人员必须外部核对，不能自我证明 |
| `entrySchematic` | 包内唯一入口 `.kicad_sch` 相对路径 |
| `files` | 每个附件的相对路径、角色、SHA-256；角色可为 schematic、symbol_library、footprint_library、project、datasheet 或 pcb_design_block |
| `ports` | 稳定 `id`、显示 `name`、唯一 KiCad `hierarchical_label`、`direction`、`signal`、`required`；可加电压范围 `voltage.min/max` |

首版预检只接收**单页**模块，拒绝入口原理图中的嵌套 `sheet` 和 `global_label`。请在子原理图中为每个对外连接放置一个层级标签，使名字与端口 `label` 完全一致、图形方向与 `direction` 一致。请一并提供符号/封装来源、器件型号与数据手册、供电范围/电流预算、复位与启动条件、PCB 布局约束，以及至少一个人工确认的连接样例；这些资料用于后续电气审核，不因结构预检通过而自动获批。

后续入库流程将把包放在隔离暂存区，执行 KiCad 9 打开/导出网表/ERC、验证对外端口与预期内部网络、检查 footprint 焊盘对应关系，并由硬件负责人审批。工程组合器只使用已获批版本的端口，不让模型直接编辑模块内部。任何格式不兼容、端口冲突或审核缺项都应阻止发布，保留原包供修正。
