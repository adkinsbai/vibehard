// Publish a dated, board-specific *documentation* snapshot after reviewing the
// short official-page excerpts in docs/board-spec-review-draft-2026-09-26.json.
// This never changes OSS, the RAG index, or a live deployment.
import { readFileSync, writeFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog.json', import.meta.url)));
const resourceEvidence = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog-evidence.json', import.meta.url)));
const reviewed = JSON.parse(readFileSync(new URL('../docs/board-spec-review-draft-2026-09-26.json', import.meta.url)));
const visible = catalog.filter(board => board.resources.some(resource => resourceEvidence.resources[resource.path]));
const candidates = new Map(reviewed.rows.map(row => [row.name, row]));

// Confirmed corrections to the supplied directory, not automatic guesses from
// chip-level capability or a product family's other SKU.
const categoryChanges = {
  'ESP32-S3-AMOLED-1.91': 'AMOLED屏',
  'ESP32-S3-LCD-2.8': 'LCD触摸屏',
  'ESP32-S3-LCD-Driver-Board': '显示驱动板',
};
// These two board pages abbreviate the touch feature in their text. Their
// matching, separately named product SKUs explicitly document the fitted IC.
const supplementalSources = {
  'ESP32-S3-Touch-AMOLED-2.16': 'https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm',
  'ESP32-S3-Touch-LCD-2.8B': 'https://www.waveshare.com/esp32-s3-touch-lcd-2.8b.htm',
};
const oldFeatureEquivalents = {
  '4G Cat-1': ['4G 模组'], // Cat-1 itself is not asserted by the source.
  'GNSS 定位': ['GNSS 天线接口'],
  'SD 卡槽': ['TF 卡槽'],
  '电池管理': ['电池充电管理', '电池连接口'],
  '六轴 IMU': ['六轴 IMU'],
  '扬声器': ['板载扬声器', '扬声器焊盘', '扬声器接口'],
  '触摸屏': ['触摸屏'],
  '音频编解码': ['音频处理芯片'],
  '麦克风': ['麦克风', '麦克风接口'],
  'RTC 时钟': ['RTC 时钟'],
  '电源管理': ['电源管理芯片'],
  '电容触摸': ['触摸屏'],
  'CAN 收发器': ['CAN 接口'],
  RS485: ['RS485 接口'],
  LoRa: ['LoRa 收发器'],
  '摄像头': ['摄像头接口'],
};
const discardedOldFeatures = {
  'ESP32-S3-Touch-AMOLED-1.75': { 'GNSS 定位': '仅 G/GPS 变体装配 LC76G' },
  'ESP32-S3-LCD-1.9': { '电容触摸': '无触摸基础款，原目录误引 Touch 原理图' },
  'ESP32-S3-LCD-Driver-Board': { '电容触摸': '触摸屏连接兼容不等于板载触摸屏' },
  'ESP32-S3-Touch-LCD-1.85B': { 'RTC 时钟': '当前型号页未确认 RTC 芯片' },
  'ESP32-S3-Touch-LCD-1.85C': { '六轴 IMU': '当前 V2 型号页未确认 IMU' },
  'ESP32-S3-Touch-LCD-4.3': { 'RTC 时钟': 'RTC 未在当前型号页确认' },
  'ESP32-S3-Touch-LCD-4.3B': { 'RTC 时钟': 'RTC 电池座不证明装有 RTC 芯片' },
  'ESP32-S3-Touch-LCD-7C-BOX': { '麦克风': '音频采集接口不等于标配麦克风' },
};
const cautions = {
  'ESP32-S3-A7670E-4G': 'A7670E 型号；GNSS 仅确认天线接口，不把它写成已装 GPS 模组。系列原理图需按 PCB 版本核对。',
  'ESP32-S3-SIM7670G-4G': 'SIM7670G 型号；GNSS 仅确认天线接口。系列原理图需按模块/PCB 版本核对。',
  'ESP32-S3-AMOLED-1.91': '此型号为无触摸 SKU；官方页面同时覆盖 Touch 版本，不能把后者的触摸参数写入本款。',
  'ESP32-S3-Touch-AMOLED-1.75': 'GPS/LC76G 仅在特定 G 版本上，不能作为所有 1.75 型号的共同特性。',
  'ESP32-S3-Touch-AMOLED-1.8': 'V1/V2 显示驱动和触摸芯片不同，选用示例或引脚时须核对背面版本。',
  'ESP32-S3-LCD-1.9': '此型号是无触摸 SKU；资料包中的 Touch-LCD-1.9 原理图不作为本款的对应板级资料展示。',
  'ESP32-S3-LCD-2': '资料包中的 Touch-LCD-2 原理图不作为无触摸 SKU 的对应板级资料展示；官方页面的屏幕尺寸文字有内部冲突。',
  'ESP32-S3-LCD-2.8': '官方型号页写明本款配有电容触摸屏，按 LCD 触摸屏分类。',
  'ESP32-S3-LCD-2.8C': '资料包中的 Touch-LCD-2.8C 原理图属于触摸命名变体，未证明本款装配触摸屏。',
  'ESP32-S3-LCD-Driver-Board': '兼容电容触摸屏的接口，不代表此驱动板本身装配触摸屏。',
  'ESP32-S3-Touch-LCD-1.54': '官方说明触摸/非触摸 SKU 共用其余功能；基础款命名的原理图只作系列主板资料，触摸面板仍需对应 SKU。',
  'ESP32-S3-Touch-LCD-1.85B': '官方当前资料只确认扬声器焊盘，未确认 RTC 芯片或标配扬声器。',
  'ESP32-S3-Touch-LCD-1.85C': 'V1/V2 已切换；当前官方页面未明确确认旧目录标注的六轴 IMU，且 BOX 电池/扬声器不代表标准款标配。',
  'ESP32-S3-Touch-LCD-3.49': 'V1/V2 背光、触摸中断和 LCD 引脚不同；不能混用版本示例。',
  'ESP32-S3-Touch-LCD-4.3': '官方页合并触摸与非触摸 SKU，资源表也混有无触摸接线说明；此处按精确 Touch 型号展示。',
  'ESP32-S3-Touch-LCD-5': '官方页同时覆盖触摸/非触摸和不同屏幕分辨率 SKU；本目录不宣称统一分辨率。',
  'ESP32-S3-Touch-LCD-7C-BOX': '音频为板载编解码/采集芯片及外接接口；未把扬声器或麦克风写成标配板载器件。',
  'ESP32-S3-DualEye-LCD-1.28': '厂商页面含触摸功能描述，但本型号与 Touch SKU 分列；不据此声称基础款带触摸。',
  'ESP32-S3-CAM-OVxxxx': '此目录项覆盖多款相机模组 SKU，仅确认板上 DVP 摄像头接口，不宣称固定传感器型号。',
  'ESP32-S3-Pico': '传感器套件中的器件不是 Pico 基础板板载外设。',
  'ESP32-S3-ePaper-1.54': '官方页区分 V1/V2、触摸/非触摸 SKU；Touch 版原理图不作为基础款精确型号资料。',
  'ESP32-S3-ePaper-1.54G': '资料包中的 Touch-ePaper-1.54 原理图不能证明本 G 型号的触摸或完全同版布线。',
  'ESP32-S3-ePaper-13.3E6': '官方页面的模组/存储参数自相矛盾；本目录不展示未经一致核对的存储规格。',
};
const exclude = {
  'ESP32-S3-LCD-1.9': ['LCD屏/ESP32-S3-LCD-1.9/1. 硬件资料/ESP32-S3-Touch-LCD-1.9-Schematic.pdf'],
  'ESP32-S3-LCD-2': ['LCD屏/ESP32-S3-LCD-2/1. 硬件资料/ESP32-S3-Touch-LCD-2-SchDoc.pdf'],
  'ESP32-S3-LCD-2.8C': ['LCD屏/ESP32-S3-LCD-2.8C/1. 硬件资料/ESP32-S3-Touch-LCD-2.8C_schematic_diagram.pdf'],
  'ESP32-S3-ePaper-1.54': ['电子纸屏/ESP32-S3-ePaper-1.54/1. 硬件资料/ESP32-S3-Touch-ePaper-1.54-Schematic.pdf'],
  'ESP32-S3-ePaper-1.54G': ['电子纸屏/ESP32-S3-ePaper-1.54G/1. 硬件资料/ESP32-S3-Touch-ePaper-1.54-Schematic.pdf'],
};

const rows = visible.map(board => {
  const source = candidates.get(board.name);
  if (!source || !/^https:\/\/docs\.waveshare\.com\/ESP32-S3-/.test(source.sourceUrl) ||
      !/^[a-f0-9]{64}$/.test(source.sourceSha256) ||
      !['exact', 'mismatch'].includes(source.sourceStatus)) throw new Error(`Missing official source: ${board.name}`);
  if (source.sourceStatus === 'mismatch' && board.name !== 'ESP32-S3-DEV-KIT-N8R8') {
    throw new Error(`Family source needs review: ${board.name}`);
  }
  const features = [...new Set(source.claims.map(claim => claim.label))];
  // Exact Touch SKU names are checked against their official board pages. The
  // LCD-2.8 is the one documented touch SKU without "Touch" in its name.
  const touchSku = /-Touch-(?:AMOLED|LCD)-/.test(board.name) || board.name === 'ESP32-S3-LCD-2.8';
  if (touchSku) features.push('触摸屏');
  // Every legacy claim is accounted for. Software ecosystem labels are not
  // board hardware; all other removals need a specific model-level reason.
  for (const old of board.features) {
    if (['小智 AI', 'MicroPython'].includes(old)) continue;
    if (oldFeatureEquivalents[old]?.some(label => features.includes(label))) continue;
    if (!discardedOldFeatures[board.name]?.[old]) {
      throw new Error(`Unreviewed legacy hardware claim: ${board.name}: ${old}`);
    }
  }
  const omitted = exclude[board.name] ?? [];
  for (const path of omitted) {
    if (!board.resources.some(resource => resource.path === path) || !resourceEvidence.resources[path]) {
      throw new Error(`Excluded variant path was not in the source: ${path}`);
    }
  }
  return { name: board.name, category: categoryChanges[board.name] ?? board.category,
    features: [...new Set(features)], sourceUrl: source.sourceUrl, sourceSha256: source.sourceSha256,
    supplementalSourceUrl: supplementalSources[board.name] ?? null,
    note: cautions[board.name] ?? null, excludedResources: omitted };
});
if (rows.length !== resourceEvidence.counts.visibleBoards || candidates.size !== rows.length ||
    rows.some(row => row.features.includes('小智 AI') || row.features.includes('MicroPython')) ||
    Object.keys(discardedOldFeatures).some(name => !rows.some(row => row.name === name))) {
  throw new Error('Board spec coverage mismatch');
}
const output = new URL('../lib/server/data/board-spec-evidence.json', import.meta.url);
writeFileSync(output, `${JSON.stringify({ schema: 'vibehard-board-spec-evidence/v1',
  sourceDate: '2026-09-26', basis: 'Waveshare board/model pages; documentation evidence, not physical bench validation',
  boards: rows }, null, 2)}\n`);
console.log(JSON.stringify({ boards: rows.length, claims: rows.reduce((sum, row) => sum + row.features.length, 0),
  excludedVariantReferences: rows.reduce((sum, row) => sum + row.excludedResources.length, 0), output: output.pathname }));
