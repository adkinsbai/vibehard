// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyEditBatch } from '@/lib/eda/commands';
import { createEmptyDocument } from '@/lib/eda/document';
import { parseDocument } from '@/lib/eda/document';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { importNativeSchematic } from '@/lib/eda/kicad-import';
import { modulePortPin, MODULES } from '@/lib/eda/modules';
import { createComponent } from '@/lib/eda/library';
import { checkDocument } from '@/lib/eda/checks';

describe('native module composition', () => {
  it('inserts a versioned LED module with stable external ports and native outputs', () => {
    const original = createEmptyDocument();
    const result = applyEditBatch(original, {
      id: 'insert-led-1', baseRevision: 0, actor: 'agent', label: 'Add LED indicator',
      commands: [{ type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } }],
    });
    expect(original.components).toHaveLength(0);
    expect(result.components.map(c => c.kind)).toEqual(['r0603', 'led0603']);
    expect(result.components.every(c => c.locked)).toBe(true);
    expect(result.nets).toHaveLength(1);
    expect(result.tracks).toMatchObject([{ id: 'status-led-inner-route', netId: 'status-led-inner', width: 0.25 }]);
    expect(result.moduleInstances).toMatchObject([{ id: 'status-led', moduleId: 'sample.led-indicator', version: '0.1.0' }]);
    expect(modulePortPin(result, 'status-led', 'vcc')).toEqual({ componentId: 'status-led-r', pinId: '1' });
    expect(modulePortPin(result, 'status-led', 'gnd')).toEqual({ componentId: 'status-led-d', pinId: '1' });
    expect(exportKicadSchematic(result)).toContain('(kicad_sch');
    expect(exportKicadPcb(result)).toContain('(kicad_pcb');
    expect(MODULES['sample.led-indicator'].verification).toBe('software-fixture');
  });

  it('rejects a duplicate module instance without changing the source', () => {
    const source = createEmptyDocument();
    const command = { type: 'insertModule' as const, moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } };
    const first = applyEditBatch(source, { id: 'first', baseRevision: 0, actor: 'agent', label: 'First', commands: [command] });
    expect(() => applyEditBatch(first, { id: 'second', baseRevision: 1, actor: 'agent', label: 'Second', commands: [command] })).toThrow(/module instance|duplicate/i);
    expect(source.components).toHaveLength(0);
  });

  it('protects module internals while allowing connections through declared ports', () => {
    const source = createEmptyDocument();
    const created = applyEditBatch(source, { id: 'insert', baseRevision: 0, actor: 'agent', label: 'Insert', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] });
    expect(() => applyEditBatch(created, { id: 'change-value', baseRevision: 1, actor: 'agent', label: 'Mutate internals', commands: [
      { type: 'setComponent', id: 'status-led-r', changes: { value: '1k' } },
    ] })).toThrow(/module|locked/i);
    expect(() => applyEditBatch(created, { id: 'connect-internal', baseRevision: 1, actor: 'agent', label: 'Internal pin', commands: [
      { type: 'connectPins', a: { componentId: 'status-led-r', pinId: '2' }, b: { componentId: 'status-led-d', pinId: '1' } },
    ] })).toThrow(/module port/i);
    expect(() => applyEditBatch(created, { id: 'remove-internal-track', baseRevision: 1, actor: 'agent', label: 'Internal trace', commands: [
      { type: 'removeTrack', id: 'status-led-inner-route' },
    ] })).toThrow(/module|locked/i);
  });

  it('rejects forged module provenance and changes to its internal net in imported JSON', () => {
    const created = applyEditBatch(createEmptyDocument(), { id: 'place', baseRevision: 0, actor: 'agent', label: 'Place', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] });
    const forged = structuredClone(created); forged.moduleInstances![0].sourceSha256 = '0'.repeat(64);
    expect(() => parseDocument(forged)).toThrow(/module source|hash|provenance/i);
    const rewired = structuredClone(created); rewired.nets[0].nodes.pop();
    expect(() => parseDocument(rewired)).toThrow(/module internal net/i);
    const retraced = structuredClone(created); retraced.tracks[0].points[0].x += 1;
    expect(() => parseDocument(retraced)).toThrow(/module internal track/i);
  });

  it('reports missing required ports and refuses to short module power to ground', () => {
    const created = applyEditBatch(createEmptyDocument(), { id: 'place-module', baseRevision: 0, actor: 'agent', label: 'Place', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] });
    expect(checkDocument(created).map(item => item.id)).toContain('module-port-status-led-vcc');
    const header = createComponent('header2'); header.id = 'power-header'; header.ref = 'J1';
    const connected = applyEditBatch(created, { id: 'connect-module', baseRevision: 1, actor: 'agent', label: 'Connect', commands: [
      { type: 'addComponent', component: header },
      { type: 'connectPins', a: { componentId: header.id, pinId: '1' }, b: modulePortPin(created, 'status-led', 'vcc'), netName: 'VCC' },
      { type: 'connectPins', a: { componentId: header.id, pinId: '2' }, b: modulePortPin(created, 'status-led', 'gnd'), netName: 'GND' },
    ] });
    expect(checkDocument(connected).some(item => item.id.startsWith('module-port-'))).toBe(false);
    expect(() => applyEditBatch(connected, { id: 'short-rails', baseRevision: 2, actor: 'agent', label: 'Short', commands: [
      { type: 'connectPins', a: { componentId: header.id, pinId: '1' }, b: { componentId: header.id, pinId: '2' } },
    ] })).toThrow(/power|ground|module port/i);
  });

  it('recovers module provenance when a saved native schematic is read back', () => {
    const created = applyEditBatch(createEmptyDocument(), { id: 'place-native', baseRevision: 0, actor: 'agent', label: 'Place', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] });
    const source = exportKicadSchematic(created);
    expect(source).toContain('VibeHard.Module');
    const netlist = `(export (version "E") (nets
      (net (code "1") (name "/status-led_LED_A") (node (ref "R1") (pin "2")) (node (ref "D1") (pin "2")))
      (net (code "2") (name "/VCC") (node (ref "R1") (pin "1")))
      (net (code "3") (name "/GND") (node (ref "D1") (pin "1")))))`;
    const restored = importNativeSchematic(source, netlist);
    expect(restored.moduleInstances).toMatchObject([{ id: 'status-led', moduleId: 'sample.led-indicator', version: '0.1.0' }]);
    expect(restored.components.map(item => item.id)).toEqual(['status-led-r', 'status-led-d']);
    expect(restored.nets.find(net => net.id === 'status-led-inner')?.nodes).toHaveLength(2);
    expect(restored.tracks).toMatchObject([{ id: 'status-led-inner-route', netId: 'status-led-inner' }]);
  });
});
