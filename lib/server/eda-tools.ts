import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseDocument } from '@/lib/eda/document';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { inspectNativeSchematic, importNativeSchematic } from '@/lib/eda/kicad-import';
const execute = promisify(execFile);
const executable = () => process.env.KICAD_CLI_PATH || 'kicad-cli';
export type CheckKind = 'erc' | 'drc';
export function nativeCheckArguments(kind: CheckKind, input: string, report: string) {
  return [kind === 'erc' ? 'sch' : 'pcb', kind, '--format', 'json', '--exit-code-violations', ...(kind === 'drc' ? ['--schematic-parity'] : []), '--output', report, input];
}
export async function kicadAvailable(command = executable()) {
  try { await execute(command, ['--version'], { timeout: 5_000, maxBuffer: 64_000, windowsHide: true }); return true; }
  catch { return false; }
}
export async function runEdaCheck(input: unknown, kind: CheckKind, signal?: AbortSignal) {
  const document = parseDocument(input);
  if (!await kicadAvailable()) return { available: false, message: '服务器尚未安装或配置 KiCad CLI；未执行 ERC/DRC' };
  const directory = await mkdtemp(join(tmpdir(), 'vibehard-eda-check-'));
  const source = join(directory, kind === 'erc' ? 'design.kicad_sch' : 'design.kicad_pcb');
  const report = join(directory, 'report.json');
  try {
    await writeFile(source, kind === 'erc' ? exportKicadSchematic(document) : exportKicadPcb(document), 'utf8');
    if (kind === 'drc') {
      await writeFile(join(directory, 'design.kicad_sch'), exportKicadSchematic(document), 'utf8');
      await writeFile(join(directory, 'design.kicad_pro'), '{}', 'utf8');
    }
    let exitCode = 0;
    try { await execute(executable(), nativeCheckArguments(kind, source, report), { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true, signal }); }
    catch (error) {
      const failure = error as Error & { killed?: boolean; code?: number | string };
      if (failure.killed || failure.name === 'AbortError') return { available: true, message: 'KiCad 检查被取消或超时，未取得完整报告' };
      exitCode = typeof failure.code === 'number' ? failure.code : -1;
    }
    let content: string;
    try { content = await readFile(report, 'utf8'); }
    catch { return { available: true, exitCode, message: 'KiCad 未生成检查报告；工程可能无法解析，请检查导出文件' }; }
    if (Buffer.byteLength(content) > 2_000_000) return { available: true, exitCode, message: '检查报告过大，请减少工程规模' };
    return { available: true, exitCode, report: JSON.parse(content), revision: document.revision, kind };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export class EdaImportError extends Error {}
export async function importEdaSchematic(source: string, signal?: AbortSignal) {
  try { inspectNativeSchematic(source); }
  catch (error) { throw new EdaImportError(error instanceof Error ? error.message : '文件格式不正确'); }
  if (!await kicadAvailable()) throw new EdaImportError('服务器未配置 KiCad CLI，无法解析原理图网表');
  const directory = await mkdtemp(join(tmpdir(), 'vibehard-eda-import-'));
  try {
    const input = join(directory, 'input.kicad_sch'); const output = join(directory, 'output.net');
    await writeFile(input, source, 'utf8');
    try { await execute(executable(), ['sch', 'export', 'netlist', '--output', output, input], { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true, signal }); }
    catch { throw new EdaImportError('KiCad 无法解析该文件，或读取已超时'); }
    const netlist = await readFile(output, 'utf8');
    try { return importNativeSchematic(source, netlist); }
    catch (error) { throw new EdaImportError(error instanceof Error ? error.message : '工程不受支持'); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
