// Candidate extractor for a bounded set of board-level features. Its output is
// deliberately NOT consumed by the product: every row needs SKU/PCB review.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sources = JSON.parse(readFileSync(join(tmpdir(), 'vibehard-board-spec-audit', 'sources.json'), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog-evidence.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog.json', import.meta.url)));
const visible = new Set(catalog.filter(board => board.resources.some(item => evidence.resources[item.path])).map(board => board.name));

// Only headings that describe this product or its populated board. Generic
// capability, programming examples, and external-device tables are excluded.
const boardSection = /^(introduction|Features|Onboard Resources|Hardware Description|Product Overview)/i;
const rules = [
  ['4G 模组', /\bonboard (?:A7670E|SIM7670G)[^.;]{0,60}\b4G|\b(?:A7670E|SIM7670G) 4G communication module/i],
  ['LoRa 收发器', /\bLR1121\b[^.;]{0,50}\b(?:LoRa|transceiver)|\b(?:LoRa|transceiver)[^.;]{0,50}\bLR1121\b/i],
  ['TF 卡槽', /\bTF (?:Card )?[Ss]lot\b|\bTF card slot\b/i],
  ['六轴 IMU', /\bQMI8658\b|\b6.axis (?:IMU|sensor|inertial)|\bsix.axis (?:IMU|sensor|inertial)|\bonboard IMU\b/i],
  ['RTC 时钟', /PCF85063|\bonboard RTC\b|\bRTC (?:clock )?chip\b/i],
  ['温湿度传感器', /\bSHTC3\b|\btemperature and humidity sensor\b/i],
  ['音频处理芯片', /\b(?:ES8311|ES7210|PCM5101|ES8388|ES8389)\b|\baudio (?:codec|decoder|ADC)(?: chip| circuit)?\b/i],
  ['电源管理芯片', /\bAXP2101\b|\bpower management chip\b|\bpower management IC\b/i],
  ['电池充电管理', /\bbattery (?:charging|charge\/discharge|charge and discharge) management (?:chip|module|circuit)\b|\blithium battery (?:recharge|charge)\/discharge (?:header|interface)\b|\bbattery charging (?:circuit|interface)\b|\blithium battery (?:charging management chip|recharge management circuit)\b|\bbattery header.{0,110}supports charging and discharging\b|\blithium battery charging interface\b|\bETA609[68]\b/i],
  ['电池连接口', /\blithium battery (?:header|connector)\b|\bbattery header\b|\b18650 battery holder\b/i],
  ['麦克风', /\bdual.microphone (?:array|design)\b|\bonboard microphone\b(?! and speaker interfaces)|\bmicrophone for audio capture\b|\bmicrophone microphone input\b|\bmicrophone onboard analog microphone\b/i],
  ['麦克风接口', /\bmicrophone and speaker interfaces\b|\bmicrophone (?:header|connector|interface)\b/i],
  ['扬声器接口', /\bspeaker (?:header|connector|interface)\b|\bexternal speaker interface\b|\baudio connectors.{0,120}speaker output\b/i],
  ['扬声器焊盘', /\bonboard speaker pads\b/i],
  ['板载扬声器', /\bonboard speaker(?:,|\.)|\bspeaker onboard audio output\b/i],
  ['摄像头接口', /\bon.?board camera interface\b|\bonboard \d+PIN DVP camera interface\b|\bDVP camera interface\b|\b(?:FPC|connector) (?:interface )?for cameras\b/i],
  ['CAN 接口', /\bCAN (?:transceiver|interface|header)\b|\bonboard CAN[, ]|TJA1051/i],
  ['RS485 接口', /\bRS.?485\b/i],
  ['GNSS 天线接口', /\bGNSS IPEX1 connector\b|\bGNSS antenna (?:connector|interface)\b/i],
  ['RGB LED', /\bWS2812(?:B)?\b|\bonboard RGB LED\b/i],
  ['RGB LED 矩阵', /\bRGB LED matrix\b|\barray of 64 RGB LEDs\b/i],
  ['蜂鸣器', /\bbuzzer\b/i],
  ['太阳能充电接口', /\bonboard solar charging interface\b/i],
];

const rows = sources.filter(source => visible.has(source.name)).map(source => {
  const sections = source.sections.filter(section => boardSection.test(section.heading));
  const claims = rules.flatMap(([label, pattern]) => {
    const hit = sections.map(section => ({ section, match: pattern.exec(section.text) })).find(item => item.match);
    if (!hit) return [];
    return [{ label, heading: hit.section.heading,
      excerpt: hit.section.text.slice(Math.max(0, hit.match.index - 45), hit.match.index + hit.match[0].length + 55) }];
  });
  const intro = source.sections.find(section => section.heading === 'introduction')?.text ?? '';
  return { name: source.name, sourceUrl: source.url, sourceSha256: source.sha256,
    sourceStatus: source.status, oldFeatures: source.existingFeatures,
    variantCaution: /without touch|touch version|V2 version|V1 version|different versions|available in both|Standard Version.*BOX|touch control, without/i.test(intro), claims };
});
if (rows.length !== evidence.counts.visibleBoards) throw new Error('Visible board count changed');
const output = new URL('../docs/board-spec-review-draft-2026-09-26.json', import.meta.url);
writeFileSync(output, `${JSON.stringify({ warning: 'Automatic candidates; not validated specifications or release data', rows }, null, 2)}\n`);
console.log(JSON.stringify({ boards: rows.length, claims: rows.reduce((sum, row) => sum + row.claims.length, 0),
  variantCautions: rows.filter(row => row.variantCaution).length, output: output.pathname }));
