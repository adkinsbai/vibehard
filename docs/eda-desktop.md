# KiCad / noVNC 工作台

2026-09-26：云端多账号隔离版已部署至 [ldcx.tech/vibehard/eda](https://ldcx.tech/vibehard/eda)，当前平台 release 为 `20260926-eda-grid-v1`。每个账号的每个工程拥有独立容器和持久卷；同一工程多个标签页重连同一桌面。真实设计模型已生成受控提案并导出原生 KiCad 文件，修复网格坐标后 KiCad ERC 0 项；示例 PCB 尚未布线，DRC 报 3 项未连接。具体测量与限制见 [云端验收记录](eda-cloud-acceptance-2026-09-26.md)。下文“本机”段落保留开发环境的启动与历史验收。

## 组成和数据流

- 开源部分：KiCad 9.0.8、与其版本一致的官方符号/封装库、TigerVNC、Openbox、noVNC 1.7.0。先前 KiCad 10 库数据导出的器件文件不能由本机 KiCad 9 加载，已重建受控的 7 类器件库。
- 本项目新增：Next 工程权限入口、Python 桌面会话服务、一次性连接票据、原生文件存储/下载/检查、工作台界面。
- 浏览器 → 同源 `/vibehard/eda-desktop/ws` → 云端 manager WebSocket 桥 → 工程专属容器虚拟显示器中的 KiCad。本地开发可用 `/eda-desktop/ws` 连接单用户 broker。
- 平台现有登录和 `ownedProject` 检查负责工程归属；浏览器仅获得 60 秒有效、单次消费的票据。服务凭据只在服务端读取。
- 原生 `.kicad_sch`、`.kicad_pcb`、`.kicad_pro` 是新工作台的数据源，重连不会从旧 JSON 覆盖它们。旧草稿迁移只复制到新工程。
- 右侧 Agent 使用平台已有的设计模型设置和受控编辑命令。模型返回的命令先经服务端校验，再在浏览器展示具体器件/连接/走线修改；用户确认后形成草稿，最后导出原生 KiCad 文件并新建工程。不会在当前 KiCad 窗口中直接修改未保存内容。

## 本机启动

本次已安装 Ubuntu 26.04 / WSL 中的 KiCad、VNC 依赖，以及独立 PostgreSQL 18。没有修改现有 Windows PostgreSQL 5432；新数据库使用 5438。

在仓库根目录的两个 PowerShell 终端运行：

```powershell
# 终端一：启动 KiCad 服务；保持终端运行
./scripts/start-eda-desktop.ps1

# 终端二：启动网页；保持终端运行
pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3212
```

打开 `http://127.0.0.1:3212/eda`，登录平台、选择工程后打开，或新建空白工程。

本机配置已写入忽略的 `.env.local`、`.eda-data/desktop-token` 和 `.eda-data/desktop-data-root`，不要提交或复制给他人。脚本保留其他环境设置。更改端口后必须重启 Next；非默认网页地址还需同步配置服务 `EDA_DESKTOP_ORIGINS`。

实际原生文件根目录是 WSL 用户 `adkins` 的 `/home/adkins/.local/share/vibehard-eda-native`，下分账号 UUID / 工程 UUID。新机器未配置时默认 `~/.local/share/vibehard-desktop`。`-DataRoot` 参数会保存在忽略的本机设置中，后续启动复用。

PostgreSQL 应随 WSL 启动；如果 5438 不可用，先检查 `wsl -d Ubuntu --exec pg_lsclusters`，再按需要启动既有 `18/main`。不要重建数据库或删掉 owner 文件来解决登录归属问题。没有 `DATABASE_URL` 时平台回落内存存储，重启会丢失账号/项目索引，无法可靠找回原生工程。

### 新机器依赖

本次验证使用 Ubuntu 软件仓库，不使用来源不明的桌面镜像：

```sh
sudo apt-get update
sudo apt-get install kicad kicad-symbols kicad-footprints tigervnc-standalone-server openbox python3-aiohttp xdotool xauth dbus-x11 fonts-noto-cjk
```

服务必须由普通 Linux 用户启动，不接受 root。已有平台数据库可直接配置 `DATABASE_URL` 并使用既有迁移。需要独立本地数据库时，先安装 PostgreSQL，检查现有 cluster/端口，准备独立 cluster，再用 `services/eda-desktop/setup_local_db.py <仓库 .env.local 的 Linux 路径>` 生成专用角色/数据库。该辅助脚本默认连接 5438，拒绝覆盖既有配置/同名数据库；不会安装 PostgreSQL 或改 cluster 端口。完成后在 Windows 仓库运行 `node --env-file=.env.local --import tsx scripts/migrate.ts`。

## 使用和保存

- 原理图/PCB 按钮打开或切换实际 KiCad 窗口。首次启动加载官方库可能需要一些时间。
- 移动、旋转、连线和布线使用 KiCad 原生工具。PCB 交互布线不等于自动完成整板布线；没有新增 Freerouting 集成。
- 顶部保存按钮向当前编辑器发送 Ctrl+S；应关闭属性/保存对话框，分别保存原理图和 PCB。发送快捷键不等于已经保存成功。
- 刷新已保存文件，查看磁盘内容。下载 ZIP 含原生文件和 SHA-256 清单，只包含已经保存的内容；关联子页和本地库文件若位于工程目录且扩展名受支持，也会归档。
- 网页导入仅支持一份单页 `.kicad_sch` 和/或一份 `.kicad_pcb`，单文件 900 KB。完整多页 ZIP、自定义库包、立创/PDF 尚不支持。
- 点击顶部“Agent 画图”可收起或展开右侧对话。管理员需先在“模型设置”配置设计模型；页面显示真实可用状态。描述电路后，审阅命令清单和器件/网络草稿，再点“加入设计草稿”及“创建并打开 KiCad 工程”。云端已用真实模型验证基础 LED 电路提案、原生文件及 KiCad ERC；PCB 未自动布线。
- “读取当前已保存原理图”调用 KiCad CLI 从磁盘文件导出网表，只读建立新草稿。当前只支持受控的 7 类官方库器件和简单单页结构；遇到未支持的器件、文本或多单元符号会明确拒绝，原工程不变。本次验收工程包含 `4xxx:4001`，因此目前不能导入 Agent 草稿；KiCad 原生编辑仍可正常打开。
- ERC/DRC 运行真实 `kicad-cli`，检查磁盘版本。DRC 现在带 `--schematic-parity`，同时检查 PCB 与同名已保存原理图是否一致；项目首次打开时补齐缺失的官方库表，不覆盖已有自定义库表。退出码 5 表示发现违规，0 表示该次检查未报违规，不构成电路可制造或功能正确的保证。检查失败会报错，不返回旧报告。
- 页面关闭/断线不会终止 KiCad；重新选择工程并连接即可恢复。结束会话会关闭程序，未保存编辑会丢失，界面有明确确认。
- 正常关闭服务会清理会话。强制杀进程/WSL 故障可能遗留子进程或锁，尚未实现崩溃后的自动回收。此时先核对属于该服务的进程，勿批量结束其他桌面。

## 已有验收证据

- 浏览器使用实际 KiCad 放置电阻、把值改成 `470R`，在 PCB 放置官方 `R_0603_1608Metric` 封装，分别保存。
- 下载 ZIP 的原生文件中核对到以上内容。服务 SIGTERM 正常退出后重新启动，原生文件保留，浏览器重新打开仍可见该封装。
- `scripts/verify-eda-desktop.ts` 验证实际 HTTP 401/403、RFB 握手、票据重用 401、工程 ZIP、真实 ERC/DRC，并比较重连/导出/检查前后源文件哈希一致。
- 旧版验收项目 ERC 退出 5，而默认 DRC 退出 0；后者遗漏原理图一致性，不能代表整工程通过。本轮同一项目补跑原生 `--schematic-parity` 后退出 5、发现 3 项不一致。受控的两针接口—电阻—LED 电路经 KiCad 9 原生 ERC/DRC/一致性检查均退出 0；把 PCB 连接器编号改错后 DRC 退出 5、发现 2 项不一致。该受控电路只是检查链路的测试输入，不是已验证可生产硬件。
- 本轮完整 EDA 定向回归（包含 Windows KiCad 原生检查）：63 项通过，无跳过；Python 服务 9 项通过，TypeScript/定向 ESLint/生产构建通过。全仓 126 项通过、2 项 Windows 符号链接权限 `EPERM` 失败、2 项跳过；不能称全绿。逐项结果和未通过项见 [2026-09-25 验收记录](eda-acceptance-2026-09-25.md)。

验收脚本默认查找人工编辑的“KiCad 原生编辑验收”工程，使用平台已有的非生产开发登录，不自动造示例或覆盖工程：

```powershell
node --env-file=.env.local --import tsx scripts/verify-eda-desktop.ts
python -m unittest discover -s services/eda-desktop -p test_server.py
```

脚本产生的核对 ZIP 位于忽略的 `.eda-data/desktop-verification.zip`。脚本登录地址默认 127.0.0.1:3212。

## 仍未完成

1. Agent 已能生成提案并新建原生工程，但不支持就地修改当前 KiCad 工程，也没有原生文件差异预览、版本冲突处理或全器件库覆盖。旧 Agent 仍服务旧版文档，不能声称它会控制新 KiCad 会话。
2. 本机单用户 broker 仍只用于可信本地环境；生产现使用独立的云端 manager 和每工程 worker。当前单机容量上限为 3 个运行工程、每账号 2 个，没有队列、自动扩容或文件系统硬配额。
3. 原生工程的制造文件应在 KiCad 内生成；旧 JSON Gerber API 没有自动迁移到此原生数据源。当前网页下载入口提供原生工程，不宣称提供制造包。
4. 未验收移动端完整桌面操作、复杂层次原理图/外部模型打包、长期稳定性和真实硬件功能。该产品不规划跨账号共同编辑同一工程。

下一阶段优先做已保存原生工程的差异预览、检查、版本冲突处理和受控就地应用，同时扩展器件库和无损导入；PCB 自动布线需单独实现并经真实 DRC 验收。
