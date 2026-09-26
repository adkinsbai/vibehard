import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { parseDocument } from '@/lib/eda/document';
import { exportBomCsv, exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { PARTS } from '@/lib/eda/library';
import { kicadAvailable, runEdaCheck } from './eda-tools';
const execute = promisify(execFile);
export class EdaExportError extends Error {}
export async function createEdaArchive(input: unknown, signal?: AbortSignal) {
  const document = parseDocument(input);
  if (!document.components.length) throw new EdaExportError('请先添加器件');
  if (document.components.some(c => !PARTS[c.kind].native)) throw new EdaExportError('工程含旧版占位封装，请替换为官方库器件后导出交付包');
  const command = process.env.KICAD_CLI_PATH || 'kicad-cli';
  if (!await kicadAvailable(command)) throw new EdaExportError('KiCad CLI 不可用，无法生成 Gerber 和钻孔文件');
  const directory = await mkdtemp(join(tmpdir(), 'vibehard-eda-export-'));
  try {
    const files: Record<string, Uint8Array> = {
      'design.json': strToU8(JSON.stringify(document, null, 2)),
      'design.kicad_sch': strToU8(exportKicadSchematic(document)),
      'design.kicad_pcb': strToU8(exportKicadPcb(document)),
      'bom.csv': strToU8(exportBomCsv(document)),
    };
    const board = join(directory, 'design.kicad_pcb');
    const plots = join(directory, 'gerbers'); await mkdir(plots);
    await writeFile(board, files['design.kicad_pcb']);
    const options = { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true, signal };
    let version: string;
    try {
      version = (await execute(command, ['--version'], options)).stdout.trim();
      await execute(command, ['pcb', 'export', 'gerbers', '--layers', 'F.Cu,B.Cu,F.Paste,B.Paste,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts', '--output', plots, board], options);
      await execute(command, ['pcb', 'export', 'drill', '--format', 'excellon', '--excellon-units', 'mm', '--output', plots, board], options);
    } catch { throw new EdaExportError('KiCad 工程输出失败或超时，没有生成交付包'); }
    let total = 0;
    for (const entry of await readdir(plots, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[A-Za-z0-9_.-]+$/.test(entry.name)) throw new EdaExportError('工具生成了不受支持的输出项');
      const content = await readFile(join(plots, entry.name)); total += content.length;
      if (total > 30_000_000) throw new EdaExportError('工程输出超过 30 MB 限制');
      files[`gerbers/${entry.name}`] = content;
    }
    const erc = await runEdaCheck(document, 'erc', signal); const drc = await runEdaCheck(document, 'drc', signal);
    files['checks/erc.json'] = strToU8(JSON.stringify(erc, null, 2));
    files['checks/drc.json'] = strToU8(JSON.stringify(drc, null, 2));
    const manifest = { schemaVersion: 1, documentId: document.id, revision: document.revision, generatedAt: new Date().toISOString(), kicadVersion: version, checks: { ercExitCode: erc.exitCode ?? null, drcExitCode: drc.exitCode ?? null }, fabricationReviewed: false, artifacts: Object.entries(files).map(([path, data]) => ({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })) };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    files['README.txt'] = strToU8('VibeHard engineering export\nAll files were generated from the design.json revision recorded in manifest.json.\nRead checks/erc.json and checks/drc.json before fabrication. A ZIP export is not a manufacturing approval.\nKiCad official library data: https://www.kicad.org/libraries/license/\n');
    return zipSync(files);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
