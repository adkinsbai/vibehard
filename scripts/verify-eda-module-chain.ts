import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import manifest from '../lib/eda/modules/sample-led/manifest.json';
import { validateModulePackage, verifyModuleNetlist } from '../lib/eda/module-package';
import { createEmptyDocument } from '../lib/eda/document';
import { createComponent, pinPosition } from '../lib/eda/library';
import { applyEditBatch } from '../lib/eda/commands';
import { exportKicadPcb, exportKicadSchematic } from '../lib/eda/kicad';
import { importNativePcb, importNativeSchematic } from '../lib/eda/kicad-import';

const execute = promisify(execFile);
const sourceDirectory = 'lib/eda/modules/sample-led';
const outputDirectory = '.eda-data/module-chain-verification';
const native = async (args: string[]) => {
  const command = process.platform === 'win32' ? 'wsl.exe' : process.env.KICAD_CLI_PATH || 'kicad-cli';
  const fullArgs = process.platform === 'win32' ? ['-e', 'kicad-cli', ...args] : args;
  try { await execute(command, fullArgs, { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true }); return 0; }
  catch (error) {
    const failure = error as Error & { code?: number };
    if (typeof failure.code === 'number') return failure.code;
    throw error;
  }
};
const nativeVersion = async () => {
  const command = process.platform === 'win32' ? 'wsl.exe' : process.env.KICAD_CLI_PATH || 'kicad-cli';
  const args = process.platform === 'win32' ? ['-e', 'kicad-cli', '--version'] : ['--version'];
  return (await execute(command, args, { timeout: 5_000, maxBuffer: 64_000, windowsHide: true })).stdout.trim();
};
const violations = (report: { sheets?: { violations?: { type: string; description: string }[] }[]; violations?: { type: string; description: string }[] }) => [
  ...report.sheets?.flatMap(sheet => sheet.violations ?? []) ?? [],
  ...report.violations ?? [],
];

