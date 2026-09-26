// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nativeCheckArguments, kicadAvailable } from '@/lib/server/eda-tools';
describe('native EDA checks', () => {
  it('uses fixed ERC/DRC arguments and generated files only', () => {
    expect(nativeCheckArguments('erc', 'C:/safe/input.kicad_sch', 'C:/safe/report.json')).toEqual(['sch', 'erc', '--format', 'json', '--exit-code-violations', '--output', 'C:/safe/report.json', 'C:/safe/input.kicad_sch']);
    expect(nativeCheckArguments('drc', '/tmp/in.kicad_pcb', '/tmp/out.json')).toContain('--schematic-parity');
  });
  it('does not report a nonexistent executable as available', async () => {
    expect(await kicadAvailable('C:/definitely-missing-vibehard/kicad-cli.exe')).toBe(false);
  });
});
