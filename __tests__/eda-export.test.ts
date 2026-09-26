// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { createEdaArchive } from '@/lib/server/eda-export';
import { engineeringFixture } from './fixtures/eda-engineering';
describe('native engineering artifact package', () => {
  it.skipIf(!process.env.KICAD_CLI_PATH)('generates real Gerbers/drills and hashes the same document revision', async () => {
    const document=engineeringFixture(); const entries=unzipSync(await createEdaArchive(document));
    expect(Object.keys(entries).some(path=>path.endsWith('.gtl'))).toBe(true);
    expect(Object.keys(entries).some(path=>path.endsWith('.drl'))).toBe(true);
    const manifest=JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest.revision).toBe(document.revision);
    expect(manifest.fabricationReviewed).toBe(false);
    for(const artifact of manifest.artifacts) expect(createHash('sha256').update(entries[artifact.path]).digest('hex')).toBe(artifact.sha256);
    const drc=JSON.parse(strFromU8(entries['checks/drc.json']));
    expect(drc.report.unconnected_items).toHaveLength(0);
    expect(drc.report.violations.filter((v:{severity:string})=>v.severity==='error')).toHaveLength(0);
    expect(drc.report.schematic_parity).toHaveLength(0);
  },120_000);
});
