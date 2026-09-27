import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Run only against a caller-authorized, saved KiCad project snapshot. This module never publishes the candidate. */
export interface FreeroutingInput {
  sourceRoot: string;
  jobRoot: string;
  boardFile: string;
  projectFiles: string[];
  tools: { kicadCli: string; python: string; java: string; freeroutingJar: string; freeroutingJarSha256: string };
  signal?: AbortSignal;
}

export interface FreeroutingProcess {
  (request: { command: string; args: string[]; cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface DrcSummary {
  unconnected: number;
  violations: Record<string, number>;
  violationSignatures: Record<string, number>;
  schematicParity: number;
  reportPath: string;
}

export interface FreeroutingCandidate {
  candidateBoard: string;
  sourceBoardSha256: string;
  candidateBoardSha256: string;
  dsnSha256: string;
  sesSha256: string;
  boardStructureSha256: string;
  before: DrcSummary;
  after: DrcSummary;
}

export class FreeroutingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'FreeroutingError'; }
}

const MAX_PROJECT_FILES = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PROJECT_BYTES = 200 * 1024 * 1024;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const ROUTE_TIMEOUT_MS = 300_000;
const CHECK_TIMEOUT_MS = 60_000;
const ALLOWED_EXT = new Set(['.kicad_pcb', '.kicad_sch', '.kicad_pro', '.kicad_sym', '.kicad_mod']);

// KiCad 9 CLI does not expose Specctra DSN/SES; pcbnew's native Python bindings do.
// The importer acts on an in-memory board and SaveBoard writes only a private candidate.
const PCBNEW_BRIDGE = `import json
import sys
import pcbnew
mode = sys.argv[1]
if mode == 'export':
    board = pcbnew.LoadBoard(sys.argv[2])
    if board is None or not pcbnew.ExportSpecctraDSN(board, sys.argv[3]):
        raise RuntimeError('KiCad DSN export failed')
elif mode == 'import':
    board = pcbnew.LoadBoard(sys.argv[2])
    if board is None or not pcbnew.ImportSpecctraSES(board, sys.argv[3]):
        raise RuntimeError('KiCad SES import failed')
    if not pcbnew.SaveBoard(sys.argv[4], board):
        raise RuntimeError('KiCad candidate save failed')
elif mode == 'fingerprint':
    board = pcbnew.LoadBoard(sys.argv[2])
    if board is None:
        raise RuntimeError('KiCad board load failed')
    def point(value):
        return [value.x, value.y]
    def box(item):
        rect = item.GetBoundingBox()
        return [rect.GetX(), rect.GetY(), rect.GetWidth(), rect.GetHeight()]
    footprints = []
    for part in board.GetFootprints():
        pads = sorted([[pad.GetNumber(), pad.GetNetname(), point(pad.GetPosition()), point(pad.GetSize()), point(pad.GetDrillSize()), pad.GetShape(), pad.GetLayerName()] for pad in part.Pads()], key=lambda row: json.dumps(row))
        footprints.append([part.GetReference(), part.GetValue(), part.GetFPIDAsString(), point(part.GetPosition()), part.GetOrientationDegrees(), part.GetLayerName(), pads])
    data = {
        'copperLayers': board.GetCopperLayerCount(),
        'nets': sorted([net.GetNetname() for net in board.GetNetInfo().NetsByNetcode().values()]),
        'footprints': sorted(footprints, key=lambda row: row[0]),
        'drawings': sorted([[item.GetClass(), item.GetLayerName(), box(item)] for item in board.GetDrawings()], key=lambda row: json.dumps(row)),
    }
    with open(sys.argv[3], 'w', encoding='utf-8') as output:
        json.dump(data, output, sort_keys=True, separators=(',', ':'))
else:
    raise RuntimeError('Unsupported pcbnew bridge action')
`;

function sha256(data: Buffer): string { return createHash('sha256').update(data).digest('hex'); }

async function fileSha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function safeRelative(name: string): string {
  if (!name || name.includes('\\') || name.includes('\0') || isAbsolute(name) || /^[A-Za-z]:/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new FreeroutingError('invalid_path', `Project path must be a safe relative path: ${name}`);
  }
  if (!ALLOWED_EXT.has(extname(name)) && !['sym-lib-table', 'fp-lib-table'].includes(name.split('/').at(-1)!)) {
    throw new FreeroutingError('invalid_path', `Unsupported project file path: ${name}`);
  }
  return name;
}

function within(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function readSnapshotFile(root: string, name: string): Promise<Buffer> {
  const full = join(root, ...safeRelative(name).split('/'));
  let cursor = dirname(full);
  while (within(root, cursor)) {
    if ((await lstat(cursor)).isSymbolicLink()) throw new FreeroutingError('symlink', `Project path contains a symlink: ${name}`);
    if (resolve(cursor) === resolve(root)) break;
    cursor = dirname(cursor);
  }
  if ((await lstat(full)).isSymbolicLink()) throw new FreeroutingError('symlink', `Project file is a symlink: ${name}`);
  const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new FreeroutingError('invalid_file', `Project file is invalid or too large: ${name}`);
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function requiredOutput(file: string, label: string): Promise<Buffer> {
  let info;
  try { info = await lstat(file); }
  catch { throw new FreeroutingError('missing_output', `${label} output was not created`); }
  if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) throw new FreeroutingError('invalid_output', `${label} output is empty, unsafe, or too large`);
  return readFile(file);
}

async function defaultProcess({ command, args, cwd, timeoutMs, signal }: Parameters<FreeroutingProcess>[0]): Promise<Awaited<ReturnType<FreeroutingProcess>>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let size = 0; let expired = false; let overflow = false;
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, timeoutMs);
    const collect = (stream: NodeJS.ReadableStream, target: 'stdout' | 'stderr') => stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) { overflow = true; child.kill('SIGKILL'); return; }
      if (target === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    });
    collect(child.stdout!, 'stdout'); collect(child.stderr!, 'stderr');
    child.once('error', error => {
      clearTimeout(timer);
      reject(signal?.aborted ? new FreeroutingError('cancelled', `${command} was cancelled`) : new FreeroutingError('tool_unavailable', `${command} could not start: ${error.message}`));
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (expired) reject(new FreeroutingError('timeout', `${command} exceeded ${timeoutMs} ms`));
      else if (overflow) reject(new FreeroutingError('output_limit', `${command} exceeded the output limit`));
      else resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

function parseDrc(data: Buffer, reportPath: string): DrcSummary {
  if (data.byteLength > MAX_REPORT_BYTES) throw new FreeroutingError('invalid_report', 'KiCad DRC report is too large');
  let report: unknown;
  try { report = JSON.parse(data.toString('utf8')); }
  catch { throw new FreeroutingError('invalid_report', 'KiCad DRC report is not JSON'); }
  if (!report || typeof report !== 'object') throw new FreeroutingError('invalid_report', 'KiCad DRC report has no object');
  const value = report as Record<string, unknown>;
  const severities = value.included_severities;
  if (value.$schema !== 'https://schemas.kicad.org/drc.v1.json' || !Array.isArray(value.unconnected_items) || !Array.isArray(value.violations) || !Array.isArray(value.schematic_parity) || !Array.isArray(severities) || !['error', 'warning', 'exclusion'].every(level => severities.includes(level))) {
    throw new FreeroutingError('invalid_report', 'KiCad DRC report has an unsupported schema');
  }
  const counts: Record<string, number> = {};
  const signatures: Record<string, number> = {};
  for (const row of value.violations) {
    if (!row || typeof row !== 'object' || typeof row.type !== 'string' || typeof row.severity !== 'string') throw new FreeroutingError('invalid_report', 'KiCad DRC violation is malformed');
    const key = `${row.severity}:${row.type}`;
    counts[key] = (counts[key] ?? 0) + 1;
    const items = Array.isArray(row.items) ? row.items.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new FreeroutingError('invalid_report', 'KiCad DRC violation item is malformed');
      const evidence = item as Record<string, unknown>;
      return typeof evidence.uuid === 'string' ? evidence.uuid : JSON.stringify(evidence);
    }).sort() : [];
    const signature = JSON.stringify([key, items, items.length ? '' : row.description ?? '']);
    signatures[signature] = (signatures[signature] ?? 0) + 1;
  }
  return { unconnected: value.unconnected_items.length, schematicParity: value.schematic_parity.length, violations: counts, violationSignatures: signatures, reportPath };
}

