import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JSDOM } from 'jsdom';

const boards = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog.json', import.meta.url)));
const evidence = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog-evidence.json', import.meta.url)));
const cacheDir = join(tmpdir(), 'vibehard-board-spec-audit');
mkdirSync(cacheDir, { recursive: true });

const rows = [];
for (const board of boards) {
  const slug = encodeURIComponent(board.name);
  const url = `https://docs.waveshare.com/${slug}`;
  const htmlPath = join(cacheDir, `${board.name}.html`);
  if (!existsSync(htmlPath)) {
    const result = spawnSync('curl', ['-fLsS', '--max-time', '20', '--retry', '1', '-o', htmlPath, url], { encoding: 'utf8' });
    if (result.status !== 0) {
      rows.push({ name: board.name, url, status: 'fetch_failed', error: result.stderr.trim() });
      console.log(`${rows.length}/${boards.length} ${board.name}: fetch_failed`);
      continue;
    }
  }

  const html = readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html);
  const article = dom.window.document.querySelector('article');
  const h1 = article?.querySelector('h1')?.textContent?.trim() ?? '';
  const title = dom.window.document.title;
  const status = h1.toLowerCase().includes(board.name.toLowerCase()) ? 'exact' : 'mismatch';
  const content = article?.querySelector('.theme-doc-markdown') ?? article;
  const sections = [];
  let heading = 'introduction';
  let lines = [];
  const flush = () => {
    if (lines.length) sections.push({ heading, text: lines.join(' ').replace(/\s+/g, ' ').trim() });
    lines = [];
  };
  for (const child of content?.children ?? []) {
    if (/^H[1-6]$/.test(child.tagName)) {
      flush();
      heading = child.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    } else if (child.tagName !== 'NAV') {
      const value = child.textContent?.replace(/\s+/g, ' ').trim();
      if (value) lines.push(value);
    }
  }
  flush();
  rows.push({
    name: board.name,
    category: board.category,
    existingFeatures: board.features,
    url,
    title,
    h1,
    status,
    sha256: createHash('sha256').update(html).digest('hex'),
    sections,
  });
  console.log(`${rows.length}/${boards.length} ${board.name}: ${status}`);
}

writeFileSync(join(cacheDir, 'sources.json'), `${JSON.stringify(rows, null, 2)}\n`);
console.log(`source audit: ${join(cacheDir, 'sources.json')}`);

