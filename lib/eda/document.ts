import { z } from 'zod';
import { PARTS, createComponent, equivalentPinIds } from './library';
import type { EdaDocument } from './types';

export const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'IDs must use ASCII letters, digits, underscore or hyphen');
export const textSchema = z.string().min(1).max(128).refine((value) => value.trim().length > 0, 'Text cannot be blank');
export const coordinateSchema = z.number().finite().min(-10000).max(10000);
export const rotationSchema = z.number().finite().min(-36000).max(36000);
export const dimensionSchema = z.number().finite().min(1).max(1000);
export const positionSchema = z.strictObject({ x: coordinateSchema, y: coordinateSchema, rotation: rotationSchema });
export const pinRefSchema = z.strictObject({ componentId: idSchema, pinId: idSchema });
export const componentSchema = z.strictObject({
  id: idSchema, ref: z.string().min(1).max(32).regex(/^[A-Za-z]+[1-9][0-9]*$/, 'Invalid reference designator'),
  kind: z.enum(['resistor', 'capacitor', 'led', 'connector2', 'connector4', 'mcu', 'sensor', 'r0603', 'c0603', 'led0603', 'header2', 'header4', 'esp32wroom32', 'tmp102']),
  value: z.string().max(256), schematic: positionSchema,
  pcb: positionSchema.extend({ side: z.enum(['top', 'bottom']) }), locked: z.boolean(),
});
export const trackSchema = z.strictObject({
  id: idSchema, netId: idSchema, layer: z.enum(['top', 'bottom']),
  width: z.number().finite().min(0.05).max(10),
  points: z.array(z.strictObject({ x: coordinateSchema, y: coordinateSchema })).min(2).max(2000),
});
const documentSchema = z.strictObject({
  schemaVersion: z.literal(1), id: idSchema, name: textSchema,
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  components: z.array(componentSchema).max(1000),
  nets: z.array(z.strictObject({ id: idSchema, name: textSchema, nodes: z.array(pinRefSchema).min(1).max(1000) })).max(2000),
  tracks: z.array(trackSchema).max(5000),
  board: z.strictObject({ width: dimensionSchema, height: dimensionSchema }),
  appliedBatchIds: z.array(idSchema).max(5000),
});

function unique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.toUpperCase();
    if (seen.has(normalized)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(normalized);
  }
}

