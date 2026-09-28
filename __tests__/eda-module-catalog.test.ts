// @vitest-environment node
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from '@/lib/eda/modules/sample-led/manifest.json';
import { compileNativeModule, publishModuleVersion, publicModuleDefinitions, type ModuleVersionRecord } from '@/lib/eda/module-catalog';
import { configuredHardwareReviewerIds, moduleMutationSameOrigin } from '@/lib/server/eda-module-catalog';
import { catalogFromDefinitions } from '@/lib/eda/modules';
import { createEmptyDocument, parseDocument } from '@/lib/eda/document';
import { applyEditBatch } from '@/lib/eda/commands';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { loadEdaProject, saveEdaProject } from '@/lib/server/eda-store';

const payloads = Object.fromEntries(fixture.files.map(file => [file.path, readFileSync(new URL(`../lib/eda/modules/sample-led/${file.path}`, import.meta.url))]));
const nativeNetlist = `(export (version "E") (components (comp (ref "R1") (value "470R")) (comp (ref "D1") (value "LED"))) (nets
  (net (code "1") (name "/VCC") (node (ref "R1") (pin "1")))
  (net (code "2") (name "/LED_A") (node (ref "R1") (pin "2")) (node (ref "D1") (pin "2")))
  (net (code "3") (name "/GND") (node (ref "D1") (pin "1")))))`;