const htmlEscape = value => String(value).replace(/[&<>"']/g, match => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[match]);
const visible = new Set(boards.filter(board => board.resources.some(resource => evidence.resources[resource.path])).map(board => board.name));
const critical = new Map([
  ['ESP32-S3-Touch-AMOLED-1.43', '官方列有 TF 卡槽，旧特性遗漏。'],
  ['ESP32-S3-LCD-1.9', '基础 SKU 为无触摸版，旧特性却写“电容触摸”；触摸只适用于另一 SKU。'],
  ['ESP32-S3-LCD-2', '本地“硬件资料”仅有 Touch-LCD-2 原理图；官方概述还把尺寸写成 1.47 英寸、规格写成 2 英寸。'],
  ['ESP32-S3-LCD-2.8', '官方页面写电容触摸，旧目录归为非触摸 LCD；本地原理图文件名也为 Touch-LCD-2.8。'],
  ['ESP32-S3-ePaper-13.3E6', '官方概述/特性与原理图为 WROOM-2-N32R16V，官方资源表却写 WROOM-1-N16R8。'],
  ['ESP32-S3-DualEye-LCD-1.28', '厂商页面提到触摸，名称与 Touch 版区分不清；不可直接转成基础版规格。'],
]);
const sourceTable = rows.map(row => {
  const direct = row.status === 'exact' || row.name === 'ESP32-S3-DEV-KIT-N8R8';
  const state = !visible.has(row.name) ? '不展示：无可用原件证据' : direct ? '官方页已定位，规格待复核' : '来源需核对';
  return `<tr><td>${htmlEscape(row.name)}</td><td>${htmlEscape(row.category ?? '')}</td><td><a href="${htmlEscape(row.url)}">厂商页面</a></td><td>${htmlEscape(state)}</td><td>${htmlEscape(critical.get(row.name) ?? '')}</td></tr>`;
}).join('\n');
const report = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESP32-S3 板卡规格来源核验 - 2026-09-26</title><style>body{font:15px/1.6 system-ui,-apple-system,sans-serif;max-width:1160px;margin:0 auto;padding:28px;color:#172033}h1,h2{line-height:1.25}h2{margin-top:2.3em;border-bottom:1px solid #ccd5e2;padding-bottom:.3em}.warn{background:#fff1ed;border:1px solid #ffb3a4;border-radius:10px;padding:14px 18px}.muted{color:#56647a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.stat{padding:14px;border:1px solid #d9e1ed;border-radius:10px}.stat strong{display:block;font-size:24px;color:#1768d5}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #dce2eb;padding:8px;text-align:left;vertical-align:top}thead{position:sticky;top:0;background:white}a{color:#1768d5}.scroll{overflow:auto;max-height:65vh}</style><h1>ESP32-S3 板卡规格来源核验</h1><p class="muted">2026-09-26 · 本地审查记录。厂商网页是核验线索，不能等同于逐板实物测试。</p><div class="warn"><strong>发布闸门未通过，不能切换生产页面。</strong> 当前目录特性有确定的漏项、变体混用和源文件错配；下面的板卡列表仅表示已找到官方资料页面，不表示每款硬件规格已逐项验收。</div><div class="grid"><div class="stat"><strong>${visible.size}</strong>款有原件证据的板卡</div><div class="stat"><strong>${rows.filter(row => visible.has(row.name) && (row.status === 'exact' || row.name === 'ESP32-S3-DEV-KIT-N8R8')).length}</strong>款已定位到对应厂商页面/型号系列</div><div class="stat"><strong>${boards.filter(board => visible.has(board.name) && board.features.some(feature => ['小智 AI','MicroPython'].includes(feature))).length}</strong>款混入软件生态标签</div><div class="stat"><strong>${critical.size}</strong>款已有明确的关键规格或来源冲突</div></div><h2>芯片识别</h2><p>目录覆盖 ESP32-S3 系列板卡；同一产品页可能含多个 SKU 或 PCB 版本。不能把 ESP32-S3 芯片通用能力直接当作某块板上已装配外设。<a href="https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s3/">乐鑫 ESP32-S3 硬件设计指南</a>仅用于芯片级交叉检查。</p><h2>硬件开发资料</h2><table><thead><tr><th>优先级</th><th>来源</th><th>本轮核验</th></tr></thead><tbody><tr><td>1</td><td><a href="https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-1.43">微雪板卡官方页面</a></td><td>型号、SKU、Features、Onboard Resources、版本注记逐项比对</td></tr><tr><td>2</td><td>资料包内板级原理图 PDF</td><td>已视觉检查 ePaper-13.3E6 三页、LCD-2 一页；其余需继续按型号/版本检查</td></tr><tr><td>3</td><td>原件 OSS 内容哈希与 RAG 索引</td><td>仅证明原件存在及可检索，不证明型号/电气参数正确</td></tr></tbody></table><h2>软件开发资料</h2><table><thead><tr><th>资料</th><th>用途</th><th>注意</th></tr></thead><tbody><tr><td>厂商示例程序</td><td>确认外设初始化和 PCB 版本差异</td><td>小智 AI、MicroPython 是软件生态，不应放入硬件特性筛选</td></tr><tr><td>乐鑫 ESP-IDF</td><td>核对芯片支持能力</td><td>软件支持不等于板载部件</td></tr></tbody></table><h2>烧录编程 / 量产测试资料</h2><table><thead><tr><th>资料</th><th>用途</th><th>注意</th></tr></thead><tbody><tr><td>板卡官方刷写指南</td><td>USB/UART、BOOT、固件版本</td><td>不同 SKU / PCB 版本不能混用示例</td></tr><tr><td>板级原理图与引脚表</td><td>连接器和启动脚位复核</td><td>型号不匹配的原理图不得当成该板规格证据</td></tr></tbody></table><h2>关键不一致</h2><table><thead><tr><th>板卡</th><th>发现</th></tr></thead><tbody>${[...critical].map(([name, issue]) => `<tr><td><a href="https://docs.waveshare.com/${htmlEscape(name)}">${htmlEscape(name)}</a></td><td>${htmlEscape(issue)}</td></tr>`).join('')}</tbody></table><h2>最小下载集</h2><p>每一具体 SKU / PCB 版本至少需要：对应的官方产品页、同版本原理图、引脚表、相关外设资料和对应示例。共用芯片手册不能代替板级原理图。</p><h2>推荐阅读顺序</h2><p>先确认产品 SKU 与 PCB 丝印版本，再看官方 Features / Onboard Resources，再核对同版本原理图和示例程序，最后录入可证实的页面规格及出处。</p><h2>缺失或风险项</h2><ul><li>来源目录的特性集合并非已核验规格：至少有确定漏项和软硬件混标。</li><li>部分“硬件资料”文件名实际属于另一触摸/非触摸变体，不能仅凭 OSS 路径归属判定规格。</li><li>厂商自身页面存在摘要与资源表矛盾，需以板级原理图/实物版本解决；尚未逐页检查全部 61 款。</li><li>不应把“接口/排针支持外接”写成板载传感器、摄像头或扬声器。</li></ul><h2>检索证据（逐板来源表）</h2><p class="muted">60 款页面 H1 与目录型号一致，1 款 DEV-KIT 使用包含 N8R8 的 NXRX 型号系列页；2 款无可用 OSS 原件的目录条目不拟展示。厂商页面抓取结果有 SHA-256 留在本机临时审查缓存，重跑脚本可复核。</p><div class="scroll"><table><thead><tr><th>目录型号</th><th>现分类</th><th>官方来源</th><th>核验状态</th><th>关键问题</th></tr></thead><tbody>${sourceTable}</tbody></table></div></html>`;
const reportPath = new URL('../docs/board-spec-verification-2026-09-26.html', import.meta.url);
writeFileSync(reportPath, report);
console.log(`HTML report: ${reportPath.pathname}`);
