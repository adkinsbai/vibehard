import { createEmptyDocument, parseDocument } from '@/lib/eda/document';
import { createComponent, pinPosition } from '@/lib/eda/library';
import type { EdaDocument } from '@/lib/eda/types';
/** Test-only physical geometry fixture; never seeded into a user's project. */
export function engineeringFixture(): EdaDocument {
  const doc=createEmptyDocument(); doc.name='Engineering regression';
  const j=createComponent('header2'); const r=createComponent('r0603'); const d=createComponent('led0603');
  j.schematic={x:25.4,y:50.8,rotation:0}; r.schematic={x:76.2,y:50.8,rotation:270}; d.schematic={x:127,y:50.8,rotation:180};
  j.pcb={x:10,y:20,rotation:0,side:'top'};r.pcb={x:20,y:20,rotation:0,side:'top'};d.pcb={x:30,y:20,rotation:180,side:'top'};
  doc.components=[j,r,d];
  doc.nets=[
    {id:'vcc',name:'VCC',nodes:[{componentId:j.id,pinId:'1'},{componentId:r.id,pinId:'1'}]},
    {id:'led',name:'LED_A',nodes:[{componentId:r.id,pinId:'2'},{componentId:d.id,pinId:'2'}]},
    {id:'gnd',name:'GND',nodes:[{componentId:d.id,pinId:'1'},{componentId:j.id,pinId:'2'}]},
  ];
  doc.tracks=doc.nets.map(net=>{const a=net.nodes[0],b=net.nodes[1];const start=pinPosition(doc.components.find(c=>c.id===a.componentId)!,a.pinId,'pcb');const end=pinPosition(doc.components.find(c=>c.id===b.componentId)!,b.pinId,'pcb');return {id:`track-${net.id}`,netId:net.id,layer:'top',width:.25,points:net.id==='gnd'?[start,{x:35,y:20},{x:35,y:28},{x:10,y:28},end]:[start,end]};});
  return parseDocument(doc);
}
