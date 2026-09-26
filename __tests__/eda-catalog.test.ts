// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PARTS, createComponent } from '@/lib/eda/library';
import { createEmptyDocument, parseDocument } from '@/lib/eda/document';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
describe('official library parts', () => {
  it('retains actual MCU pins and manufacturer-specific library identity', () => {
    expect(PARTS.esp32wroom32.native?.libraryId).toBe('RF_Module:ESP32-WROOM-32');
    expect(PARTS.esp32wroom32.pins.length).toBeGreaterThan(30);
    expect(PARTS.tmp102.native?.libraryId).toBe('Sensor_Temperature:TMP102xxDRL');
    expect(PARTS.r0603.native?.pads[0]).toMatchObject({ x: -0.825, width: 0.8, height: 0.95 });
  });
  it('embeds original symbols and complete native footprint pad geometry', () => {
    const doc = parseDocument({ ...createEmptyDocument(), components: [createComponent('r0603')] });
    expect(exportKicadSchematic(doc)).toContain('(lib_id "Device:R")');
    expect(exportKicadPcb(doc)).toContain('roundrect_rratio 0.25');
    expect(exportKicadPcb(doc)).toContain('F.CrtYd');
  });
  it('starts empty instead of seeding a sample circuit', () => {
    expect(createEmptyDocument().components).toEqual([]);
    expect(createEmptyDocument().id).not.toBe(createEmptyDocument().id);
  });
  it('preserves the official stacked ground pins as one electrical net', () => {
    const doc = parseDocument({ ...createEmptyDocument(), components: [createComponent('esp32wroom32')] });
    expect(doc.nets).toHaveLength(1);
    expect(doc.nets[0].nodes.map(p => p.pinId)).toEqual(['1', '15', '38', '39']);
    expect(() => exportKicadSchematic(doc)).not.toThrow();
  });
  it('rejects connecting an ESP32 NC pad instead of silently dropping it in KiCad', () => {
    const component = createComponent('esp32wroom32');
    expect(() => parseDocument({ ...createEmptyDocument(), components: [component], nets: [{ id: 'nc', name: 'NC_BAD', nodes: [{ componentId: component.id, pinId: '32' }] }] })).toThrow(/NC/);
  });
});
