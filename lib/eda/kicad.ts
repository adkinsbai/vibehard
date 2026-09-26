import { parseDocument } from "./document";
import { PARTS, pinPosition, type PartDefinition } from "./library";
import type { EdaComponent, EdaDocument } from "./types";
import { quoteSExpression as q } from "./sexpr";
import { childForms, formTag, replaceChild } from './native-forms';

// KiCad 8 file versions, accepted by KiCad 8 and later. All footprints are embedded
// illustrative SMD geometry, not catalog/foundry/manufacturer-verified packages.
const SCHEMATIC_VERSION = 20231120;
const BOARD_VERSION = 20240108;
const effects = "(effects (font (size 1.27 1.27)))";
const n = (value: number) => String(Number(value.toFixed(6)));
const angle = (clockwise: number) => n(((360 - clockwise) % 360 + 360) % 360);
const key = (componentId: string, pinId: string) => `${componentId}\u0000${pinId}`;

/** RFC 4122 UUID v5 (SHA-1, URL namespace). Pure JS so downloads also work offline. */
function uuid(name: string): string {
  const namespace = [0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0, 0xc0, 0x4f, 0xd4, 0x30, 0xc8];
  const input = new Uint8Array([...namespace, ...new TextEncoder().encode(`https://vibehard.local/eda/${name}`)]);
  const size = Math.ceil((input.length + 9) / 64) * 64; const bytes = new Uint8Array(size); bytes.set(input); bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer); view.setUint32(size - 4, input.length * 8, false);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const rotate = (value: number, shift: number) => (value << shift) | (value >>> (32 - shift));
  for (let offset = 0; offset < size; offset += 64) {
    const words = new Int32Array(80); for (let i = 0; i < 16; i++) words[i] = view.getInt32(offset + i * 4, false);
    for (let i = 16; i < 80; i++) words[i] = rotate(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const constant = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (rotate(a, 5) + f + e + constant + words[i]) | 0; e = d; d = c; c = rotate(b, 30); b = a; a = temp;
    }
    [a, b, c, d, e].forEach((value, i) => { h[i] = (h[i] + value) | 0; });
  }
  const result = new Uint8Array(20); const output = new DataView(result.buffer); h.forEach((v, i) => output.setInt32(i * 4, v, false));
  result[6] = (result[6] & 0x0f) | 0x50; result[8] = (result[8] & 0x3f) | 0x80;
  const hex = [...result.slice(0, 16)].map(v => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validated(input: EdaDocument) {
  const doc = parseDocument(input); const names = new Set<string>();
  for (const net of doc.nets) {
    if (names.has(net.name)) throw new Error(`Duplicate net name would merge separate networks: ${net.name}`);
    // Native labels interpret these as buses, escapes or text substitutions.
    if (/[\s{}[\]\\]/.test(net.name)) throw new Error(`KiCad export requires a scalar net name without spaces, braces or brackets: ${net.name}`);
    names.add(net.name);
  }
  return doc;
}

function librarySymbol(part: PartDefinition) {
  if (part.native) return part.native.symbol.replace(/^\(symbol\s+"[^"]+"/, `(symbol ${q(part.native.libraryId)}`);
  const width = part.symbol.width / 2; const height = part.symbol.height / 2;
  const pins = part.pins.map(pin => {
    const horizontal = Math.abs(pin.x) >= width;
    const rotation = horizontal ? (pin.x < 0 ? 0 : 180) : (pin.y < 0 ? 270 : 90);
    const length = Math.max(0, horizontal ? Math.abs(pin.x) - width : Math.abs(pin.y) - height);
    return `(pin ${pin.electrical} line (at ${n(pin.x)} ${n(-pin.y)} ${rotation}) (length ${n(length)}) (name ${q(pin.name)} ${effects}) (number ${q(pin.id)} ${effects}))`;
  });
  return `(symbol ${q(`VibeHard:${part.kind}`)} (pin_names (offset 0.508)) (in_bom yes) (on_board yes)
    (property "Reference" ${q(part.prefix)} (at 0 ${n(height + 3)} 0) ${effects})
    (property "Value" ${q(part.name)} (at 0 ${n(-height - 3)} 0) ${effects})
    (property "Footprint" ${q(part.footprint.name)} (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "ki_description" ${q(`UNVERIFIED generic symbol: ${part.description}`)} (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol ${q(`${part.kind}_0_1`)} (rectangle (start ${n(-width)} ${n(height)}) (end ${n(width)} ${n(-height)}) (stroke (width 0.254) (type default)) (fill (type background))))
    (symbol ${q(`${part.kind}_1_1`)} ${pins.join("\n")})
  )`;
}

export function exportKicadSchematic(input: EdaDocument): string {
  const doc = validated(input); const root = uuid(`${doc.id}/sheet`); const netByPin = new Map<string, string>();
  // Native KiCad symbols use 1.27 mm pin spacing. The editor and model can place
  // their centers freely, but off-grid pin endpoints cause real ERC violations.
  // parseDocument returned a copy, so the source draft retains its coordinates.
  const snap = (value: number) => Number((Math.round(value / 1.27) * 1.27).toFixed(6));
  for (const component of doc.components) if (PARTS[component.kind].native) {
    component.schematic.x = snap(component.schematic.x);
    component.schematic.y = snap(component.schematic.y);
  }
  doc.nets.forEach(net => net.nodes.forEach(pin => netByPin.set(key(pin.componentId, pin.pinId), net.id)));
  const positions = new Map<string, string>();
  for (const component of doc.components) for (const pin of PARTS[component.kind].pins) {
    const point = pinPosition(component, pin.id, "schematic"); const location = `${n(point.x)},${n(point.y)}`;
    const identity = netByPin.get(key(component.id, pin.id)) ?? `unconnected:${component.id}:${pin.id}`;
    if (positions.has(location) && positions.get(location) !== identity) throw new Error(`Coincident schematic pins would short different nets at ${location}; move the overlapping components`);
    positions.set(location, identity);
  }
  const kinds = [...new Set(doc.components.map(component => component.kind))].sort();
  const symbols = doc.components.map(component => {
    const position = component.schematic; const part = PARTS[component.kind]; const prefix = `${doc.id}/component/${component.id}`;
    return `(symbol (lib_id ${q(part.native?.libraryId ?? `VibeHard:${component.kind}`)}) (at ${n(position.x)} ${n(position.y)} ${angle(position.rotation)}) (unit 1) (in_bom yes) (on_board yes) (dnp no)
      (uuid ${uuid(`${prefix}/symbol`)})
      (property "Reference" ${q(component.ref)} (at ${n(position.x)} ${n(position.y - part.symbol.height / 2 - 3)} 0) ${effects})
      (property "Value" ${q(component.value)} (at ${n(position.x)} ${n(position.y + part.symbol.height / 2 + 3)} 0) ${effects})
      (property "Footprint" ${q(part.footprint.name)} (at ${n(position.x)} ${n(position.y)} 0) (effects (font (size 1.27 1.27)) hide))
      ${part.pins.map(pin => `(pin ${q(pin.id)} (uuid ${uuid(`${prefix}/pin/${pin.id}`)}))`).join("\n")}
      (instances (project "vibehard" (path ${q(`/${root}`)} (reference ${q(component.ref)}) (unit 1))))
    )`;
  });
  const byId = new Map(doc.components.map(component => [component.id, component]));
  const labels = doc.nets.flatMap(net => net.nodes.map(node => {
    const point = pinPosition(byId.get(node.componentId)!, node.pinId, "schematic");
    return `(global_label ${q(net.name)} (shape passive) (at ${n(point.x)} ${n(point.y)} 0) (effects (font (size 1.27 1.27)) (justify left)) (uuid ${uuid(`${doc.id}/net/${net.id}/${node.componentId}/${node.pinId}`)}))`;
  }));
  return `(kicad_sch (version ${SCHEMATIC_VERSION}) (generator "vibehard") (uuid ${root}) (paper "A4")
  (title_block (title ${q(doc.name)}) (rev ${q(String(doc.revision))})) (lib_symbols ${kinds.map(kind => librarySymbol(PARTS[kind])).join("\n")})
  ${labels.join("\n")} ${symbols.join("\n")}
  (sheet_instances (path "/" (page "1")))
)\n`;
}

function pcbFootprint(doc: EdaDocument, component: EdaComponent, nets: Map<string, { code: number; name: string }>) {
  const part = PARTS[component.kind]; const position = component.pcb; const side = position.side === "top" ? "F" : "B"; const prefix = `${doc.id}/component/${component.id}`;
  if (part.native) {
    let padIndex = 0;
    const forms = childForms(part.native.footprint).filter(form => !['version', 'generator', 'generator_version', 'layer', 'at', 'uuid', 'path'].includes(formTag(form))).map(form => {
      const tag = formTag(form);
      if (tag === 'property') {
        if (/^\(property\s+"Reference"/.test(form)) form = form.replace(/^(\(property\s+"Reference"\s+)"(?:[^"\\]|\\.)*"/, `$1${q(component.ref)}`);
        if (/^\(property\s+"Value"/.test(form)) form = form.replace(/^(\(property\s+"Value"\s+)"(?:[^"\\]|\\.)*"/, `$1${q(component.value)}`);
      }
      if (tag === 'pad') {
        const id = /^\(pad\s+"([^"]*)"/.exec(form)?.[1] ?? '';
        const net = nets.get(key(component.id, id));
        const at = childForms(form).find(node => formTag(node) === 'at');
        if (at) {
          const match = /^\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)/.exec(at);
          if (match) form = form.replace(at, `(at ${match[1]} ${match[2]} ${n(Number(match[3] || 0) + Number(angle(position.rotation)))})`);
        }
        form = replaceChild(form, 'net', `(net ${net?.code ?? 0} ${q(net?.name ?? '')})`);
        form = replaceChild(form, 'uuid', `(uuid ${uuid(`${prefix}/native-pad/${padIndex++}`)})`);
      }
      return side === 'B' ? form.replace(/"F\.(Cu|Paste|Mask|SilkS|Fab|CrtYd)"/g, '"B.$1"') : form;
    });
    return `(footprint ${q(part.footprint.name)} (layer "${side}.Cu") (uuid ${uuid(`${prefix}/footprint`)}) (at ${n(position.x)} ${n(position.y)} ${angle(position.rotation)}) (path ${q(`/${uuid(`${doc.id}/sheet`)}/${uuid(`${prefix}/symbol`)}`)}) ${forms.join('\n')})`;
  }
  const pad = part.pins.map(pin => {
    const net = nets.get(key(component.id, pin.id));
    return `(pad ${q(pin.id)} smd rect (at ${n(pin.pcbX)} ${n(pin.pcbY)} ${angle(position.rotation)}) (size ${n(part.footprint.padWidth)} ${n(part.footprint.padHeight)})
      (layers "${side}.Cu" "${side}.Paste" "${side}.Mask") (net ${net?.code ?? 0} ${q(net?.name ?? "")}) (pinfunction ${q(pin.name)}) (pintype ${q(pin.electrical)}) (uuid ${uuid(`${prefix}/pad/${pin.id}`)}))`;
  });
  const mirror = side === "B" ? " (justify mirror)" : "";
  return `(footprint ${q(part.footprint.name)} (layer "${side}.Cu") (uuid ${uuid(`${prefix}/footprint`)})
    (at ${n(position.x)} ${n(position.y)} ${angle(position.rotation)}) (descr ${q(`UNVERIFIED generic SMD geometry: ${part.description}`)})
    (property "Reference" ${q(component.ref)} (at 0 ${n(-part.footprint.height / 2 - 2)} ${angle(position.rotation)}) (layer "${side}.SilkS") (uuid ${uuid(`${prefix}/reference`)}) (effects (font (size 1 1) (thickness 0.15))${mirror}))
    (property "Value" ${q(component.value)} (at 0 ${n(part.footprint.height / 2 + 2)} ${angle(position.rotation)}) (layer "${side}.Fab") (uuid ${uuid(`${prefix}/value`)}) (effects (font (size 1 1) (thickness 0.15))${mirror}))
    (path ${q(`/${uuid(`${doc.id}/sheet`)}/${uuid(`${prefix}/symbol`)}`)}) (attr smd)
    (fp_rect (start ${n(-part.footprint.width / 2)} ${n(-part.footprint.height / 2)}) (end ${n(part.footprint.width / 2)} ${n(part.footprint.height / 2)}) (stroke (width 0.1) (type default)) (fill none) (layer "${side}.Fab") (uuid ${uuid(`${prefix}/body`)}))
    ${pad.join("\n")}
  )`;
}

export function exportKicadPcb(input: EdaDocument): string {
  const doc = validated(input); const nets = new Map<string, { code: number; name: string }>(); const code = new Map<string, number>();
  doc.nets.forEach((net, index) => { code.set(net.id, index + 1); net.nodes.forEach(pin => nets.set(key(pin.componentId, pin.pinId), { code: index + 1, name: net.name })); });
  const tracks = doc.tracks.flatMap(track => track.points.slice(1).map((point, index) => {
    const from = track.points[index];
    return `(segment (start ${n(from.x)} ${n(from.y)}) (end ${n(point.x)} ${n(point.y)}) (width ${n(track.width)}) (layer ${q(track.layer === "top" ? "F.Cu" : "B.Cu")}) (net ${code.get(track.netId)}) (uuid ${uuid(`${doc.id}/track/${track.id}/${index}`)}))`;
  }));
  return `(kicad_pcb (version ${BOARD_VERSION}) (generator "vibehard") (general (thickness 1.6)) (paper "A4")
    (title_block (title ${q(doc.name)}) (rev ${q(String(doc.revision))}))
    (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user) (47 "F.CrtYd" user) (48 "B.Fab" user) (49 "F.Fab" user))
    (setup (pad_to_mask_clearance 0))
    (net 0 "") ${doc.nets.map(net => `(net ${code.get(net.id)} ${q(net.name)})`).join("\n")}
    ${doc.components.map(component => pcbFootprint(doc, component, nets)).join("\n")}
    (gr_rect (start 0 0) (end ${n(doc.board.width)} ${n(doc.board.height)}) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts") (uuid ${uuid(`${doc.id}/edge`)}))
    ${tracks.join("\n")}
  )\n`;
}

/** RFC4180 quoting + spreadsheet formula neutralization on every text column. */
export function exportBomCsv(input: EdaDocument): string {
  const doc = parseDocument(input);
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  return [["Ref", "Value", "Kind", "Footprint", "Quantity"], ...doc.components.map(component => [component.ref, component.value, component.kind, PARTS[component.kind].footprint.name, "1"])].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function exportNetCsv(input: EdaDocument): string {
  const doc = parseDocument(input);
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  return [['Net', 'Component', 'Pin'], ...doc.nets.flatMap(net => net.nodes.map(node => [net.name, doc.components.find(c => c.id === node.componentId)!.ref, node.pinId]))].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
