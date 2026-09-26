// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/eda/document';
import { createComponent } from '@/lib/eda/library';
import type { EdaDocument } from '@/lib/eda/types';
import { assessSchematicIntent, assessRevisionPreservation } from '@/lib/eda/evaluation';
import { LED_AGENT_SCENARIO } from '@/lib/eda/evaluation-scenarios';

function ledCircuit(): EdaDocument {
  const doc = createEmptyDocument();
  const connector = createComponent('header2');
  const resistor = createComponent('r0603');
  const led = createComponent('led0603');
  resistor.value = '470R';
  doc.components = [connector, resistor, led];
  doc.nets = [
    { id: 'vcc', name: 'VCC', nodes: [{ componentId: connector.id, pinId: '1' }, { componentId: resistor.id, pinId: '1' }] },
    { id: 'led-a', name: 'LED_A', nodes: [{ componentId: resistor.id, pinId: '2' }, { componentId: led.id, pinId: '2' }] },
    { id: 'gnd', name: 'GND', nodes: [{ componentId: led.id, pinId: '1' }, { componentId: connector.id, pinId: '2' }] },
  ];
  return doc;
}

describe('schematic intent checks', () => {
  it('reports malformed documents as failed evaluations instead of throwing', () => {
    const result = assessSchematicIntent({} as EdaDocument, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'invalid_document')).toBe(true);
  });
  it('accepts the intended physical LED topology independently of generated IDs and net names', () => {
    const doc = ledCircuit();
    doc.components.forEach((component, index) => { component.id = `generated-${index}`; });
    doc.nets.forEach(net => net.nodes.forEach(node => { node.componentId = `generated-${['header2-1', 'r0603-1', 'led0603-1'].indexOf(node.componentId)}`; }));
    doc.nets.forEach((net, index) => { net.name = `N${index}`; });
    expect(assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent).passed).toBe(true);
  });

  it('rejects a missing LED anode connection', () => {
    const doc = ledCircuit();
    doc.nets[1].nodes.pop();
    const result = assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'required_connection_missing')).toBe(true);
  });

  it('rejects reversed LED polarity even if ERC might accept the passive circuit', () => {
    const doc = ledCircuit();
    doc.nets[1].nodes[1].pinId = '1';
    doc.nets[2].nodes[0].pinId = '2';
    const result = assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'required_connection_missing')).toBe(true);
  });

  it('rejects a direct VCC-to-GND short and extra parts', () => {
    const doc = ledCircuit();
    doc.nets[0].nodes.push(...doc.nets[2].nodes);
    doc.nets.pop();
    doc.components.push(createComponent('c0603'));
    const result = assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'forbidden_connection_present')).toBe(true);
    expect(result.findings.some(item => item.code === 'unexpected_component')).toBe(true);
  });

  it('rejects a short across the resistor even when supply and ground remain separate', () => {
    const doc = ledCircuit();
    doc.nets[0].nodes.push(...doc.nets[1].nodes);
    doc.nets.splice(1, 1);
    const result = assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'distinct_connection_groups_merged')).toBe(true);
  });

  it('rejects a wrong resistor value despite otherwise correct graph', () => {
    const doc = ledCircuit();
    doc.components.find(component => component.kind === 'r0603')!.value = '10k';
    const result = assessSchematicIntent(doc, LED_AGENT_SCENARIO.steps[0].intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'component_value_mismatch')).toBe(true);
  });
});

describe('revision preservation checks', () => {
  it('allows a requested value edit while preserving existing devices and all old pin relations', () => {
    const before = ledCircuit();
    const after = structuredClone(before);
    after.components.find(component => component.kind === 'r0603')!.value = '1k';
    expect(assessRevisionPreservation(before, after, { allowedValueChanges: ['r0603-1'] }).passed).toBe(true);
  });

  it('detects removal of an old component', () => {
    const before = ledCircuit();
    const after = structuredClone(before);
    const removed = after.components.pop()!;
    after.nets = after.nets.map(net => ({ ...net, nodes: net.nodes.filter(node => node.componentId !== removed.id) })).filter(net => net.nodes.length > 0);
    expect(assessRevisionPreservation(before, after).findings.some(item => item.code === 'existing_component_removed')).toBe(true);
  });

  it('detects an unrelated wire being disconnected', () => {
    const before = ledCircuit();
    const after = structuredClone(before);
    after.nets[2].nodes.pop();
    expect(assessRevisionPreservation(before, after).findings.some(item => item.code === 'existing_topology_changed')).toBe(true);
  });

  it('detects an unintended short between formerly separate nets', () => {
    const before = ledCircuit();
    const after = structuredClone(before);
    after.nets[0].nodes.push(...after.nets[2].nodes);
    after.nets.pop();
    expect(assessRevisionPreservation(before, after).findings.some(item => item.code === 'existing_topology_changed')).toBe(true);
  });

  it('detects edits to prior placement, lock, board shape, track, and net name', () => {
    const before = ledCircuit();
    before.tracks = [{ id: 'old-track', netId: 'vcc', layer: 'top', width: 0.25, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }];
    const after = structuredClone(before);
    after.components[2].schematic.x += 1.27;
    after.components[1].locked = true;
    after.board.width += 1;
    after.tracks = [];
    after.nets[0].name = 'RENAMED_VCC';
    const codes = assessRevisionPreservation(before, after).findings.map(item => item.code);
    expect(codes).toContain('existing_component_moved');
    expect(codes).toContain('existing_component_lock_changed');
    expect(codes).toContain('board_changed');
    expect(codes).toContain('existing_track_changed');
    expect(codes).toContain('existing_net_renamed');
  });

  it('permits only explicitly named old pins to be rewired in a requested revision', () => {
    const before = createEmptyDocument();
    before.components = [createComponent('header4')];
    const after = structuredClone(before);
    after.components.push(createComponent('c0603'));
    after.nets = [{ id: 'added', name: 'ADDED', nodes: [{ componentId: 'header4-1', pinId: '3' }, { componentId: 'c0603-1', pinId: '1' }] }];
    expect(assessRevisionPreservation(before, after).passed).toBe(false);
    expect(assessRevisionPreservation(before, after, { allowedTopologyChanges: [{ componentId: 'header4-1', pinId: '3' }] }).passed).toBe(true);
  });
});
