// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateModulePackage } from '@/lib/eda/module-package';

const source = Buffer.from('(kicad_sch (version 20250114) (hierarchical_label "VCC" (shape input)) (hierarchical_label "GND" (shape passive)))');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const packageFiles = { 'module.kicad_sch': source };
const manifest = () => ({
  schemaVersion: 1,
  moduleId: 'team.power-input',
  version: '1.0.0',
  review: { reviewer: 'hardware-team', reviewedAt: '2026-09-26', source: 'Internal reviewed schematic' },
  entrySchematic: 'module.kicad_sch',
  files: [{ path: 'module.kicad_sch', role: 'schematic', sha256: hash(source) }],
  ports: [
    { id: 'power-in', name: 'Power input', label: 'VCC', direction: 'input', signal: 'power', required: true, voltage: { min: 3.0, max: 3.6 } },
    { id: 'ground', name: 'Ground', label: 'GND', direction: 'passive', signal: 'ground', required: true },
  ],
});

describe('reviewed KiCad module package intake', () => {
  it('accepts a structurally consistent package but still requires native KiCad verification', () => {
    const result = validateModulePackage(manifest(), packageFiles);
    expect(result.manifest.moduleId).toBe('team.power-input');
    expect(result.nativeCheckRequired).toBe(true);
    expect(result.packageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateModulePackage(manifest(), packageFiles).packageSha256).toBe(result.packageSha256);
  });

  it('rejects a hierarchical label omitted from the manifest', () => {
    const candidate = manifest(); candidate.ports.pop();
    expect(() => validateModulePackage(candidate, packageFiles)).toThrow(/GND|undeclared/i);
  });

  it('rejects duplicate port mappings and wrong electrical direction', () => {
    const duplicate = manifest(); duplicate.ports[1].label = 'VCC';
    expect(() => validateModulePackage(duplicate, packageFiles)).toThrow(/duplicate/i);
    const direction = manifest(); direction.ports[0].direction = 'passive';
    expect(() => validateModulePackage(direction, packageFiles)).toThrow(/direction|shape/i);
  });

  it('rejects tampered files, undeclared files, and unsafe paths', () => {
    expect(() => validateModulePackage(manifest(), { 'module.kicad_sch': Buffer.from('tampered') })).toThrow(/sha256|hash/i);
    expect(() => validateModulePackage(manifest(), { ...packageFiles, 'extra.txt': Buffer.from('extra') })).toThrow(/undeclared/i);
    const unsafe = manifest(); unsafe.files[0].path = '../module.kicad_sch'; unsafe.entrySchematic = '../module.kicad_sch';
    expect(() => validateModulePackage(unsafe, { '../module.kicad_sch': source })).toThrow(/path/i);
  });

  it('rejects global labels that could join nets outside the declared module ports', () => {
    const leaked = Buffer.from('(kicad_sch (version 20250114) (hierarchical_label "VCC" (shape input)) (hierarchical_label "GND" (shape passive)) (global_label "HIDDEN_POWER" (shape passive)))');
    const candidate = manifest(); candidate.files[0].sha256 = hash(leaked);
    expect(() => validateModulePackage(candidate, { 'module.kicad_sch': leaked })).toThrow(/global label/i);
  });
});
