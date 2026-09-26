// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/eda/document';
import { createComponent } from '@/lib/eda/library';
import { exportKicadSchematic, exportKicadPcb } from '@/lib/eda/kicad';
import { importNativeSchematic, inspectNativeSchematic, importNativePcb } from '@/lib/eda/kicad-import';
describe('native schematic import', () => {
  it('restores placed real library parts and native-netlist connectivity', () => {
    const document = createEmptyDocument(); const a = createComponent('r0603', 1); const b = createComponent('r0603', 2);
    b.schematic = { x: 85, y: 60, rotation: 90 }; document.components = [a, b];
    const imported = importNativeSchematic(exportKicadSchematic(document), '(export (nets (net (code 1) (name "SIGNAL") (node (ref "R1") (pin "2")) (node (ref "R2") (pin "1")))))');
    expect(imported.components[1].schematic).toEqual({ x: 85.09, y: 59.69, rotation: 90 });
    expect(b.schematic).toEqual({ x: 85, y: 60, rotation: 90 }); // Export snaps the native file, not the editable draft.
    expect(imported.nets[0].nodes.map(n => n.pinId)).toEqual(['2', '1']);
    expect(imported.components[0].kind).toBe('r0603');
  });
  it('rejects unsupported structures and modified pinouts without discarding content', () => {
    expect(() => inspectNativeSchematic('(kicad_sch (sheet (file "secret")))')).toThrow(/子页/);
    const doc = { ...createEmptyDocument(), components: [createComponent('r0603')] };
    expect(() => importNativeSchematic(exportKicadSchematic(doc).replace('(lib_id "Device:R")', '(lib_id "Unknown:Thing")'), '(export (nets))')).toThrow(/尚未支持/);
  });
  it('roundtrips native PCB placements and tracks against the current schematic', () => {
    const doc = createEmptyDocument(); const a=createComponent('r0603',1); const b=createComponent('r0603',2);
    b.schematic.x=90; b.pcb={x:40,y:30,rotation:90,side:'bottom'};
    doc.components=[a,b]; doc.nets=[{id:'signal',name:'SIGNAL',nodes:[{componentId:a.id,pinId:'2'},{componentId:b.id,pinId:'1'}]}];
    doc.tracks=[{id:'copper',netId:'signal',layer:'top',width:.25,points:[{x:20.825,y:20},{x:40,y:29.175}]}];
    const imported=importNativePcb(exportKicadPcb(doc),doc);
    expect(imported.components).toEqual(doc.components);
    expect(imported.nets).toEqual(doc.nets);
    expect(imported.tracks[0].points).toEqual(doc.tracks[0].points);
  });
  it('rejects PCB net changes rather than silently changing the schematic', () => {
    const doc={...createEmptyDocument(),components:[createComponent('r0603')]};
    const source=exportKicadPcb(doc).replace('(pad "1" smd roundrect','(pad "99" smd roundrect');
    expect(()=>importNativePcb(source,doc)).toThrow(/焊盘/);
  });
});
