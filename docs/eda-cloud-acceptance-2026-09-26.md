# 云端 KiCad / noVNC 发布与验收，2026-09-26

## 当前发布

- 公网入口：`https://ldcx.tech/vibehard/eda`。平台 release：`/opt/vibehard/releases/20260926-eda-grid-v1`，前一版 `20260925-eda-isolated-v2`。发布提交 `7cdc6e0`；没有数据库迁移。
- KiCad 9.0.8 在独立 Docker worker 内运行。平台 Next 服务校验登录态与工程归属；私有 manager 发放一次性票据并转发 WebSocket。nginx 仅公开同源 `/vibehard/eda-desktop/ws`；不公开 VNC 控制端口。
- 隔离单位是 `(账号 ID, 工程 ID)`。每个工程有自己的容器和持久卷；同一账号同一工程的多个标签页连接同一桌面。这里没有多人共同编辑工程的产品场景。
- 当前容量配置：全机最多 3 个运行工程、每账号最多 2 个；worker 1280 MB、0.5 CPU、128 PID、只读根文件系统及非 root UID 10001；30 分钟空闲回收。软件扫描阻止已超 256 MB 的项目继续启动，并预留主机 2 GB 空间；这不是文件系统硬配额。满额返回 429，没有排队或自动扩容。
- 数据位置：`/var/lib/vibehard-eda/projects/<owner>/<project>/data`。平台和 manager 的鉴权配置在服务器 root-only 环境文件中；本仓库不保存口令或生产会话。

## 本次真实验收

1. 三个独立测试账号同时启动三个不同 worker，各有不同容器 IP 和卷；跨账号工程请求 404、错误账号 WebSocket 403、票据重放 401。三个并行 KiCad 桌面均完成 RFB 握手；同一工程三个窗口也完成握手。
2. 三个工程的空白原生文件经实际 KiCad CLI 检查 ERC/DRC 均为 0；原生 ZIP 包含 5 个文件且哈希对应已保存源文件。manager 重启保留 worker 容器 ID 和文件哈希；停止后重新启动，已保存原理图修改和下载哈希仍一致。
3. 使用正式公网 HTTPS 和普通测试账号复测登录态、工程归属、WebSocket/RFB、ERC/DRC、下载。测试账号、数据库记录、容器和专属卷已在验收后清理。
4. 正式配置的设计模型 `deepseek-v4-pro` 对基础 LED 电路请求返回 6 条有效修改命令：3 个器件和 3 个网络连接。受控命令生成 KiCad 原理图与 PCB 文件，云端工程保存文件的哈希与导出一致。首次真实 ERC 报 3 个 `endpoint_off_grid`，定位为模型给出的符号中心未按 KiCad 1.27 mm 连接网格对齐。提交 `7cdc6e0` 后，对同一份提案重新导出并由云端 KiCad 检查，ERC 0 项。PCB 尚无走线，DRC 仍如实报告 3 个 `unconnected_items`，原理图一致性 0 项。上线后经公网再次得到同样结果。
5. 候选发布先因遗漏 `NEXT_PUBLIC_BASE_PATH=/vibehard` 而在目标路径返回 404，未切换正式服务。按线上子路径重建后，候选 `/vibehard/eda`、`/vibehard/login` 均为 200，根路径 `/eda` 为 404；再切换正式服务。公网两入口为 200，已有工程会话继续运行。候选端口已关闭。

网格修复后的定向 EDA 测试 65 通过、2 跳过，包含导出/再导入坐标回归；Python manager/worker 测试 20 通过；TypeScript 检查和线上子路径生产构建通过。之前的全仓测试为 237 通过、2 个既有 Windows 符号链接 `EPERM` 失败、13 跳过；没有把它称为全绿。KiCad 实跑和公网请求是本次发布的验收依据，但尚未完成登录后的人工浏览器拖动、保存和复杂工程长时间操作回归。

## 边界与下一步

- Agent 当前是“提案 → 审阅 → 新建原生工程”，不能直接修改正在打开的 KiCad 文件；现有原生工程复杂导入、无损差异预览和冲突处理还需要实现。
- PCB 能用 KiCad 手动编辑和布线；Agent 示例仅生成元件与网络，未自动布通 PCB。DRC 的未连接项需实际布线后再消除。Freerouting/自动布线没有接入。
- 受控官方库目前 7 类器件；立创 EDA、PDF、复杂多页/自定义库导入、制造文件与原生工程全链路、真实硬件功能都未完成验收。ZIP 与 Gerber 输出不是制造批准。
- 容量是当前单机固定上限；上线更多用户需要硬存储配额、排队或扩容、备份恢复与监控告警。普通用户的工程数据不应混放到平台 release。

## 运维与回滚

查看平台和管理器状态：`systemctl status vibehard.service vibehard-eda-manager.service`。先确认活跃桌面和已保存文件，再回滚平台代码；工程卷与 manager 数据应保留。此修复只更改平台发布包，回滚不需要恢复数据库或改 nginx：

```sh
cp /opt/vibehard/releases/20260926-eda-grid-v1/backup/vibehard.service.before /etc/systemd/system/vibehard.service
systemctl daemon-reload
systemctl restart vibehard.service
```

回滚后检查 `/vibehard/eda`、已有账号工程访问和公网 RFB；旧版本重新导出模型坐标时会再出现网格 ERC 问题，原先已保存的修正文件不会被覆盖。
