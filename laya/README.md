# Laya 本地部署

2026-09-25 已部署在本机 Mac mini M4 / 16 GB，使用 MPS GPU。云服务器只读检查为 2 vCPU、7.4 GiB RAM、约 5.4 GiB available，未发现 `nvidia-smi`；为避免与现有服务争抢 CPU，本阶段选择本机实验部署。云端未安装软件或修改服务。

按用户指定，全部部署文件现集中在项目根目录 `laya/`；运行环境和模型在其子目录 `laya/.runtime/`，该子目录已被 Git 忽略。迁移后后台服务重新启动，并于 2026-09-25 12:33 北京时间完成一次真实推理复验：三类合成中文样例 3/3，预热后十次短请求中位数 38.0 ms。以下 11:56 数据为迁移前记录。

## 运行配置

- 服务：用户 LaunchAgent `tech.ldcx.laya`，登录时自动启动，异常退出自动重启；不是无人登录即可运行的系统服务。Mac 休眠/关机时不可用。
- 地址：`http://127.0.0.1:8766`；只监听回环，未接入云端平台 RAG。
- 健康：`GET /health`；部署信息：`GET /deployment`；接口文档：`GET /docs`。
- 推理：`POST /v1/systemone`，需本机私有 API key；`request.py` 自动读取，不输出 key。
- Laya `0.3.20`，Python `3.12.13`，Torch `2.14.0`，Transformers `5.17.0`；全部依赖固定在 `requirements.lock`。
- 模型：`convaiinnovations/laya-multilingual`，revision `e4e9ddf21a7b1903b7acffd8814ad4307bf63a67`。
- 权重 SHA256：`9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204`。
- 启动后完全离线，只加载这一个模型；明确拒绝其他模型，英文请求也固定走多语言模型。
- 上下文 2,048 tokens，正文最多 1,750 tokens，最多 8 个问题，正文字符上限 12,000，请求体上限 128 KiB。超限返回错误，正文不会静默截断。模型本身的题目/选项编码仍有预算限制，使用简短的少量选项。
- 使用上游 `laya.serve` 的串行推理执行器；默认不做公网服务或大批量并发。

## 路径

源码与锁文件在项目根目录的 `laya/`。模型、虚拟环境、下载缓存、密钥、日志和测试报告在其下被 Git 忽略的 `laya/.runtime/`；总占用约 2.1 GiB，其中模型约 663 MiB、虚拟环境约 721 MiB、下载缓存约 720 MiB。

实际 LaunchAgent：`/Users/hushaohong/Library/LaunchAgents/tech.ldcx.laya.plist`。模型路径绑定当前工作区；移动或删除项目目录前应先停止服务并重新安装配置。

## 调用与验证

```sh
cd /Users/hushaohong/vibehard
laya/.runtime/venv/bin/python laya/request.py laya/example.json
laya/.runtime/venv/bin/python laya/verify.py
curl --noproxy '*' http://127.0.0.1:8766/health
```

复制 `example.json` 并修改 `state`/`questions` 即可测试自己的短资料。示例是虚构器件，不是正式器件选型结论。

2026-09-25 11:56 北京时间后台服务实测：

- `/health` 返回 `ok`、`multilingual`、`mps`；监听只在 `127.0.0.1:8766`。
- 三条中文样例的支持/冲突/信息不足全部符合预期。
- 无 token 返回 401，非多语言模型返回 422，过大正文返回 413，超过 token 限制返回 422。
- 10 次同一短请求，HTTP 中位数 32.3 ms，范围 30.2–40.4 ms；该轮首条样例 595.4 ms。先前前台测试预热中位数 22.7 ms。不同输入长度、后台负载和预热状态会改变结果。
- 记录：`laya/.runtime/verification.json`。只有合成小样例，不是硬件选型精度、长文档、压力测试或平台端到端验收。

## 启停

```sh
# 状态
launchctl print gui/$(id -u)/tech.ldcx.laya
# 重启
launchctl kickstart -k gui/$(id -u)/tech.ldcx.laya
# 停止本次登录会话中的服务
launchctl bootout gui/$(id -u)/tech.ldcx.laya
# 再次启动
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/tech.ldcx.laya.plist"
```

停止后下次登录仍会自动加载。要取消后续自动启动，停止并移走该 plist；其他服务不受影响。启动时需先加载模型，健康接口尚未就绪期间连接失败属于启动阶段，不能仅凭 LaunchAgent 的 running 判定模型就绪。

日志：`laya/.runtime/service.stderr.log`、`laya/.runtime/service.stdout.log`；不开请求访问日志，不记录正文或 API key。

## 在同类 Mac 上重建

从仓库根目录运行；需要 Python 3.12、uv 和一次联网下载。

```sh
uv venv --python python3.12 laya/.runtime/venv
UV_CACHE_DIR="$PWD/laya/.runtime/uv-cache" uv pip sync --python laya/.runtime/venv/bin/python laya/requirements.lock
HF_HOME="$PWD/laya/.runtime/hf-cache" HF_HUB_DISABLE_XET=1 laya/.runtime/venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('convaiinnovations/laya-multilingual',
    revision='e4e9ddf21a7b1903b7acffd8814ad4307bf63a67',
    local_dir='laya/.runtime/model',
    allow_patterns=['*.json', 'model.safetensors', 'README.md'], max_workers=2)
PY
shasum -a 256 laya/.runtime/model/model.safetensors
# 核对权重哈希和 8766 端口空闲后安装；首次会创建只读给当前用户的密钥文件。
laya/.runtime/venv/bin/python laya/install-agent.py
```

固定版本源码已作静态读取，未改上游依赖。平台 Next.js、数据库、Runner、Gateway、云端发布均未变更；以后正式接 RAG 需要独立的准确率及流程对照验证。
