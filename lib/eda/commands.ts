import { z } from 'zod';
import { PARTS, equivalentPinIds } from './library';
import { componentSchema, coordinateSchema, dimensionSchema, idSchema, parseDocument, pinRefSchema, rotationSchema, textSchema, trackSchema } from './document';
import type { EditBatch, EdaComponent, EdaDocument, EdaNet, PinRef } from './types';

const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('addComponent'), component: componentSchema }),
  z.strictObject({ type: z.literal('removeComponent'), id: idSchema }),
  z.strictObject({ type: z.literal('moveComponent'), id: idSchema, view: z.enum(['schematic', 'pcb']), x: coordinateSchema, y: coordinateSchema, rotation: rotationSchema.optional() }),
  z.strictObject({ type: z.literal('setComponent'), id: idSchema, changes: z.strictObject({ ref: componentSchema.shape.ref.optional(), value: componentSchema.shape.value.optional(), locked: z.boolean().optional() }).refine((changes) => Object.keys(changes).length > 0, 'Changes cannot be empty') }),
  z.strictObject({ type: z.literal('connectPins'), a: pinRefSchema, b: pinRefSchema, netName: textSchema.optional() }),
  z.strictObject({ type: z.literal('disconnectPin'), pin: pinRefSchema }),
  z.strictObject({ type: z.literal('renameNet'), id: idSchema, name: textSchema }),
  z.strictObject({ type: z.literal('addTrack'), track: trackSchema }),
  z.strictObject({ type: z.literal('removeTrack'), id: idSchema }),
  z.strictObject({ type: z.literal('setBoard'), width: dimensionSchema, height: dimensionSchema }),
  z.strictObject({ type: z.literal('renameDocument'), name: textSchema }),
]);
const batchSchema = z.strictObject({
  id: idSchema, baseRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  label: textSchema, actor: z.enum(['user', 'agent']), commands: z.array(commandSchema).min(1).max(100),
});

