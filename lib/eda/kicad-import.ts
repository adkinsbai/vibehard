import { parseSExpression, type SExpression } from './sexpr';
import { PARTS, createComponent } from './library';
import { createEmptyDocument, parseDocument } from './document';
import type { EdaDocument, EdaNet } from './types';
type Node = SExpression[];
const nodes = (node: Node, tag: string) => node.filter((v): v is Node => Array.isArray(v) && v[0] === tag);
const one = (node: Node, tag: string) => nodes(node, tag)[0] ?? [];
const prop = (node: Node, name: string) => String(nodes(node, 'property').find(v => v[1] === name)?.[2] ?? '');
export function inspectNativeSchematic(source: string) {
  const root = parseSExpression(source);
  if (!Array.isArray(root) || root[0] !== 'kicad_sch') throw new Error('需要 KiCad 原理图文件');
  if (nodes(root, 'sheet').length) throw new Error('当前导入不支持分层子页；请导入单页工程');
  if (nodes(root, 'symbol').length > 200) throw new Error('单次导入最多 200 个器件');
  if (nodes(root, 'text').length || nodes(root, 'text_box').length || nodes(root, 'image').length) throw new Error('文件包含尚未支持编辑的独立文字或图片，不能无损导入');
  return root;
}
/** Native CLI netlist is the authority for wires/junctions/labels. Unsupported library parts fail explicitly. */
export function importNativeSchematic(source: string, nativeNetlist: string): EdaDocument {
  const root = inspectNativeSchematic(source); const netlist = parseSExpression(nativeNetlist);
  if (!Array.isArray(netlist) || netlist[0] !== 'export') throw new Error('KiCad 未返回有效网表');
  const document = createEmptyDocument();
  document.name = String(one(one(root, 'title_block'), 'title')[1] || '导入的 KiCad 电路');
  const embedded = nodes(one(root, 'lib_symbols'), 'symbol');
  document.components = nodes(root, 'symbol').map((symbol, index) => {
    const id = String(one(symbol, 'lib_id')[1]);
    const part = Object.values(PARTS).find(part => part.native?.libraryId === id || `VibeHard:${part.kind}` === id);
    if (!part) throw new Error(`器件库尚未支持 ${id}，当前工程未导入`);
    const definition = embedded.find(v => v[1] === id);
    if (!definition) throw new Error(`缺少嵌入式符号 ${id}`);
    const pins = nodes(definition, 'symbol').flatMap(unit => nodes(unit, 'pin'));
    if (pins.length !== part.pins.length || pins.some(pin => {
      const known = part.pins.find(p => p.id === String(one(pin, 'number')[1]));
      return !known || known.electrical !== pin[1] || Math.abs(known.x - Number(one(pin, 'at')[1])) > .00001 || Math.abs(known.y + Number(one(pin, 'at')[2])) > .00001;
    })) throw new Error(`${id} 的引脚定义与当前库不一致，不能安全导入`);
    if (Number(one(symbol, 'unit')[1] || 1) !== 1 || one(symbol, 'mirror').length) throw new Error('当前不支持多单元或镜像符号导入');
    const component = createComponent(part.kind, index + 1);
    component.id = String(one(symbol, 'uuid')[1]); component.ref = prop(symbol, 'Reference'); component.value = prop(symbol, 'Value');
    const placement = one(symbol, 'at');
    component.schematic = { x: Number(placement[1]), y: Number(placement[2]), rotation: (360 - Number(placement[3] || 0)) % 360 };
    component.pcb = { x: 20 + (index % 8) * 30, y: 20 + Math.floor(index / 8) * 35, rotation: 0, side: 'top' };
    return component;
  });
  document.board = { width: Math.max(80, Math.min(8, document.components.length) * 30 + 20), height: Math.max(55, Math.ceil(document.components.length / 8) * 35 + 20) };
  document.nets = nodes(one(netlist, 'nets'), 'net').filter(net => !String(one(net, 'name')[1]).startsWith('unconnected-')).map((net, index): EdaNet => ({ id: `import-net-${index + 1}`, name: String(one(net, 'name')[1]).replace(/^\//, ''), nodes: nodes(net, 'node').map(node => {
    const reference = String(one(node, 'ref')[1]); const component = document.components.find(c => c.ref === reference);
    if (!component) throw new Error(`网表引用未知器件 ${reference}`);
    return { componentId: component.id, pinId: String(one(node, 'pin')[1]) };
  }) }));
  return parseDocument(document);
}