async function checkDrc(board: string, reportPath: string, cwd: string, tools: FreeroutingInput['tools'], run: FreeroutingProcess, signal?: AbortSignal): Promise<DrcSummary> {
  const result = await run({ command: tools.kicadCli, args: ['pcb', 'drc', '--format', 'json', '--severity-all', '--schematic-parity', '--exit-code-violations', '--output', reportPath, board], cwd, timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (result.code !== 0 && result.code !== 5) throw new FreeroutingError('drc_failed', `KiCad native DRC failed with exit code ${result.code}`);
  return parseDrc(await requiredOutput(reportPath, 'KiCad DRC'), reportPath);
}

async function boardStructure(board: string, output: string, cwd: string, tools: FreeroutingInput['tools'], run: FreeroutingProcess, signal?: AbortSignal): Promise<string> {
  const result = await run({ command: tools.python, args: ['-c', PCBNEW_BRIDGE, 'fingerprint', board, output], cwd, timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (result.code !== 0) throw new FreeroutingError('board_structure_failed', `KiCad could not inspect board structure (exit code ${result.code})`);
  const bytes = await requiredOutput(output, 'KiCad board structure');
  if (bytes.byteLength > MAX_REPORT_BYTES) throw new FreeroutingError('board_structure_failed', 'KiCad board structure report is too large');
  try {
    const data = JSON.parse(bytes.toString('utf8'));
    if (!data || !Array.isArray(data.footprints) || !Array.isArray(data.nets) || !Array.isArray(data.drawings) || typeof data.copperLayers !== 'number') throw new Error();
  } catch { throw new FreeroutingError('board_structure_failed', 'KiCad board structure report is invalid'); }
  return sha256(bytes);
}

/** Return a reviewable candidate only when native checks improve and the saved source snapshot remains unchanged. */
export async function routeBoardCandidate(input: FreeroutingInput, run: FreeroutingProcess = defaultProcess): Promise<FreeroutingCandidate> {
  const { sourceRoot, jobRoot, boardFile, projectFiles, tools, signal } = input;
  if (!isAbsolute(sourceRoot) || !isAbsolute(jobRoot) || within(sourceRoot, jobRoot) || within(jobRoot, sourceRoot)) throw new FreeroutingError('invalid_path', 'Source and job roots must be separate absolute paths');
  const resolvedSource = await realpath(sourceRoot);
  const resolvedJob = join(await realpath(dirname(jobRoot)), basename(jobRoot));
  if (within(resolvedSource, resolvedJob) || within(resolvedJob, resolvedSource)) throw new FreeroutingError('invalid_path', 'Source and job roots resolve to overlapping paths');
  if (!Array.isArray(projectFiles) || projectFiles.length < 3 || projectFiles.length > MAX_PROJECT_FILES) throw new FreeroutingError('invalid_manifest', 'Project file manifest is missing or too large');
  const files = projectFiles.map(safeRelative);
  if (new Set(files).size !== files.length) throw new FreeroutingError('invalid_manifest', 'Project file manifest has duplicates');
  const board = safeRelative(boardFile);
  if (!board.endsWith('.kicad_pcb') || !files.includes(board)) throw new FreeroutingError('invalid_manifest', 'Manifest must include the KiCad board');
  const stem = board.slice(0, -'.kicad_pcb'.length);
  if (!files.includes(`${stem}.kicad_sch`) || !files.includes(`${stem}.kicad_pro`)) throw new FreeroutingError('invalid_manifest', 'Board requires matching schematic and project files for parity DRC');
  const jar = await lstat(tools.freeroutingJar).catch(() => null);
  if (!jar?.isFile() || jar.size === 0) throw new FreeroutingError('tool_unavailable', 'Freerouting jar is not installed or configured');
  if (!/^[a-f0-9]{64}$/i.test(tools.freeroutingJarSha256) || (await fileSha256(tools.freeroutingJar)) !== tools.freeroutingJarSha256.toLowerCase()) {
    throw new FreeroutingError('jar_digest_mismatch', 'Freerouting jar digest does not match the pinned deployment digest');
  }
  const snapshots = new Map<string, Buffer>(); let total = 0;
  for (const name of files) {
    const bytes = await readSnapshotFile(sourceRoot, name);
    total += bytes.byteLength;
    if (total > MAX_PROJECT_BYTES) throw new FreeroutingError('project_limit', 'KiCad project snapshot exceeds the size limit');
    snapshots.set(name, bytes);
  }
  await mkdir(jobRoot, { mode: 0o700 });
  const baseline = join(jobRoot, 'baseline'); const candidate = join(jobRoot, 'candidate'); const artifacts = join(jobRoot, 'artifacts');
  for (const dir of [baseline, candidate, artifacts]) await mkdir(dir, { mode: 0o700 });
  for (const [name, bytes] of snapshots) for (const root of [baseline, candidate]) {
    const output = join(root, ...name.split('/'));
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, bytes, { mode: 0o600, flag: 'wx' });
  }
  const baselineBoard = join(baseline, ...board.split('/'));
  const candidateBoard = join(candidate, ...board.split('/'));
  const sourceBoardSha256 = sha256(snapshots.get(board)!);
  const before = await checkDrc(baselineBoard, join(artifacts, 'baseline-drc.json'), baseline, tools, run, signal);
  if (before.schematicParity) throw new FreeroutingError('baseline_parity', 'Baseline board has schematic parity violations');
  if (!before.unconnected) throw new FreeroutingError('already_routed', 'Baseline board has no unconnected items to route');
  const boardStructureSha256 = await boardStructure(baselineBoard, join(artifacts, 'baseline-structure.json'), baseline, tools, run, signal);
  const dsn = join(artifacts, 'board.dsn'); const ses = join(artifacts, 'board.ses');
  const exported = await run({ command: tools.python, args: ['-c', PCBNEW_BRIDGE, 'export', baselineBoard, dsn], cwd: baseline, timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (exported.code !== 0) throw new FreeroutingError('dsn_failed', `KiCad native DSN export failed with exit code ${exported.code}`);
  const dsnSha256 = sha256(await requiredOutput(dsn, 'DSN'));
  const routed = await run({ command: tools.java, args: ['-Xmx512m', '-XX:ActiveProcessorCount=1', '-jar', tools.freeroutingJar, '--gui.enabled=false', '--api_server.enabled=false', '--logging.file.enabled=false', `--user_data_path=${artifacts}`, '-da', '-de', dsn, '-do', ses, '-mp', '10', '-mt', '1'], cwd: artifacts, timeoutMs: ROUTE_TIMEOUT_MS, signal });
  if (routed.code !== 0) throw new FreeroutingError('route_failed', `Freerouting exited with code ${routed.code}`);
  const sesSha256 = sha256(await requiredOutput(ses, 'SES'));
  const imported = await run({ command: tools.python, args: ['-c', PCBNEW_BRIDGE, 'import', candidateBoard, ses, candidateBoard], cwd: candidate, timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (imported.code !== 0) throw new FreeroutingError('ses_failed', `KiCad native SES import failed with exit code ${imported.code}`);
  const candidateBoardSha256 = sha256(await requiredOutput(candidateBoard, 'Candidate board'));
  if (candidateBoardSha256 === sourceBoardSha256) throw new FreeroutingError('unchanged', 'SES import did not change the candidate board');
  const candidateStructureSha256 = await boardStructure(candidateBoard, join(artifacts, 'candidate-structure.json'), candidate, tools, run, signal);
  if (candidateStructureSha256 !== boardStructureSha256) throw new FreeroutingError('board_structure_changed', 'Candidate changed board footprints, nets, outline, or other fixed structure');
  const after = await checkDrc(candidateBoard, join(artifacts, 'candidate-drc.json'), candidate, tools, run, signal);
  if (after.schematicParity) throw new FreeroutingError('parity_regression', 'Candidate has schematic parity violations');
  if (after.unconnected >= before.unconnected) throw new FreeroutingError('unconnected_regression', 'Candidate did not reduce unconnected items');
  for (const [type, count] of Object.entries(after.violations)) if (count > (before.violations[type] ?? 0)) {
    throw new FreeroutingError('drc_regression', `Candidate has additional DRC violations: ${type}`);
  }
  for (const [signature, count] of Object.entries(after.violationSignatures)) if (count > (before.violationSignatures[signature] ?? 0)) {
    throw new FreeroutingError('drc_regression', `Candidate has a new native DRC violation: ${signature}`);
  }
  for (const [name, bytes] of snapshots) {
    const current = await readSnapshotFile(sourceRoot, name);
    if (sha256(current) !== sha256(bytes)) throw new FreeroutingError('source_changed', `Saved source project changed during routing: ${name}`);
  }
  return { candidateBoard, sourceBoardSha256, candidateBoardSha256, dsnSha256, sesSha256, boardStructureSha256, before, after };
}
