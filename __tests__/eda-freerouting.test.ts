// @vitest-environment node
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { routeBoardCandidate, type FreeroutingProcess } from '@/lib/eda/freerouting';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'eda-freerouting-test-'));
  roots.push(root);
  const sourceRoot = join(root, 'source');
  await mkdir(sourceRoot);
  await writeFile(join(sourceRoot, 'circuit.kicad_pcb'), '(kicad_pcb original)');
  await writeFile(join(sourceRoot, 'circuit.kicad_sch'), '(kicad_sch original)');
  await writeFile(join(sourceRoot, 'circuit.kicad_pro'), '{}');
  const jar = join(root, 'freerouting.jar');
  await writeFile(jar, 'jar');
  return { root, sourceRoot, jobRoot: join(root, 'job'), boardFile: 'circuit.kicad_pcb', projectFiles: ['circuit.kicad_pcb', 'circuit.kicad_sch', 'circuit.kicad_pro'], tools: { kicadCli: 'kicad-cli', python: 'python3', java: 'java', freeroutingJar: jar, freeroutingJarSha256: createHash('sha256').update('jar').digest('hex') } };
}

function drc(unconnected = 2, violations: { type: string; severity: string; items?: { uuid: string }[] }[] = [], parity: { type: string; severity: string }[] = []) {
  return { $schema: 'https://schemas.kicad.org/drc.v1.json', included_severities: ['error', 'warning', 'exclusion'], unconnected_items: Array.from({ length: unconnected }, (_, n) => ({ type: 'unconnected', severity: 'error', items: [{ uuid: String(n) }] })), violations, schematic_parity: parity };
}

function fakeProcesses(opts: { before?: ReturnType<typeof drc>; after?: ReturnType<typeof drc>; editSource?: string; missingSession?: boolean; alteredFootprint?: boolean } = {}) {
  const calls: { command: string; args: string[]; timeoutMs: number }[] = [];
  const run: FreeroutingProcess = async ({ command, args, timeoutMs }) => {
    calls.push({ command, args, timeoutMs });
    if (args.includes('drc')) {
      const report = args[args.indexOf('--output') + 1];
      await writeFile(report, JSON.stringify(report.includes('baseline') ? opts.before ?? drc() : opts.after ?? drc(0)));
      return { code: 5, stdout: '', stderr: '' };
    }
    if (command === 'python3' && args.includes('fingerprint')) {
      await writeFile(args.at(-1)!, JSON.stringify({ copperLayers: 2, footprints: args.at(-1)!.includes('candidate') && opts.alteredFootprint ? ['moved'] : ['original'], nets: ['VCC'], drawings: ['edge'] }));
    }
    if (command === 'python3' && args.includes('export')) {
      await writeFile(args.at(-1)!, '(dsn design)');
    }
    if (command === 'java' && args.includes('-do') && !opts.missingSession) {
      await writeFile(args[args.indexOf('-do') + 1], '(session routes)');
    }
    if (command === 'python3' && args.includes('import')) {
      const board = args.at(-1)!;
      await writeFile(board, '(kicad_pcb routed)');
    }
    if (opts.editSource && command === 'java') await writeFile(opts.editSource, '(kicad_pcb changed by editor)');
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Freerouting candidate adapter', () => {
  it('routes only private project copies with bounded argument arrays and native before/after DRC', async () => {
    const input = await fixture(); const process = fakeProcesses();
    const result = await routeBoardCandidate(input, process.run);
    expect(await readFile(join(input.sourceRoot, input.boardFile), 'utf8')).toBe('(kicad_pcb original)');
    expect(await readFile(result.candidateBoard, 'utf8')).toBe('(kicad_pcb routed)');
    expect(result.before.unconnected).toBe(2);
    expect(result.after.unconnected).toBe(0);
    expect(result.sourceBoardSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.candidateBoardSha256).not.toBe(result.sourceBoardSha256);
    expect(process.calls.filter(call => call.command === 'kicad-cli' && call.args.includes('drc'))).toHaveLength(2);
    expect(process.calls.filter(call => call.command === 'kicad-cli' && call.args.includes('drc')).every(call => call.args.includes('--schematic-parity'))).toBe(true);
    const java = process.calls.find(call => call.command === 'java')!;
    expect(java.args).toContain('--gui.enabled=false');
    expect(java.args).toContain('-Xmx512m');
    expect(java.args).toContain('-mt');
    expect(java.args).toContain('1');
    expect(java.args).toContain('-de');
    expect(java.args).toContain('-do');
    expect(java.timeoutMs).toBeLessThanOrEqual(300_000);
  });

  it('fails explicitly without a configured Freerouting jar', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate({ ...input, tools: { ...input.tools, freeroutingJar: join(input.root, 'missing.jar') } })).rejects.toThrow(/Freerouting.*jar/i);
  });

  it('rejects a jar that does not match the deployment-pinned digest', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate({ ...input, tools: { ...input.tools, freeroutingJarSha256: '0'.repeat(64) } })).rejects.toThrow(/digest|hash/i);
  });

  it('rejects symlinks and traversal in the snapshot manifest', async () => {
    const input = await fixture(); const process = fakeProcesses();
    await expect(routeBoardCandidate({ ...input, projectFiles: [...input.projectFiles, '../other.kicad_sch'] }, process.run)).rejects.toThrow(/path|relative/i);
    try {
      await symlink(join(input.sourceRoot, 'circuit.kicad_sch'), join(input.sourceRoot, 'link.kicad_sch'));
      await expect(routeBoardCandidate({ ...input, projectFiles: [...input.projectFiles, 'link.kicad_sch'] }, process.run)).rejects.toThrow(/symlink/i);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
    expect(process.calls).toHaveLength(0);
  });

  it('rejects a native DRC regression and parity violation', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate(input, fakeProcesses({ after: drc(3) }).run)).rejects.toThrow(/unconnected/i);
    await expect(routeBoardCandidate({ ...input, jobRoot: join(input.root, 'job2') }, fakeProcesses({ after: drc(0, [], [{ type: 'missing_footprint', severity: 'error' }]) }).run)).rejects.toThrow(/parity/i);
  });

  it('rejects a new clearance violation replacing an old one of the same type', async () => {
    const input = await fixture();
    const oldFinding = { type: 'clearance', severity: 'error', items: [{ uuid: 'old-track' }] };
    const newFinding = { type: 'clearance', severity: 'error', items: [{ uuid: 'new-track' }] };
    await expect(routeBoardCandidate(input, fakeProcesses({ before: drc(2, [oldFinding]), after: drc(0, [newFinding]) }).run)).rejects.toThrow(/DRC/i);
  });

  it('rejects a partial native DRC report that omitted warnings', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate(input, fakeProcesses({ after: { ...drc(0), included_severities: ['error'] } }).run)).rejects.toThrow(/report|severit/i);
  });

  it('detects edits to the original board before returning a candidate', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate(input, fakeProcesses({ editSource: join(input.sourceRoot, input.boardFile) }).run)).rejects.toThrow(/source.*changed/i);
  });

  it('rejects missing SES output even if Freerouting exits zero', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate(input, fakeProcesses({ missingSession: true }).run)).rejects.toThrow(/SES/i);
  });

  it('rejects a candidate that changes a footprint despite improving connectivity', async () => {
    const input = await fixture();
    await expect(routeBoardCandidate(input, fakeProcesses({ alteredFootprint: true }).run)).rejects.toThrow(/footprint|structure/i);
  });
});
