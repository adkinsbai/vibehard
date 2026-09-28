# BOM 价格依据留痕发布（2026-09-28）

## 范围

新方案的模型 JSON 结构校验后，独立方案 Worker 按精确型号将服务端报价快照或模型估算写进该任务既有 JSONB 结果；模型自己写的价格依据字段会被剥离。方案页面/Markdown 和项目 BOM/CSV 优先读取保存值。旧方案不回填虚构历史价，而标明供应商报价是“当前参考”。这不接入实时采购/库存接口，不验证电气设计，也不改变 90 秒模型硬截止。

## 代码与候选

- 功能 PR #17 与独立发布闸门 PR #18 已合并。#18 在 CI 未完成时合并，因此直到默认分支的 Verify 全绿才开始生产候选。最终构建源：`9d5d65cff38ba0b4e16d04d2fb203046df3935e3`；CI 包含类型、全仓测试/构建与两个隔离 PostgreSQL 数据库的权限、方案持久化和跨进程读回测试。
- 本地功能回归 307 项通过、16 项按条件跳过，服务 bundle、`/vibehard` 前端构建、类型/定向 lint 通过。归档 SHA-256：`d392023b937a6bcb44a4dd6731b3f1a7dca556838e23f68ab03ec8a1d811e3a1`；方案 Worker bundle SHA-256：`7f0580fc4ce09d0516d84fab836ee8aad890404c7f2e1e167d6692bbc82236be`。相对旧平台 `20260928-project-dashboard-v1`，仅 7 个 BOM 相关运行时文件改变；完整 PCB/Demo 覆盖与源码指纹保留。
- 新 release 为 `/opt/vibehard/releases/20260928-bom-price-freeze-v1/`。独立 3211 候选通过登录/PCB v0.2 及渲染 bundle/Demo 18 个资源与五段录屏、BOM 匿名权限校验；Worker bundle 语法与哈希通过。此预检没有运行付费模型或生产 Worker 的新任务。

## 正式切换与边界

- 切换前确认方案及 Agent 活跃任务均为零；root-only PostgreSQL 自定义格式 dump 和原平台/Worker unit 均已备份并验真。只切换 `vibehard.service` 和 `vibehard-design-worker.service`。正式 3210 与公网复核同样通过，两个新 unit 均 active、`NRestarts=0`，PID `1006632/1006630`，3211 无监听。
- 受限检索、云端 Runner、Gateway、VibeBoard、EDA manager 原 PID 均保持不变。发布后只读心跳：cloud-runner 约 13 秒、device-runner 约 14 秒；Gateway 8787 仍有两个已建立连接。知识控制指针 SHA-256 `0e3c50149fc05232c0886988321ee075942461b7c4815e023380d3b3079713de`、停用清单 SHA-256 `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`；未激活索引或修改 OSS/模型配置。服务器余量约 4.6 GB。
- 无生产浏览器登录态，所以真实用户项目卡、旧/新 BOM 页面与 CSV 未做点击验收；本轮也未发新的付费模型请求。CI 隔离库与匿名公网检查不等于生产用户端到端。需在用户登录后核对已有项目、旧方案“当前参考”提示及新生成方案的 `priceRecorded=true`、Markdown/CSV 同价和来源日期。

## 回滚

零活跃任务时，使用原有平台环境文件运行 `/opt/vibehard/releases/20260928-bom-price-freeze-v1/scripts/deploy-staged-platform.mjs /opt/vibehard/releases/20260928-bom-price-freeze-v1 rollback`。脚本恢复旧平台 `20260928-project-dashboard-v1` 与旧 Worker `20260928-audit-fixes-v1` 的两个 unit；本次没有迁移数据库，不要把备份 dump 覆盖到回滚期间产生的新数据。新任务结果内的可选报价字段为附加 JSON，不影响旧版读取。
