// Read-only vendor-page triage. A keyword hit is a review candidate, never a
// validated board specification or an authorization to publish.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sources = JSON.parse(readFileSync(join(tmpdir(), 'vibehard-board-spec-audit', 'sources.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog.json', import.meta.url)));
const evidence = JSON.parse(readFileSync(new URL('../lib/server/data/board-catalog-evidence.json', import.meta.url)));
const visible = new Set(catalog.filter(board => board.resources.some(resource => evidence.resources[resource.path])).map(board => board.name));

const rules = [
  ['4G', /\b(?:A7670E|SIM7670G)\b.{0,50}\b4G\b|\b4G\b.{0,50}\b(?:A7670E|SIM7670G)\b/i],
  ['LoRa', /\bLR1121\b|\bLoRa\b/i],
  ['GNSS', /\bGNSS\b/i],
  ['CAN 接口', /\bCAN (?:interface|transceiver|header)\b|\bTJA1051\b/i],
  ['RS485 接口', /\bRS.?485\b/i],
  ['TF 卡槽', /\b(?:TF|SD) card slot\b/i],
  ['RTC 芯片', /\bPCF85063\b|\bRTC (?:clock|real.time) chip\b/i],
  ['六轴 IMU', /\bQMI8658\b|\b(?:6|six).axis (?:IMU|sensor|inertial)\b/i],
  ['温湿度传感器', /\bSHTC3\b|temperature and humidity sensor/i],
  ['音频编解码芯片', /\bES8311\b|\bES8389\b|\baudio codec chip\b/i],
  ['音频 ADC', /\bES7210\b|\baudio ADC\b/i],
  ['摄像头接口', /\b(?:DVP |OV )?camera interface\b|\bcamera connector\b/i],
  ['电池接口或充电', /\bbattery (?:charg|header|connector|management)|\blithium battery (?:charg|header|connector)|\bcharg(?:e|ing)\/discharg/i],
  ['RGB LED', /\bWS2812\w*\b|\bRGB LEDs?\b/i],
  ['蜂鸣器', /\bbuzzer\b/i],
];
const relevantSection = /^(introduction|Features|Specifications|Onboard Resources|Hardware Description|Product Overview)/i;
const rows = sources.filter(source => visible.has(source.name)).map(source => {
  const sections = source.sections.filter(section => relevantSection.test(section.heading));
  const candidates = rules.flatMap(([label, pattern]) => {
    const match = sections.map(section => ({ section, match: pattern.exec(section.text) })).find(item => item.match);
    if (!match) return [];
    const start = Math.max(0, match.match.index - 90);
    return [{ label, section: match.section.heading,
      excerpt: match.section.text.slice(start, match.match.index + match.match[0].length + 100) }];
  });
  const oldHardware = source.existingFeatures.filter(feature => !['小智 AI', 'MicroPython'].includes(feature));
  return {
    name: source.name,
    sourceUrl: source.url,
    sourceSha256: source.sha256,
    sourceStatus: source.status,
    oldHardware,
    removedSoftwareLabels: source.existingFeatures.filter(feature => ['小智 AI', 'MicroPython'].includes(feature)),
    candidates,
  };
});
if (rows.length !== evidence.counts.visibleBoards) throw new Error('Visible board count changed');
const output = new URL('../docs/board-spec-candidates-2026-09-26.json', import.meta.url);
writeFileSync(output, `${JSON.stringify({ generatedAt: '2026-09-26', warning: 'Automatic triage only; not approved for release', boards: rows }, null, 2)}\n`);
console.log(JSON.stringify({ boards: rows.length, candidateClaims: rows.reduce((sum, row) => sum + row.candidates.length, 0), output: output.pathname }));
