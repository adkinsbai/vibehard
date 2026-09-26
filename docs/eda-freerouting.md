# Freerouting 候选板适配器

`lib/eda/freerouting.ts` 是独立的原生 PCB 自动布线作业接口。调用者提供已保存、已授权的 KiCad 工程快照文件清单和全新私有 `jobRoot`；适配器在 `baseline/` 与 `candidate/` 各复制一份，输出 DSN、运行固定版本 Freerouting CLI 生成 SES，再用 KiCad 9 `pcbnew` Python 导入候选板。它返回候选板和 SHA-256 证据，不发布或覆盖用户正在编辑的工程，也不替代账号/工程归属校验。

```ts
import { routeBoardCandidate } from '@/lib/eda/freerouting';

const result = await routeBoardCandidate({
  sourceRoot: savedProjectDirectory,
  jobRoot: freshPrivateJobDirectory,
  boardFile: 'circuit.kicad_pcb',
  projectFiles: [
    'circuit.kicad_pcb', 'circuit.kicad_sch', 'circuit.kicad_pro',
    'sym-lib-table', 'fp-lib-table',
  ],
  tools: {
    kicadCli: '/usr/bin/kicad-cli',
    python: '/usr/bin/python3', // 必须能 import pcbnew
    java: '/usr/bin/java',
    freeroutingJar: '/opt/eda/freerouting-2.4.1.jar',
    freeroutingJarSha256: pinnedReleaseDigest,
  },
  signal: abortController.signal,
});
// result.candidateBoard 仅供审阅。发布须由上层重新检查工程版本与全部源文件哈希。
```

`projectFiles` 是调用者明确批准的相对文件清单，须包含与 PCB 同名的 `.kicad_sch` 和 `.kicad_pro`；层级图和工程库表也要列入。拒绝绝对路径、`..`、符号链接、重复项及不支持的扩展名。单文件最多 50 MiB、总量最多 200 MiB、最多 200 个文件。`jobRoot` 必须是与源目录分离且尚不存在的目录。候选作业产生的报告保留在 `jobRoot/artifacts`，上层负责私有存储、作业清理和访问控制。

在布线前后均执行 `kicad-cli pcb drc --format json --severity-all --schematic-parity --exit-code-violations`。基线原理图一致性必须为零，且必须有未连接项；候选须减少未连接项、保持原理图一致性为零，并且其他 DRC 项按严重度与类型不得增加。KiCad 原生板结构指纹还比较铜层数、网络、封装与焊盘的位置/属性，以及板上绘图与板框；仅接受走线与过孔变化。作业结束前重新计算全部源文件 SHA-256，若编辑器在此期间保存过工程，则拒绝该候选。DRC 及指纹是结构门槛，不表示电气、信号完整性或可制造性已由工程师确认。

进程参数均以数组传递，不经 shell。每次 KiCad 检查和 Python 桥接限时 60 秒；Freerouting 限时 300 秒，Java 堆限 512 MiB、可见处理器限 1、优化线程限 1、pass 限 10；输出缓冲限 1 MiB，报告限 2 MiB。禁用 Freerouting GUI、API、文件日志和匿名分析，配置目录留在私有作业目录。**Java 堆上限不是整个进程的硬内存上限**；生产调度器还须给作业容器设置 CPU/内存/临时磁盘硬限制、单并发与取消/清理策略。适配器不会自行启动共享服务或访问网络 API。

工具缺失、jar 摘要不匹配、未产出 DSN/SES、命令非零退出、超时/取消、无效 KiCad 报告或检查劣化均返回错误，不会伪造“路由成功”。当前仓库未捆绑 Freerouting jar，且本 Windows 进程无法直接调用 KiCad CLI，因此本机只验证了单元测试与 WSL KiCad 9.0.8 的 DSN 导出/板指纹；**尚未运行真实 Freerouting 路由及 SES 导入回环**。上层连接正式工程时，须在隔离 worker 中用固定双层板执行成功、超时、取消、基线冲突与劣化样本验收，再开放采纳入口。

命令依据：[Freerouting v2.4.1 CLI](https://github.com/freerouting/freerouting/blob/v2.4.1/docs/command_line_arguments.md)、[KiCad 9 CLI](https://docs.kicad.org/9.0/en/cli/cli.pdf)、[KiCad 9 `pcbnew` Python API](https://docs.kicad.org/doxygen-python-9.0/namespacepcbnew.html)。KiCad 9 CLI 提供 DRC，但 DSN/SES 使用 `pcbnew.ExportSpecctraDSN` 和 `pcbnew.ImportSpecctraSES`。
