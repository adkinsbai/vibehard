// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '@/lib/eda/modules/sample-led/manifest.json';
import { validateModulePackage, verifyModuleNetlist } from '@/lib/eda/module-package';

const source = readFileSync(new URL('../lib/eda/modules/sample-led/module.kicad_sch', import.meta.url));
const payloads = {
  'module.kicad_sch': source,
  'module.kicad_pro': readFileSync(new URL('../lib/eda/modules/sample-led/module.kicad_pro', import.meta.url)),
  'module.kicad_pcb': readFileSync(new URL('../lib/eda/modules/sample-led/module.kicad_pcb', import.meta.url)),
  'sym-lib-table': readFileSync(new URL('../lib/eda/modules/sample-led/sym-lib-table', import.meta.url)),
};

describe('KiCad module package contract', () => {
  it('accepts the checked-in fixture, maps each port to a native pin, and requires native checks', () => {
    const result = validateModulePackage(manifest, payloads);
    expect(result.manifest.moduleId).toBe('sample.led-indicator');
    expect(result.nativeCheckRequired).toBe(true);
    expect(result.packageSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a changed source file, a wrong terminal, or an undeclared hierarchical port', () => {
    expect(() => validateModulePackage(manifest, { ...payloads, 'module.kicad_sch': Buffer.from('changed') })).toThrow(/SHA256/i);
    const terminal = structuredClone(manifest); terminal.ports[0].terminal.pin = '2';
    expect(() => validateModulePackage(terminal, payloads)).toThrow(/terminal|pin/i);
    const missing = structuredClone(manifest); missing.ports.pop();
    expect(() => validateModulePackage(missing, payloads)).toThrow(/undeclared/i);
  });

  it('checks the actual native netlist topology and port membership', () => {
    const nativeNetlist = `(export (version "E") (components (comp (ref "R1") (value "470R")) (comp (ref "D1") (value "LED"))) (nets
      (net (code "1") (name "/VCC") (node (ref "R1") (pin "1")))
      (net (code "2") (name "/LED_A") (node (ref "R1") (pin "2")) (node (ref "D1") (pin "2")))
      (net (code "3") (name "/GND") (node (ref "D1") (pin "1")))))`;
    expect(verifyModuleNetlist(manifest, nativeNetlist)).toEqual({ portNets: { vcc: 'VCC', gnd: 'GND' }, internalNetCount: 1 });
    expect(() => verifyModuleNetlist(manifest, nativeNetlist.replace('(name "/LED_A")', '(name "/GND")'))).toThrow(/network|net/i);
  });
});
