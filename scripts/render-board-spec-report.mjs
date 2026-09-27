// Render the review outcome. This report is evidence for the displayed board
// feature tags, not an electrical qualification or a claim of bench testing.
import { readFileSync, writeFileSync } from 'node:fs';
const specs = JSON.parse(readFileSync(new URL('../lib/server/data/board-spec-evidence.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog.json', import.meta.url), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const original = new Map(catalog.map(board => [board.name, board]));
const totalClaims = specs.boards.reduce((sum, board) => sum + board.features.length, 0);
const excluded = specs.boards.flatMap(board => board.excludedResources.map(path => ({ board: board.name, path })));
const rows = specs.boards.map(board => {
  const before = original.get(board.name);
  if (!before) throw new Error(`Missing original board: ${board.name}`);
  return `<tr><td>${escape(board.name)}</td><td>${escape(board.category)}</td><td>${escape(board.features.join('、') || '未确认额外板级特性')}</td><td><a href="${escape(board.sourceUrl)}">官方型号页</a>${board.supplementalSourceUrl ? ` / <a href="${escape(board.supplementalSourceUrl)}">补充型号页</a>` : ''}</td><td>${escape(board.note ?? '—')}</td><td>${before.resources.length} 条源目录引用；排除 ${board.excludedResources.length} 条</td></tr>`;
}).join('\n');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESP32-S3 板卡规格核对报告 - ${specs.sourceDate}</title><style>body{font:15px/1.6 system-ui,-apple-system,sans-serif;max-width:1200px;margin:0 auto;padding:24px;color:#172033}h1,h2{line-height:1.25}h2{margin-top:2em;border-bottom:1px solid #ccd5e2;padding-bottom:.3em}.notice{background:#eaf3ff;border:1px solid #9fc6ff;border-radius:10px;padding:14px}.muted{color:#59677b}.scroll{overflow:auto;max-height:68vh}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #dde3ea;padding:8px;text-align:left;vertical-align:top}thead{position:sticky;top:0;background:#fff}a{color:#1768d5}</style></head><body><h1>ESP32-S3 板卡规格核对报告</h1><p class="muted">${specs.sourceDate} · 仅核对知识库页面展示的板级特性及资料归属，不是 61 款板卡的全部电气参数或实物验证。</p><div class="notice">61 款有原件证据的型号均已有官方页面来源；页面展示 ${totalClaims} 项资料支持的板级特性。5 条属于其他触摸变体的原理图已从错误型号的网页关联排除。无法确定的 SKU/版本参数不对外断言；OSS 原件与既有 RAG 索引未被删除或修改。</div>
<h2>芯片识别</h2><p>目录均为 ESP32-S3 开发板或基于其模组的产品。芯片通用能力不自动等于板载外设；板级特性以准确 SKU 的产品页、Features 与 Onboard Resources 为准。芯片级背景可参见 <a href="https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s3/">乐鑫 ESP32-S3 硬件设计指南</a>。</p>
<h2>硬件开发资料</h2><p>优先使用逐板 <a href="https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-1.43">微雪官方型号资料</a>与相同 PCB 版本的原理图；本地 767 条源目录引用的原件大小和 SHA-256 与私有 OSS 批次快照相同。型号歧义的 5 条原理图见下表，其余有共用系列资料的型号在逐板备注中限定适用范围。</p>
<h2>软件开发资料</h2><p>小智 AI 与 MicroPython 属于生态/示例，不再作为“已装配硬件特性”。示例工程仍可能依赖特定 PCB 版本；不能用代码示例单独证明实际器件配置。</p>
<h2>烧录编程 / 量产测试资料</h2><p>按实际 PCB 丝印、BOOT/USB/UART 接线及厂商对应版本指南确认刷写方法。此报告未进行固件烧录、引脚逐网核验或量产测试，不宣称电气认证。</p>
<h2>关键修正</h2><ul><li>LCD-1.9 基础款不是触摸 SKU；LCD-2.8 官方明确配电容触摸屏；AMOLED-1.91 是无触摸 SKU；LCD-Driver-Board 是显示驱动板。</li><li>“4G Cat-1”“GNSS 定位”等旧标签改为有依据的“4G 模组”“GNSS 天线接口”；扬声器、麦克风区分器件、焊盘和接口。</li><li>对官方页面混合 V1/V2、BOX/标准款、Touch/非 Touch 的型号保留逐板提示，不把可选附件写成标配。</li></ul>
<h2>排除的变体文件</h2><table><thead><tr><th>原归属型号</th><th>已核对文件路径</th><th>处理</th></tr></thead><tbody>${excluded.map(item => `<tr><td>${escape(item.board)}</td><td>${escape(item.path)}</td><td>仅从该型号的网页关联中排除；原件未删除</td></tr>`).join('')}</tbody></table>
<h2>最小下载集</h2><p>具体工程选型还需对应 SKU/PCB 版本的产品页、原理图、引脚表、关键器件手册与同版示例。页面没有对全部 ZIP 内代码与每页 PDF 做功能测试。</p>
<h2>推荐阅读顺序</h2><p>先按板卡型号和 PCB 丝印定位官方页面，再看本表的特性/变体提示，随后核对同版本原理图和示例；实际工程最后进行上板测量。</p>
<h2>缺失或风险项</h2><ul><li>2 款旧目录型号在当前私有批次没有可用原件证据，因此不展示。</li><li>页面只核对当前展示的外设标签；RAM/Flash 容量、分辨率、引脚、电流等尚未作为结构化字段展示，也未逐板实测。</li><li>厂商个别页面内部有相互矛盾的配置描述；这些参数未被做成页面事实。RAG 索引尚未按本次 5 条 UI 排除同步修改。</li><li>索引状态为导入批次快照，不是实时 OSS/检索可用性承诺。</li></ul>
<h2>逐板来源与展示规格</h2><p class="muted">官方页面内容 SHA-256 记录在私有服务端规格快照；链接指向厂商原文，便于复查。</p><div class="scroll"><table><thead><tr><th>型号</th><th>分类</th><th>已核对的展示特性</th><th>来源</th><th>变体/版本提示</th><th>资料关联</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>\n`;
writeFileSync(new URL('../docs/board-spec-verification-2026-09-26.html', import.meta.url), html);
console.log(JSON.stringify({ boards: specs.boards.length, featureClaims: totalClaims,
  excludedVariantReferences: excluded.length }));