async function main() {
  const payloads = Object.fromEntries(await Promise.all(manifest.files.map(async file => [file.path, await readFile(join(sourceDirectory, file.path))] as const)));
  const intake = validateModulePackage(manifest, payloads);
  await mkdir(outputDirectory, { recursive: true });
  const moduleNetlistPath = `${outputDirectory}/module.net`;
  assert.equal(await native(['sch', 'export', 'netlist', '--output', moduleNetlistPath, `${sourceDirectory}/module.kicad_sch`]), 0);
  const moduleNetlist = await readFile(moduleNetlistPath, 'utf8');
  const topology = verifyModuleNetlist(manifest, moduleNetlist);
  const imported = importNativeSchematic(payloads['module.kicad_sch'].toString('utf8'), moduleNetlist);
  assert.deepEqual(imported.components.map(part => [part.ref, part.kind]), [['R1', 'r0603'], ['D1', 'led0603']]);
  const importedBoard = importNativePcb(payloads['module.kicad_pcb'].toString('utf8'), imported);
  assert.deepEqual(importedBoard.components.map(part => [part.ref, part.pcb.x, part.pcb.y]), [['R1', 20, 20], ['D1', 30, 20]]);
  assert.equal(importedBoard.tracks.length, 1);
  assert.deepEqual(importedBoard.tracks[0].points, [{ x: 20.825, y: 20 }, { x: 29.2125, y: 20 }]);
  assert.equal(topology.internalNetCount, 1);

  const original = createEmptyDocument(); original.id = 'module-chain-original'; original.name = 'Module chain source';
  const placed = applyEditBatch(original, { id: 'place-module', baseRevision: 0, actor: 'agent', label: 'Place module', commands: [
    { type: 'insertModule', moduleId: manifest.moduleId, version: manifest.version, instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
  ] });
  assert.deepEqual(placed.tracks[0].points, importedBoard.tracks[0].points);
  const header = createComponent('header2'); header.id = 'power-header'; header.ref = 'J1'; header.schematic = { x: 25.4, y: 50.8, rotation: 0 }; header.pcb = { x: 10, y: 20, rotation: 0, side: 'top' };
  const connected = applyEditBatch(placed, { id: 'connect-module', baseRevision: 1, actor: 'agent', label: 'Connect power', commands: [
    { type: 'addComponent', component: header },
    { type: 'connectPins', a: { componentId: header.id, pinId: '1' }, b: { componentId: 'status-led-r', pinId: '1' }, netName: 'VCC' },
    { type: 'connectPins', a: { componentId: header.id, pinId: '2' }, b: { componentId: 'status-led-d', pinId: '1' }, netName: 'GND' },
  ] });
  assert.equal(original.components.length, 0);
  assert.equal(placed.components.length, 2);
  const byId = new Map(connected.components.map(part => [part.id, part]));
  const terminals = (name: string) => connected.nets.find(net => net.name === name)!.nodes.map(node => pinPosition(byId.get(node.componentId)!, node.pinId, 'pcb'));
  const vcc = terminals('VCC'); const gnd = terminals('GND');
  const routed = applyEditBatch(connected, { id: 'route-module', baseRevision: 2, actor: 'user', label: 'Manual reference routing', commands: [
    { type: 'addTrack', track: { id: 'track-vcc', netId: connected.nets.find(net => net.name === 'VCC')!.id, layer: 'top', width: 0.25, points: vcc } },
    { type: 'addTrack', track: { id: 'track-gnd', netId: connected.nets.find(net => net.name === 'GND')!.id, layer: 'top', width: 0.25, points: [gnd[1], { x: 35, y: 20 }, { x: 35, y: 28 }, { x: 10, y: 28 }, gnd[0]] } },
  ] });
  const schematicPath = `${outputDirectory}/design.kicad_sch`;
  const pcbPath = `${outputDirectory}/design.kicad_pcb`;
  await writeFile(schematicPath, exportKicadSchematic(routed));
  await writeFile(pcbPath, exportKicadPcb(routed));
  await writeFile(`${outputDirectory}/design.kicad_pro`, '{}');
  await writeFile(`${outputDirectory}/design.json`, JSON.stringify(routed, null, 2));
  const symbolDir = '${KICAD9_SYMBOL_DIR}';
  await writeFile(`${outputDirectory}/sym-lib-table`, `(sym_lib_table\n  (lib (name "Device") (type "KiCad") (uri "${symbolDir}/Device.kicad_sym") (options "") (descr ""))\n  (lib (name "Connector_Generic") (type "KiCad") (uri "${symbolDir}/Connector_Generic.kicad_sym") (options "") (descr ""))\n)\n`);
  const candidateNetlistPath = `${outputDirectory}/design.net`;
  assert.equal(await native(['sch', 'export', 'netlist', '--output', candidateNetlistPath, schematicPath]), 0);
  const candidateNetlist = await readFile(candidateNetlistPath, 'utf8');
  const candidateNets = verifyModuleNetlist(manifest, candidateNetlist);
  assert.equal(candidateNets.internalNetCount, 1);
  const nativeReadback = importNativeSchematic(await readFile(schematicPath, 'utf8'), candidateNetlist);
  assert.equal(nativeReadback.moduleInstances?.[0]?.id, 'status-led');
  assert.deepEqual(nativeReadback.components.filter(part => part.locked).map(part => part.id), ['status-led-r', 'status-led-d']);
  const ercPath = `${outputDirectory}/erc.json`; const drcPath = `${outputDirectory}/drc.json`;
  const ercExit = await native(['sch', 'erc', '--format', 'json', '--exit-code-violations', '--output', ercPath, schematicPath]);
  const drcExit = await native(['pcb', 'drc', '--format', 'json', '--exit-code-violations', '--schematic-parity', '--output', drcPath, pcbPath]);
  const erc = JSON.parse(await readFile(ercPath, 'utf8'));
  const drc = JSON.parse(await readFile(drcPath, 'utf8'));
  const result = { kicadVersion: await nativeVersion(), modulePackageSha256: intake.packageSha256, modulePorts: topology.portNets, candidate: { components: routed.components.length, nets: routed.nets.length, tracks: routed.tracks.length, originalPreserved: original.components.length === 0, moduleReadback: nativeReadback.moduleInstances?.[0]?.id === 'status-led' }, erc: { exitCode: ercExit, violations: violations(erc).map(item => item.type) }, drc: { exitCode: drcExit, violations: violations(drc).map(item => item.type) } };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (ercExit !== 0 || drcExit !== 0) process.exitCode = 1;
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : error}\n`); process.exitCode = 1; });