describe('native module publication gate', () => {
  it('compiles a native package into source-pinned parts, ports and PCB traces', () => {
    const compiled = compileNativeModule(fixture, payloads, nativeNetlist);
    expect(compiled.definition).toMatchObject({
      moduleId: 'sample.led-indicator', version: '0.1.0', verification: 'software-fixture',
      parts: [{ sourceRef: 'R1', kind: 'r0603' }, { sourceRef: 'D1', kind: 'led0603' }],
      tracks: [{ netLocalId: 'net-1', width: 0.25 }],
    });
    expect(compiled.definition.sourceSha256).toBe(compiled.packageSha256);
  });

  it('will not publish a software fixture even with reviewer approval', () => {
    const compiled = compileNativeModule(fixture, payloads, nativeNetlist);
    const record: ModuleVersionRecord = { ...compiled, status: 'pending', submittedBy: 'alice', reviewedBy: null, reviewedAt: null, reviewReference: null };
    expect(() => publishModuleVersion(record, { reviewerId: 'bob', reviewReference: 'HW-123' }, new Set(['bob']))).toThrow(/fixture|reviewed/i);
    expect(publicModuleDefinitions([record])).toEqual([]);
  });

  it('requires a separate reviewer, a native-checked reviewed package and explicit reference', () => {
    const reviewed = structuredClone(fixture) as unknown as Record<string, unknown>;
    reviewed.moduleId = 'approved.led-indicator'; reviewed.verification = 'reviewed'; reviewed.review = { reviewer: 'Hardware engineer', reviewedAt: '2026-09-28', source: 'HW-123' };
    const compiled = compileNativeModule(reviewed, payloads, nativeNetlist);
    const record: ModuleVersionRecord = { ...compiled, status: 'pending', submittedBy: 'alice', reviewedBy: null, reviewedAt: null, reviewReference: null };
    expect(() => publishModuleVersion(record, { reviewerId: 'bob', reviewReference: 'HW-123' }, new Set())).toThrow(/authorized hardware engineer/i);
    expect(() => publishModuleVersion(record, { reviewerId: 'carol', reviewReference: 'HW-123' }, new Set(['bob']))).toThrow(/authorized hardware engineer/i);
    expect(() => publishModuleVersion(record, { reviewerId: 'alice', reviewReference: 'HW-123' }, new Set(['alice']))).toThrow(/separate/i);
    expect(() => publishModuleVersion(record, { reviewerId: 'bob', reviewReference: '' }, new Set(['bob']))).toThrow(/reference/i);
    const published = publishModuleVersion(record, { reviewerId: 'bob', reviewReference: 'HW-123' }, new Set(['bob']));
    expect(publicModuleDefinitions([record])).toEqual([]);
    expect(publicModuleDefinitions([published])).toEqual([compiled.definition]);
    expect(publicModuleDefinitions([{ ...published, reviewedAt: null }])).toEqual([]);
    expect(() => publishModuleVersion(published, { reviewerId: 'bob', reviewReference: 'HW-123' }, new Set(['bob']))).toThrow(/pending/i);
  });

  it('fails closed without a configured hardware reviewer UUID allowlist', () => {
    expect(configuredHardwareReviewerIds('')).toEqual(new Set());
    expect(configuredHardwareReviewerIds('not-a-uuid')).toEqual(new Set());
    const id = '11111111-1111-4111-8111-111111111111';
    expect(configuredHardwareReviewerIds(id).has(id)).toBe(true);
  });

  it('accepts an independent pending-review source but hides it until authorized hardware review', () => {
    const directory = new URL('../docs/eda-module-candidates/led-indicator/', import.meta.url);
    const candidate = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
    const nativeFiles = Object.fromEntries(candidate.files.map((file: { path: string }) => [file.path, readFileSync(new URL(file.path, directory))]));
    const compiled = compileNativeModule(candidate, nativeFiles, nativeNetlist);
    expect(compiled.definition.verification).toBe('pending-review');
    const record: ModuleVersionRecord = { ...compiled, status: 'pending', submittedBy: 'alice', reviewedBy: null, reviewedAt: null, reviewReference: null };
    expect(publicModuleDefinitions([record])).toEqual([]);
    const published = publishModuleVersion(record, { reviewerId: 'bob', reviewReference: 'HW-REAL-REPORT' }, new Set(['bob']));
    expect(publicModuleDefinitions([published])).toMatchObject([{ moduleId: 'candidate.led-indicator', verification: 'reviewed', sourceSha256: compiled.packageSha256 }]);
  });

  it('pins a published definition through edit, native export and per-user project persistence', async () => {
    const directory = new URL('../docs/eda-module-candidates/led-indicator/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
    const files = Object.fromEntries(manifest.files.map((file: { path: string }) => [file.path, readFileSync(new URL(file.path, directory))]));
    const compiled = compileNativeModule(manifest, files, nativeNetlist);
    const record: ModuleVersionRecord = { ...compiled, status: 'pending', submittedBy: 'alice', reviewedBy: null, reviewedAt: null, reviewReference: null };
    const catalog = catalogFromDefinitions(publicModuleDefinitions([publishModuleVersion(record, { reviewerId: 'bob', reviewReference: 'HW-REAL-REPORT' }, new Set(['bob']))]));
    const placed = applyEditBatch(createEmptyDocument(), { id: 'candidate-placement', actor: 'agent', baseRevision: 0, label: 'Add reviewed module', commands: [
      { type: 'insertModule', moduleId: manifest.moduleId, version: manifest.version, instanceId: 'led-mod', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] }, catalog);
    expect(placed.moduleInstances?.[0].sourceSha256).toBe(compiled.packageSha256);
    expect(exportKicadSchematic(placed, catalog)).toContain('VibeHard.Module');
    expect(exportKicadPcb(placed, catalog)).toContain('kicad_pcb');
    expect(() => parseDocument(placed)).toThrow(/module source|provenance/i);
    const root = await mkdtemp(join(tmpdir(), 'vibehard-module-catalog-test-'));
    try {
      const owner = '11111111-1111-4111-8111-111111111111';
      const project = '22222222-2222-4222-8222-222222222222';
      const saved = await saveEdaProject(owner, project, placed, null, root, catalog);
      expect(saved.version).toBe(1);
      expect((await loadEdaProject(owner, project, root, catalog))?.document.moduleInstances?.[0].sourceSha256).toBe(compiled.packageSha256);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects cross-origin browser mutations while allowing same-origin and server clients', () => {
    const request = (origin?: string) => new Request('https://ldcx.tech/vibehard/api/eda/modules', { method: 'POST', headers: { host: 'ldcx.tech', ...(origin ? { origin } : {}) } });
    expect(moduleMutationSameOrigin(request('https://ldcx.tech'))).toBe(true);
    expect(moduleMutationSameOrigin(request('https://evil.example'))).toBe(false);
    expect(moduleMutationSameOrigin(request('http://ldcx.tech'))).toBe(false);
    expect(moduleMutationSameOrigin(request())).toBe(true);
  });
});