export function parseEditBatch(input: unknown): EditBatch {
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { throw new Error('Edit batch is not serializable'); }
  if (!serialized || serialized.length > 250_000) throw new Error('Edit batch exceeds 250 KB limit');
  const result = batchSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid edit batch: ${result.error.issues[0]?.path.join('.') || 'root'} ${result.error.issues[0]?.message || ''}`);
  return result.data;
}

function requiredComponent(doc: EdaDocument, id: string): EdaComponent {
  const component = doc.components.find((item) => item.id === id);
  if (!component) throw new Error(`Unknown component ${id}`);
  return component;
}

function requiredPin(doc: EdaDocument, pin: PinRef): void {
  const component = requiredComponent(doc, pin.componentId);
  if (!PARTS[component.kind].pins.some((item) => item.id === pin.pinId)) throw new Error(`Unknown pin ${component.ref}.${pin.pinId}`);
}

function owningNet(doc: EdaDocument, pin: PinRef): EdaNet | undefined {
  return doc.nets.find((net) => net.nodes.some((node) => node.componentId === pin.componentId && node.pinId === pin.pinId));
}

function invalidateTracks(doc: EdaDocument, netIds: Iterable<string>) {
  const invalid = new Set(netIds);
  doc.tracks = doc.tracks.filter((track) => !invalid.has(track.netId));
}

function nextNetId(doc: EdaDocument): string {
  let index = doc.nets.length + 1;
  while (doc.nets.some((net) => net.id === `net-${index}`)) index++;
  return `net-${index}`;
}

export function applyEditBatch(doc: EdaDocument, batch: EditBatch): EdaDocument {
  const edit = parseEditBatch(batch);
  if (doc.appliedBatchIds?.includes(edit.id)) return doc;
  if (edit.baseRevision !== doc.revision) throw new Error(`Revision conflict: expected ${doc.revision}, received ${edit.baseRevision}`);
  const next = parseDocument(doc);
  for (const command of edit.commands) {
    switch (command.type) {
      case 'addComponent':
        next.components.push(command.component);
        break;
      case 'removeComponent': {
        const component = requiredComponent(next, command.id);
        if (component.locked) throw new Error(`Component ${component.ref} is locked`);
        const affected = next.nets.filter((net) => net.nodes.some((node) => node.componentId === command.id));
        invalidateTracks(next, affected.map((net) => net.id));
        for (const net of affected) net.nodes = net.nodes.filter((node) => node.componentId !== command.id);
        next.nets = next.nets.filter((net) => net.nodes.length > 0);
        next.components = next.components.filter((item) => item.id !== command.id);
        break;
      }
      case 'moveComponent': {
        const component = requiredComponent(next, command.id);
        if (component.locked) throw new Error(`Component ${component.ref} is locked`);
        const placement = component[command.view];
        placement.x = command.x;
        placement.y = command.y;
        if (command.rotation !== undefined) placement.rotation = command.rotation;
        if (command.view === 'pcb') invalidateTracks(next, next.nets.filter((net) => net.nodes.some((node) => node.componentId === command.id)).map((net) => net.id));
        break;
      }
      case 'setComponent':
        Object.assign(requiredComponent(next, command.id), command.changes);
        break;
      case 'connectPins': {
        requiredPin(next, command.a);
        requiredPin(next, command.b);
        if (command.a.componentId === command.b.componentId && command.a.pinId === command.b.pinId) throw new Error('Cannot connect a pin to itself');
        const aNet = owningNet(next, command.a);
        const bNet = owningNet(next, command.b);
        if (aNet && bNet && aNet.id === bNet.id) {
          if (command.netName) aNet.name = command.netName;
          break;
        }
        invalidateTracks(next, [aNet?.id, bNet?.id].filter((id): id is string => Boolean(id)));
        if (aNet && bNet) {
          aNet.nodes.push(...bNet.nodes);
          if (command.netName) aNet.name = command.netName;
          next.nets = next.nets.filter((net) => net.id !== bNet.id);
        } else if (aNet || bNet) {
          const net = aNet || bNet!;
          net.nodes.push(aNet ? command.b : command.a);
          if (command.netName) net.name = command.netName;
        } else {
          const id = nextNetId(next);
          next.nets.push({ id, name: command.netName || id.toUpperCase(), nodes: [command.a, command.b] });
        }
        break;
      }
      case 'disconnectPin': {
        requiredPin(next, command.pin);
        const net = owningNet(next, command.pin);
        if (!net) throw new Error(`Pin ${command.pin.componentId}.${command.pin.pinId} is not connected`);
        invalidateTracks(next, [net.id]);
        const equivalent = equivalentPinIds(requiredComponent(next, command.pin.componentId), command.pin.pinId);
        net.nodes = net.nodes.filter((node) => node.componentId !== command.pin.componentId || !equivalent.includes(node.pinId));
        if (net.nodes.length === 0) next.nets = next.nets.filter((item) => item.id !== net.id);
        break;
      }
      case 'renameNet': {
        const net = next.nets.find((item) => item.id === command.id);
        if (!net) throw new Error(`Unknown net ${command.id}`);
        net.name = command.name;
        break;
      }
      case 'addTrack':
        next.tracks.push(command.track);
        break;
      case 'removeTrack':
        if (!next.tracks.some((track) => track.id === command.id)) throw new Error(`Unknown track ${command.id}`);
        next.tracks = next.tracks.filter((track) => track.id !== command.id);
        break;
      case 'setBoard':
        next.board = { width: command.width, height: command.height };
        break;
      case 'renameDocument':
        next.name = command.name;
        break;
    }
  }
  next.revision++;
  next.appliedBatchIds.push(edit.id);
  if (next.appliedBatchIds.length > 5000) next.appliedBatchIds = next.appliedBatchIds.slice(-5000);
  return parseDocument(next);
}