/** Single rectangular, two-layer boards. Refuse unsupported copper instead of silently deleting it. */
export function importNativePcb(source: string, base?: EdaDocument): EdaDocument {
  const root = parseSExpression(source);
  if (!Array.isArray(root) || root[0] !== 'kicad_pcb') throw new Error('需要 KiCad PCB 文件');
  if (['via', 'zone', 'arc', 'group', 'gr_text', 'gr_poly', 'gr_arc'].some(tag => nodes(root, tag).length)) throw new Error('PCB 含有尚未支持的过孔、铺铜、弧线或注释；当前不能无损导入');
  const layers = one(root, 'layers').filter((v): v is Node => Array.isArray(v));
  if (layers.some(layer => layer[2] === 'signal' && !['F.Cu', 'B.Cu'].includes(String(layer[1])))) throw new Error('当前工作台支持双层板');
  const edge = nodes(root, 'gr_rect').filter(node => one(node, 'layer')[1] === 'Edge.Cuts');
  if (edge.length !== 1 || nodes(root, 'gr_line').some(node => one(node, 'layer')[1] === 'Edge.Cuts')) throw new Error('当前导入需要一个矩形板框');
  const a = one(edge[0], 'start'); const b = one(edge[0], 'end');
  const left = Math.min(Number(a[1]), Number(b[1])); const top = Math.min(Number(a[2]), Number(b[2]));
  const doc = base ? parseDocument(base) : createEmptyDocument();
  const previous = doc.components;
  doc.board = { width: Math.abs(Number(a[1])-Number(b[1])), height: Math.abs(Number(a[2])-Number(b[2])) };
  const nativeNets = new Map(nodes(root, 'net').map(net => [Number(net[1]), { id: `pcb-net-${net[1]}`, name: String(net[2]), nodes: [] } as EdaNet]));
  const footprints = nodes(root, 'footprint');
  if (footprints.length > 200) throw new Error('单次导入最多 200 个器件');
  doc.components = footprints.map((fp, index) => {
    const part = Object.values(PARTS).find(part => part.footprint.name === fp[1]);
    if (!part) throw new Error(`封装库尚未支持 ${fp[1]}`);
    const ref = prop(fp, 'Reference'); const existing = previous.find(c => c.ref === ref);
    if (base && (!existing || existing.kind !== part.kind)) throw new Error(`PCB 器件 ${ref} 与当前原理图不一致`);
    const component = existing ? structuredClone(existing) : createComponent(part.kind, index + 1);
    component.ref = ref; component.value = prop(fp, 'Value');
    if (!existing) component.schematic = { x: 30 + (index % 5)*40, y: 35 + Math.floor(index / 5)*45, rotation: 0 };
    const at = one(fp, 'at'); const layer = String(one(fp, 'layer')[1]);
    if (!['F.Cu', 'B.Cu'].includes(layer)) throw new Error('不支持的封装层');
    component.pcb = { x: Number(at[1])-left, y: Number(at[2])-top, rotation: (360-Number(at[3]||0))%360, side: layer === 'B.Cu' ? 'bottom' : 'top' };
    const pads = nodes(fp, 'pad');
    if (part.native && pads.length !== part.native.pads.length) throw new Error(`${ref} 焊盘数量已修改`);
    for (const pad of pads) {
      const id = String(pad[1]); const pin = part.pins.find(pin => pin.id === id);
      if (!pin) throw new Error(`${ref} 的焊盘 ${id} 与库不一致`);
      if (part.native) {
        const pos = one(pad, 'at'); const size = one(pad, 'size');
        if (!part.native.pads.some(p => p.id === id && p.type === pad[2] && p.shape === pad[3] && Math.abs(p.drill-Number(one(pad,'drill')[1]||0))<.00001 && Math.abs(p.x-Number(pos[1]))<.00001 && Math.abs(p.y-Number(pos[2]))<.00001 && Math.abs(p.width-Number(size[1]))<.00001 && Math.abs(p.height-Number(size[2]))<.00001)) throw new Error(`${ref} 的封装已修改，不能安全映射到当前库`);
      }
      const code = Number(one(pad, 'net')[1] || 0); if (!code) continue;
      const net = nativeNets.get(code); if (!net) throw new Error('焊盘引用未知网络');
      if (!net.nodes.some(node => node.componentId === component.id && node.pinId === id)) net.nodes.push({ componentId: component.id, pinId: id });
    }
    if (part.pins.some(pin => !pads.some(pad => pad[1] === pin.id))) throw new Error(`${ref} 缺少物理焊盘`);
    return component;
  });
  if (base && previous.length !== doc.components.length) throw new Error('PCB 器件数量与当前原理图不一致');
  const importedNets = [...nativeNets.entries()].filter(([code, net]) => code > 0 && net.nodes.length).map(([, net]) => net);
  if (base) {
    const signature = (net: EdaNet) => net.nodes.map(node => `${node.componentId}:${node.pinId}`).sort().join('|');
    for (const net of importedNets) {
      const match = doc.nets.find(n => n.name === net.name && signature(n) === signature(net));
      if (!match) throw new Error(`PCB 网络 ${net.name} 与当前原理图不一致`);
      net.id = match.id;
    }
    if (importedNets.length !== doc.nets.length) throw new Error('PCB 网络数量与当前原理图不一致');
  }
  doc.nets = importedNets;
  doc.tracks = nodes(root, 'segment').map((segment, index) => {
    const net = nativeNets.get(Number(one(segment, 'net')[1]));
    if (!net || !net.nodes.length) throw new Error('走线引用未知或无焊盘网络');
    const layer = String(one(segment, 'layer')[1]); if (!['F.Cu','B.Cu'].includes(layer)) throw new Error('走线层不受支持');
    return { id: `import-track-${index}`, netId: net.id, layer: layer === 'F.Cu' ? 'top' : 'bottom', width: Number(one(segment, 'width')[1]), points: ['start','end'].map(key => { const p=one(segment,key); return {x:Number(p[1])-left,y:Number(p[2])-top}; }) };
  });
  doc.revision++; doc.appliedBatchIds = [];
  return parseDocument(doc);
}