export function parseDocument(input: unknown): EdaDocument {
  let candidate = input;
  if (typeof input === 'string') {
    if (input.length > 1_000_000) throw new Error('EDA document exceeds 1 MB limit');
    try { candidate = JSON.parse(input); } catch { throw new Error('Invalid EDA document JSON'); }
  }
  let serialized: string;
  try { serialized = JSON.stringify(candidate); } catch { throw new Error('EDA document is not serializable'); }
  if (!serialized || serialized.length > 1_000_000) throw new Error('EDA document exceeds 1 MB limit');
  const result = documentSchema.safeParse(candidate);
  if (!result.success) throw new Error(`Invalid EDA document: ${result.error.issues[0]?.path.join('.') || 'root'} ${result.error.issues[0]?.message || ''}`);
  const doc = result.data;
  // Preserve the native symbol's implicit connectivity in the explicit PCB graph.
  for (const component of doc.components) {
    if (!PARTS[component.kind].native) continue;
    const done = new Set<string>();
    for (const pin of PARTS[component.kind].pins) {
      const ids = equivalentPinIds(component, pin.id);
      if (ids.length < 2 || done.has(pin.id)) continue;
      ids.forEach(id => done.add(id));
      const owners = doc.nets.filter(net => net.nodes.some(node => node.componentId === component.id && ids.includes(node.pinId)));
      if (owners.length > 1) throw new Error(`Stacked pins on ${component.ref} cannot belong to different nets`);
      let net = owners[0];
      if (!net) {
        let index = 1; let id = `stack-${component.id}-${index}`;
        while (doc.nets.some(n => n.id === id || n.name.toUpperCase() === id.toUpperCase())) id = `stack-${component.id}-${++index}`;
        net = { id, name: id, nodes: [] }; doc.nets.push(net);
      }
      for (const id of ids) if (!net.nodes.some(n => n.componentId === component.id && n.pinId === id)) net.nodes.push({ componentId: component.id, pinId: id });
    }
  }
  unique(doc.components.map((component) => component.id), 'component ID');
  unique(doc.components.map((component) => component.ref), 'component ref');
  unique(doc.nets.map((net) => net.id), 'net ID');
  unique(doc.nets.map((net) => net.name), 'net name');
  unique(doc.tracks.map((track) => track.id), 'track ID');
  unique([doc.id, ...doc.components.map((component) => component.id), ...doc.nets.map((net) => net.id), ...doc.tracks.map((track) => track.id)], 'entity ID');
  unique(doc.appliedBatchIds, 'batch ID');
  const components = new Map(doc.components.map((component) => [component.id, component]));
  const netIds = new Set(doc.nets.map((net) => net.id));
  const ownedPins = new Set<string>();
  for (const net of doc.nets) {
    for (const node of net.nodes) {
      const component = components.get(node.componentId);
      if (!component) throw new Error(`Net ${net.id} references missing component ${node.componentId}`);
      if (!PARTS[component.kind].pins.some((pin) => pin.id === node.pinId)) throw new Error(`Net ${net.id} references unknown pin ${component.ref}.${node.pinId}`);
      if (PARTS[component.kind].pins.find(pin => pin.id === node.pinId)?.electrical === 'no_connect') throw new Error(`${component.ref}.${node.pinId} is a native NC pin and cannot be connected`);
      const key = `${node.componentId}\u0000${node.pinId}`;
      if (ownedPins.has(key)) throw new Error(`Pin ${component.ref}.${node.pinId} belongs to multiple nets`);
      ownedPins.add(key);
    }
  }
  for (const track of doc.tracks) {
    if (!netIds.has(track.netId)) throw new Error(`Track ${track.id} references missing net ${track.netId}`);
  }
  return doc;
}

export function createStarterDocument(): EdaDocument {
  const connector = createComponent('connector2', 1);
  connector.schematic = { x: 28, y: 65, rotation: 0 };
  connector.pcb = { x: 12, y: 27, rotation: 0, side: 'top' };
  connector.value = 'Power input — verify connector';
  const resistor = createComponent('resistor', 1);
  resistor.schematic = { x: 92, y: 62.5, rotation: 0 };
  resistor.pcb = { x: 35, y: 24, rotation: 0, side: 'top' };
  const led = createComponent('led', 1);
  led.schematic = { x: 154, y: 62.5, rotation: 0 };
  led.pcb = { x: 57, y: 27, rotation: 0, side: 'top' };
  return {
    schemaVersion: 1, id: 'starter-led-circuit', name: 'LED 电路示例（工程参数未验证）', revision: 0,
    components: [connector, resistor, led],
    nets: [
      { id: 'net-vcc', name: 'VCC', nodes: [{ componentId: connector.id, pinId: '1' }, { componentId: resistor.id, pinId: '1' }] },
      { id: 'net-led-a', name: 'LED_A', nodes: [{ componentId: resistor.id, pinId: '2' }, { componentId: led.id, pinId: 'A' }] },
      { id: 'net-gnd', name: 'GND', nodes: [{ componentId: led.id, pinId: 'K' }, { componentId: connector.id, pinId: '2' }] },
    ],
    tracks: [], board: { width: 80, height: 55 }, appliedBatchIds: [],
  };
}

/** New user documents start empty; fixtures are never silently loaded as a design. */
export function createEmptyDocument(): EdaDocument {
  return { schemaVersion: 1, id: `circuit-${crypto.randomUUID()}`, name: '未命名电路', revision: 0, components: [], nets: [], tracks: [], board: { width: 80, height: 55 }, appliedBatchIds: [] };
}
