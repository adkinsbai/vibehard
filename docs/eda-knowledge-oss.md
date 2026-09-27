# EDA 资料库：OSS 只读接入与数据盘点

核查日期：2026-09-27。这里的“资料库”是 OSS 中的文档快照，不是平台 PostgreSQL 中的可放置器件库。没有发现名为 CRL 的服务；可调用的是阿里云 OSS API，以及本分支新增的已登录 `GET /api/eda/knowledge?q=...`。若“CRL”指 `curl`，部署并开启后可通过该 HTTP 接口查询。

## 当前数据

只读查询 `ldcx-dataset` 共 291 个对象，约 8.08 GB；其中 286 个去重原始对象、1 个原始清单、4 个处理产物。处理清单有 439 份文档：402 份允许自动建索引、37 份隔离，生成 20,582 个可索引片段。分类计数为固件 204、手册 121、板级资料 79、原理图 35；这四类包含隔离来源，不能直接作为可用器件数。原始清单共 801 个来源别名，主要是 PDF 和压缩包。

处理集没有 KiCad 原理图、PCB、符号、封装等原生文件。35 份“原理图”是 PDF/文本参考资料。抽查三个 ESP32-S3 相关 ZIP，见到 PDF、STP、DWG 或固件源码，未见原生 KiCad 文件；该抽样不能证明其余 ZIP 均无原生文件。资料明显集中于 ESP32-S3，不能称器件覆盖全面。处理清单标注 `manualReview: false`，自动索引许可仅表示可检索，不表示引脚、电气参数、封装或 PCB 通过硬件审核。

本机可用标准 OSS bucket endpoint 只读访问并验证清单、片段 SHA-256；所提供接入点从本机返回 `AccessPointNetworkTypeInvalid`。本机 `.env.local` 的 PostgreSQL 指向 `127.0.0.1`，连接时返回 `ECONNREFUSED`；本轮没有生产 PostgreSQL 凭据/SSH 通道，因此没有把生产表行数说成已核查。仓库 schema 目前没有器件/原理图模块目录表。生产数据库的真实行数和业务数据覆盖仍需在具备只读权限的环境单独盘点。

## 接入方式

服务端使用 `ali-oss`，读取固定 key 的处理清单，并用环境变量固定清单 SHA-256。再读取清单指向的 `chunks.jsonl.gz`，检查压缩字节数和 SHA-256、来源身份、分类与片段数量，筛掉隔离来源。进程内缓存 15 分钟。查询只匹配片段正文，返回最多 10 个去重来源、页码和最多 600 字摘录，不返回原始 OSS 凭据。API 要求平台登录并限制每用户每分钟 20 次；Agent 每次提案取最多 3 条，把来源与摘录传给设计模型，提案页面显示来源。

按 `.env.example` 配置 `EDA_KNOWLEDGE_*`、`OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET`。`EDA_KNOWLEDGE_OSS_MANIFEST_KEY` 与 `EDA_KNOWLEDGE_OSS_MANIFEST_SHA256` 必须对应同一处理清单。默认 `EDA_KNOWLEDGE_ENABLED=false`；配置好只读身份、网络入口、固定哈希并复测后再启用。密钥只放在服务端受限环境，不放浏览器、仓库、日志或测试夹具。建议使用仅允许读取目标处理前缀的 RAM 身份；若使用接入点，先验证所在云主机的网络类型与授权。这里没有写入 OSS，也没有迁移 PostgreSQL。

有只读环境变量的运维人员可先运行 `pnpm exec tsx scripts/inspect-eda-knowledge.ts`，获得当前清单 key、SHA-256、可检索/隔离数量和三类查询的来源；脚本不输出密钥或资料正文。如果将来有多个处理清单，须显式指定 `EDA_KNOWLEDGE_OSS_MANIFEST_KEY`，不要自动取“最新”作为生产依据。

示例（先在本机登录平台，再替换会话 Cookie；不要把 Cookie 提交到仓库）：

```sh
curl -H 'Cookie: <platform-session-cookie>' 'https://ldcx.tech/vibehard/api/eda/knowledge?q=ESP32-S3%20reset'
```

未登录返回 401；资料库未启用、配置不完整、对象不可读或哈希不符返回 503，不以空结果假装成功。即使检索成功，Agent 仍只能放置当前受控 KiCad 器件库的 7 类器件。PDF 检索不能自动变成可拖放模块。原生模块上线需按 [模块交付契约](eda-module-contract.md)提供 KiCad 文件、端口映射、哈希、ERC/网表和人工审核。PCB 模块、广泛器件库以及生产 PostgreSQL 数据盘点仍是后续工作。

## 本轮验证边界

真实 OSS Node SDK 调用连续完成三类查询：ESP32-S3 复位资料、SIM7670X 板级资料、缺失的 STM32F4 原理图。前两类返回带来源和页码的结果；第三类在收紧器件型号匹配后应返回空。单元测试覆盖隔离来源排除、对象篡改、来源不一致、结果边界、登录/限流、Agent 引用传递和页面来源展示。公网接口与云端真实模型基于 OSS 的完整提案尚未发布验收。
