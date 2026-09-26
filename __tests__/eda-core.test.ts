import { describe, expect, it } from 'vitest';
import { applyEditBatch, parseEditBatch } from '../lib/eda/commands';
import { checkDocument } from '../lib/eda/checks';
import { createStarterDocument, parseDocument } from '../lib/eda/document';
import { commitBatch, createHistory, redo, undo } from '../lib/eda/history';
import { createComponent, pinPosition } from '../lib/eda/library';
import type { EditBatch, EdaDocument } from '../lib/eda/types';

const blank = (): EdaDocument => ({ ...createStarterDocument(), components: [], nets: [], tracks: [], appliedBatchIds: [] });
const batch = (doc: EdaDocument, commands: EditBatch['commands'], id = `batch-${doc.revision + 1}`): EditBatch => ({
  id, baseRevision: doc.revision, label: 'edit', actor: 'user', commands,
});

describe('EDA document core', () => {
  it('creates an independent, valid starter LED circuit with shared electrical graph', () => {
    const first = createStarterDocument();
    const second = createStarterDocument();
    expect(first.components.some((component) => component.kind === 'led')).toBe(true);
    expect(first.nets.length).toBeGreaterThan(0);
    expect(checkDocument(first).filter((issue) => issue.severity === 'error')).toEqual([]);
    first.components[0].value = 'changed';
    expect(second.components[0].value).not.toBe('changed');
  });

  it('rejects one pin appearing in two nets and duplicate references on import', () => {
    const doc = blank();
    const a = createComponent('resistor', 1);
    const b = createComponent('led', 1);
    doc.components = [a, b];
    doc.nets = [
      { id: 'n1', name: 'N1', nodes: [{ componentId: a.id, pinId: '1' }] },
      { id: 'n2', name: 'N2', nodes: [{ componentId: a.id, pinId: '1' }] },
    ];
    expect(() => parseDocument(doc)).toThrow(/pin|net/i);
    doc.nets = [];
    b.ref = a.ref;
    expect(() => parseDocument(doc)).toThrow(/ref/i);
  });

  it('rejects duplicate net names before they can silently merge in a native schematic', () => {
    const doc = createStarterDocument();
    doc.nets[1].name = doc.nets[0].name.toLowerCase();
    expect(() => parseDocument(doc)).toThrow(/net name/i);
  });

  it('rejects an ID reused by different graph entities', () => {
    const doc = createStarterDocument();
    doc.nets[0].id = doc.components[0].id;
    expect(() => parseDocument(doc)).toThrow(/duplicate.*id/i);
  });

  it('merges two nets on connect, invalidating their copper but preserving other tracks', () => {
    const doc = blank();
    const a = createComponent('resistor', 1);
    const b = createComponent('led', 1);
    const c = createComponent('connector2', 1);
    doc.components = [a, b, c];
    doc.nets = [
      { id: 'na', name: 'A', nodes: [{ componentId: a.id, pinId: '1' }] },
      { id: 'nb', name: 'B', nodes: [{ componentId: b.id, pinId: 'A' }] },
      { id: 'nc', name: 'C', nodes: [{ componentId: c.id, pinId: '1' }] },
    ];
    doc.tracks = ['na', 'nb', 'nc'].map((netId) => ({ id: `t-${netId}`, netId, layer: 'top' as const, width: 0.25, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }));
    const next = applyEditBatch(doc, batch(doc, [{ type: 'connectPins', a: { componentId: a.id, pinId: '1' }, b: { componentId: b.id, pinId: 'A' } }]));
    expect(next.nets).toHaveLength(2);
    expect(next.nets.find((net) => net.id === 'na')?.nodes).toHaveLength(2);
    expect(next.tracks.map((track) => track.id)).toEqual(['t-nc']);
    expect(doc.nets).toHaveLength(3);
  });

  it('removes dangling pins and affected tracks when a component is deleted', () => {
    const doc = createStarterDocument();
    const component = doc.components.find((item) => item.kind === 'led')!;
    const affected = doc.nets.filter((net) => net.nodes.some((node) => node.componentId === component.id)).map((net) => net.id);
    doc.tracks = [
      ...affected.map((netId) => ({ id: `track-${netId}`, netId, layer: 'top' as const, width: 0.25, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })),
      { id: 'other', netId: doc.nets.find((net) => !affected.includes(net.id))!.id, layer: 'top', width: 0.25, points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] } as const,
    ];
    const next = applyEditBatch(doc, batch(doc, [{ type: 'removeComponent', id: component.id }]));
    expect(next.nets.flatMap((net) => net.nodes).some((node) => node.componentId === component.id)).toBe(false);
    expect(next.tracks.map((track) => track.id)).toEqual(['other']);
  });

  it('applies batches atomically, rejects stale revisions and deduplicates IDs', () => {
    const doc = blank();
    const edit = batch(doc, [{ type: 'renameDocument', name: 'new' }, { type: 'removeComponent', id: 'missing' }]);
    expect(() => applyEditBatch(doc, edit)).toThrow();
    expect(doc.name).not.toBe('new');
    const good = batch(doc, [{ type: 'renameDocument', name: 'new' }], 'once');
    const next = applyEditBatch(doc, good);
    expect(next.revision).toBe(doc.revision + 1);
    expect(applyEditBatch(next, good)).toBe(next);
    expect(() => applyEditBatch(next, batch(doc, [{ type: 'renameDocument', name: 'stale' }], 'other'))).toThrow(/revision/i);
  });

  it('keeps a bounded replay ID window while revisions still reject old edits', () => {
    const doc = blank();
    doc.appliedBatchIds = Array.from({ length: 5000 }, (_, index) => `old-${index}`);
    const next = applyEditBatch(doc, batch(doc, [{ type: 'renameDocument', name: 'new' }], 'latest'));
    expect(next.appliedBatchIds).toHaveLength(5000);
    expect(next.appliedBatchIds.at(-1)).toBe('latest');
    expect(() => applyEditBatch(next, batch(doc, [{ type: 'renameDocument', name: 'old' }], 'old-0'))).toThrow(/revision/i);
  });

  it('rejects nonfinite, out-of-bounds and oversized imports and commands', () => {
    const doc = blank();
    expect(() => parseDocument({ ...doc, board: { width: Infinity, height: 5 } })).toThrow();
    expect(() => parseDocument({ ...doc, components: [{ ...createComponent('resistor'), schematic: { x: 1e9, y: 0, rotation: 0 } }] })).toThrow();
    expect(() => parseEditBatch({ id: 'bad', baseRevision: 0, label: 'x'.repeat(5000), actor: 'user', commands: [] })).toThrow();
  });

  it('rotates local pin geometry in millimetres', () => {
    const component = createComponent('resistor');
    component.schematic = { x: 10, y: 20, rotation: 90 };
    const pin = pinPosition(component, '1', 'schematic');
    expect(pin.x).toBeCloseTo(10);
    expect(pin.y).not.toBeCloseTo(20);
  });

  it('blocks movement of locked components and preserves unrelated copper on PCB moves', () => {
    const doc = createStarterDocument();
    const moved = doc.components.find((item) => item.kind === 'led')!;
    const unaffected = doc.nets.find((net) => !net.nodes.some((pin) => pin.componentId === moved.id))!;
    doc.tracks = doc.nets.map((net) => ({ id: `track-${net.id}`, netId: net.id, layer: 'top', width: 0.25, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }));
    const movedDoc = applyEditBatch(doc, batch(doc, [{ type: 'moveComponent', id: moved.id, view: 'pcb', x: 58, y: 28 }]));
    expect(movedDoc.tracks.map((track) => track.netId)).toEqual([unaffected.id]);
    moved.locked = true;
    expect(() => applyEditBatch(doc, batch(doc, [{ type: 'moveComponent', id: moved.id, view: 'schematic', x: 10, y: 10 }]))).toThrow(/locked/i);
  });

  it('undoes and redoes content with monotonically increasing revisions', () => {
    const doc = blank();
    const committed = commitBatch(createHistory(doc), batch(doc, [{ type: 'renameDocument', name: 'edited' }]));
    const undone = undo(committed);
    const redone = redo(undone);
    expect(undone.present.name).toBe(doc.name);
    expect(redone.present.name).toBe('edited');
    expect([doc.revision, committed.present.revision, undone.present.revision, redone.present.revision]).toEqual([0, 1, 2, 3]);
    expect(() => commitBatch(undone, batch(doc, [{ type: 'renameDocument', name: 'stale' }], 'stale'))).toThrow(/revision/i);
  });
});
