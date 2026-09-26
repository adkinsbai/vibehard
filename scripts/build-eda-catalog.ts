// Reproducible extraction from an installed official KiCad library, never generated pinouts.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseSExpression, type SExpression } from '../lib/eda/sexpr';
import { childForms } from '../lib/eda/native-forms';
type Node = SExpression[];
const children = (node: Node, tag: string) => node.filter((v): v is Node => Array.isArray(v) && v[0] === tag);
const child = (node: Node, tag: string) => children(node, tag)[0] ?? [];
const property = (node: Node, name: string) => String(children(node, 'property').find(v => v[1] === name)?.[2] ?? '');
const configs = [
  ['r0603', 'Device', 'R', 'Resistor_SMD:R_0603_1608Metric', '1k'],
  ['c0603', 'Device', 'C', 'Capacitor_SMD:C_0603_1608Metric', '100nF'],
  ['led0603', 'Device', 'LED', 'LED_SMD:LED_0603_1608Metric', 'LED'],
  ['header2', 'Connector_Generic', 'Conn_01x02', 'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical', 'Conn_01x02'],
  ['header4', 'Connector_Generic', 'Conn_01x04', 'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical', 'Conn_01x04'],
  ['esp32wroom32', 'RF_Module', 'ESP32-WROOM-32', '', 'ESP32-WROOM-32'],
  ['tmp102', 'Sensor_Temperature', 'TMP102xxDRL', '', 'TMP102xxDRL'],
];
async function main() {
  const root = process.argv[2]; const sourceVersion = process.argv[3];
  if (!root || !/^KiCad \d+\.\d+\.\d+$/.test(sourceVersion || '')) throw new Error('Pass the KiCad share/kicad directory and exact source version, for example KiCad 9.0.8');
  const catalog: Record<string, unknown> = {};
  for (const [kind, library, name, configuredFootprint, value] of configs) {
    const file = await readFile(join(root, 'symbols', `${library}.kicad_sym`), 'utf8');
    const symbol = childForms(file).find(form => form.startsWith(`(symbol "${name}"`));
    if (!symbol) throw new Error(`Missing ${library}:${name}`);
    const tree = parseSExpression(symbol) as Node;
    if (child(tree, 'extends').length) throw new Error('Inherited symbol needs explicit expansion');
    const footprintId = configuredFootprint || property(tree, 'Footprint');
    const [fpLibrary, fpName] = footprintId.split(':');
    const footprint = await readFile(join(root, 'footprints', `${fpLibrary}.pretty`, `${fpName}.kicad_mod`), 'utf8');
    const fp = parseSExpression(footprint) as Node;
    const pads = children(fp, 'pad').map(pad => ({ id: String(pad[1]), type: String(pad[2]), shape: String(pad[3]), x: Number(child(pad, 'at')[1]), y: Number(child(pad, 'at')[2]), rotation: Number(child(pad, 'at')[3] || 0), width: Number(child(pad, 'size')[1]), height: Number(child(pad, 'size')[2]), drill: Number(child(pad, 'drill')[1] || 0) }));
    const pins = children(tree, 'symbol').flatMap(unit => children(unit, 'pin')).map(pin => {
      const id = String(child(pin, 'number')[1]); const pad = pads.find(p => p.id === id);
      if (!pad) throw new Error(`Missing physical pad for ${name}.${id}`);
      return { id, name: String(child(pin, 'name')[1]), x: Number(child(pin, 'at')[1]), y: -Number(child(pin, 'at')[2]), pcbX: pad.x, pcbY: pad.y, electrical: String(pin[1]), angle: Number(child(pin, 'at')[3]), length: Number(child(pin, 'length')[1]) };
    });
    const graphics = children(tree, 'symbol').flatMap(unit => unit.filter((v): v is Node => Array.isArray(v) && ['rectangle', 'polyline', 'circle', 'arc'].includes(String(v[0]))));
    const xExtent = Math.max(2, ...pins.map(p => Math.abs(p.x)));
    const yExtent = Math.max(2, ...pins.map(p => Math.abs(p.y)));
    catalog[kind] = { kind, name, prefix: property(tree, 'Reference'), defaultValue: value, description: property(tree, 'Description'), symbol: { width: xExtent * 2, height: yExtent * 2 }, footprint: { name: footprintId, width: Math.max(...pads.map(p => Math.abs(p.x) + p.width / 2)) * 2, height: Math.max(...pads.map(p => Math.abs(p.y) + p.height / 2)) * 2, padWidth: pads[0].width, padHeight: pads[0].height }, pins, native: { libraryId: `${library}:${name}`, symbol, footprint, pads, graphics, sourceVersion, sha256: createHash('sha256').update(symbol + footprint).digest('hex') } };
  }
  await mkdir('lib/eda/catalog', { recursive: true });
  await writeFile('lib/eda/catalog/parts.json', JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Extracted ${Object.keys(catalog).length} official symbol/footprint pairs`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
