import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseDocument } from '../lib/eda/document';
import { exportKicadPcb, exportKicadSchematic } from '../lib/eda/kicad';
import { routeBoardCandidate } from '../lib/eda/freerouting';

async function main() {
  const jar = process.env.FREEROUTING_JAR;
  if (!jar) throw new Error('Set FREEROUTING_JAR to a locally downloaded, SHA-256-verified official release jar');
  const jarSha256 = process.env.FREEROUTING_JAR_SHA256 || '';
  if (!/^[a-f0-9]{64}$/.test(jarSha256)) throw new Error('FREEROUTING_JAR_SHA256 must be a SHA-256 digest');
  const root = resolve('.eda-data/module-chain-verification');
  const sourceRoot = join(root, 'unrouted-source');
  await mkdir(sourceRoot, { recursive: true });
  const routed = parseDocument(await readFile(join(root, 'design.json'), 'utf8'));
  assert.equal(routed.moduleInstances?.[0]?.moduleId, 'sample.led-indicator');
  const fixedTracks = new Set(routed.moduleInstances?.flatMap(instance => instance.internalTrackIds) ?? []);
  const baseline = parseDocument({ ...routed, tracks: routed.tracks.filter(track => fixedTracks.has(track.id)) });
  await writeFile(join(sourceRoot, 'design.kicad_sch'), exportKicadSchematic(baseline));
  await writeFile(join(sourceRoot, 'design.kicad_pcb'), exportKicadPcb(baseline));
  await writeFile(join(sourceRoot, 'design.kicad_pro'), '{}');
  await writeFile(join(sourceRoot, 'sym-lib-table'), await readFile(join(root, 'sym-lib-table')));
  const parent = await mkdtemp(join(tmpdir(), 'vibehard-freerouting-'));
  const result = await routeBoardCandidate({
    sourceRoot, jobRoot: join(parent, 'job'), boardFile: 'design.kicad_pcb',
    projectFiles: ['design.kicad_sch', 'design.kicad_pcb', 'design.kicad_pro', 'sym-lib-table'],
    tools: { kicadCli: '/usr/bin/kicad-cli', python: '/usr/bin/python3', java: '/usr/bin/java', freeroutingJar: resolve(jar), freeroutingJarSha256: jarSha256 },
  });
  assert.equal(result.after.unconnected, 0);
  const candidateBoard = join(root, 'autorouted.kicad_pcb');
  await writeFile(candidateBoard, await readFile(result.candidateBoard));
  await writeFile(join(root, 'autorouted-baseline-drc.json'), await readFile(result.before.reportPath));
  await writeFile(join(root, 'autorouted-candidate-drc.json'), await readFile(result.after.reportPath));
  await writeFile(join(root, 'autorouted.dsn'), await readFile(join(parent, 'job', 'artifacts', 'board.dsn')));
  await writeFile(join(root, 'autorouted.ses'), await readFile(join(parent, 'job', 'artifacts', 'board.ses')));
  const evidence = { before: { unconnected: result.before.unconnected, schematicParity: result.before.schematicParity, violations: result.before.violations }, after: { unconnected: result.after.unconnected, schematicParity: result.after.schematicParity, violations: result.after.violations }, sourceBoardSha256: result.sourceBoardSha256, candidateBoardSha256: result.candidateBoardSha256, dsnSha256: result.dsnSha256, sesSha256: result.sesSha256, candidateBoard };
  await writeFile(join(root, 'freerouting-result.json'), JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : error}\n`); process.exitCode = 1; });
