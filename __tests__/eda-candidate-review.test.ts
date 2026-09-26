// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/eda/document';
import { createComponent } from '@/lib/eda/library';
import { summarizeCandidateChanges } from '@/lib/eda/candidate-review';

describe('native Agent candidate review summary', () => {
  it('names added parts and pin-level network connections', () => {
    const before = createEmptyDocument();
    const after = structuredClone(before);
    const connector = createComponent('header2');
    const resistor = createComponent('r0603');
    resistor.value = '470R';
    after.components = [connector, resistor];
    after.nets = [{ id: 'supply', name: 'VCC', nodes: [
      { componentId: connector.id, pinId: '1' },
      { componentId: resistor.id, pinId: '1' },
    ] }];
    const summary = summarizeCandidateChanges(before, after);
    expect(summary).toContain('新增器件 J1 · Conn_01x02');
    expect(summary).toContain('新增器件 R1 · 470R');
    expect(summary).toContain('新增网络 VCC：J1.1 ↔ R1.1');
  });

  it('shows value and old-net changes across a revision', () => {
    const before = createEmptyDocument();
    const connector = createComponent('header2');
    const resistor = createComponent('r0603');
    resistor.value = '470R';
    before.components = [connector, resistor];
    before.nets = [{ id: 'supply', name: 'VCC', nodes: [
      { componentId: connector.id, pinId: '1' },
      { componentId: resistor.id, pinId: '1' },
    ] }];
    const after = structuredClone(before);
    after.components[1].value = '1k';
    after.nets[0].nodes = [{ componentId: connector.id, pinId: '1' }];
    const summary = summarizeCandidateChanges(before, after);
    expect(summary).toContain('修改 R1 参数：470R → 1k');
    expect(summary).toContain('修改网络 VCC：J1.1 ↔ R1.1 → J1.1');
  });

  it('returns a single unchanged line for equivalent content and rejects malformed input', () => {
    const before = createEmptyDocument();
    expect(summarizeCandidateChanges(before, structuredClone(before))).toEqual(['电路内容未改变']);
    const broken = structuredClone(before);
    broken.nets = [{ id: 'bad', name: 'BAD', nodes: [{ componentId: 'missing', pinId: '1' }] }];
    expect(() => summarizeCandidateChanges(before, broken)).toThrow(/missing component/i);
  });
});
