import manifest from './modules/sample-led/manifest.json';
import { createComponent, PARTS } from './library';
import type { EdaDocument, PartKind, PinRef, Position } from './types';

type ModulePart = { localId: string; sourceRef: string; kind: PartKind; value: string; schematic: Position; pcb: Position & { side: 'top' | 'bottom' } };
type ModuleNet = { localId: string; name: string; nodes: { localId: string; pinId: string }[] };
type ModuleTrack = { localId: string; netLocalId: string; layer: 'top' | 'bottom'; width: number; points: { x: number; y: number }[] };
type ModulePort = { id: string; name: string; label: string; direction: string; signal: string; required: boolean; terminal: { reference: string; pin: string }; voltage?: { min: number; max: number } };
export type ModuleDefinition = { moduleId: string; version: string; verification: 'software-fixture' | 'pending-review' | 'reviewed'; description: string; sourceSha256: string; parts: ModulePart[]; nets: ModuleNet[]; tracks: ModuleTrack[]; ports: ModulePort[] };
export type ModuleCatalog = Readonly<Record<string, ModuleDefinition>>;

/** Bundled software fixture. It is not a reviewed circuit or a purchasable module. */
export const MODULES: Record<string, ModuleDefinition> = {
  [manifest.moduleId]: {
    moduleId: manifest.moduleId,
    version: manifest.version,
    verification: 'software-fixture',
    description: manifest.description,
    sourceSha256: manifest.files[0].sha256,
    ports: manifest.ports,
    parts: [
      { localId: 'r', sourceRef: 'R1', kind: 'r0603', value: '470R', schematic: { x: 0, y: 0, rotation: 270 }, pcb: { x: 0, y: 0, rotation: 0, side: 'top' } },
      { localId: 'd', sourceRef: 'D1', kind: 'led0603', value: 'LED', schematic: { x: 25.4, y: 0, rotation: 180 }, pcb: { x: 10, y: 0, rotation: 180, side: 'top' } },
    ],
    nets: [{ localId: 'inner', name: 'LED_A', nodes: [{ localId: 'r', pinId: '2' }, { localId: 'd', pinId: '2' }] }],
    tracks: [{ localId: 'inner-route', netLocalId: 'inner', layer: 'top', width: 0.25, points: [{ x: 0.825, y: 0 }, { x: 9.2125, y: 0 }] }],
  },
};

export function catalogFromDefinitions(definitions: readonly ModuleDefinition[]): ModuleCatalog {
  const catalog: Record<string, ModuleDefinition> = Object.create(null);
  for (const definition of definitions) {
    if (definition.verification !== 'reviewed' || !/^[a-f0-9]{64}$/.test(definition.sourceSha256)) throw new Error('Only source-pinned reviewed modules can enter a published catalog');
    const key = `${definition.moduleId}@${definition.version}`;
    if (catalog[key]) throw new Error(`Duplicate module version ${key}`);
    catalog[key] = structuredClone(definition);
  }
  return catalog;
}

export function findModule(catalog: ModuleCatalog, moduleId: string, version: string): ModuleDefinition | undefined {
  const definition = catalog[`${moduleId}@${version}`] ?? catalog[moduleId];
  return definition?.moduleId === moduleId && definition.version === version ? definition : undefined;
}

export function modulePortPin(document: EdaDocument, instanceId: string, portId: string, catalog: ModuleCatalog = MODULES): PinRef {
  const instance = document.moduleInstances?.find(item => item.id === instanceId);
  if (!instance) throw new Error(`Unknown module instance ${instanceId}`);
  const definition = findModule(catalog, instance.moduleId, instance.version);
  if (!definition || definition.sourceSha256 !== instance.sourceSha256) throw new Error(`Unavailable module version ${instance.moduleId}`);
  const port = definition.ports.find(item => item.id === portId);
  if (!port) throw new Error(`Unknown module port ${portId}`);
  const part = definition.parts.find(item => item.sourceRef === port.terminal.reference);
  if (!part) throw new Error(`Module port ${portId} has no terminal`);
  const componentId = `${instanceId}-${part.localId}`;
  if (!instance.componentIds.includes(componentId) || !document.components.some(item => item.id === componentId)) throw new Error(`Missing module terminal ${componentId}`);
  return { componentId, pinId: port.terminal.pin };
}

export function isModulePort(document: EdaDocument, pin: PinRef, catalog: ModuleCatalog = MODULES): boolean {
  const instance = document.moduleInstances?.find(item => item.componentIds.includes(pin.componentId));
  if (!instance) return true;
  const definition = findModule(catalog, instance.moduleId, instance.version);
  return Boolean(definition?.ports.some(port => {
    const part = definition.parts.find(item => item.sourceRef === port.terminal.reference);
    return part && `${instance.id}-${part.localId}` === pin.componentId && port.terminal.pin === pin.pinId;
  }));
}

function nextRef(document: EdaDocument, prefix: string): string {
  const used = new Set(document.components.map(item => item.ref.toUpperCase()));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function insertModule(document: EdaDocument, command: { moduleId: string; version: string; instanceId: string; schematic: { x: number; y: number }; pcb: { x: number; y: number } }, catalog: ModuleCatalog = MODULES): void {
  const definition = findModule(catalog, command.moduleId, command.version);
  if (!definition) throw new Error(`Unknown module version ${command.moduleId}@${command.version}`);
  if (document.moduleInstances?.some(item => item.id === command.instanceId)) throw new Error(`Duplicate module instance ${command.instanceId}`);
  const componentIds = definition.parts.map(item => `${command.instanceId}-${item.localId}`);
  const internalNetIds = definition.nets.map(item => `${command.instanceId}-${item.localId}`);
  const internalTrackIds = definition.tracks.map(item => `${command.instanceId}-${item.localId}`);
  if (componentIds.some(id => document.components.some(item => item.id === id)) || internalNetIds.some(id => document.nets.some(item => item.id === id)) || internalTrackIds.some(id => document.tracks.some(item => item.id === id))) throw new Error(`Duplicate module instance ${command.instanceId}`);
  for (const part of definition.parts) {
    const component = createComponent(part.kind);
    component.id = `${command.instanceId}-${part.localId}`;
    component.ref = nextRef(document, PARTS[part.kind].prefix);
    component.value = part.value;
    component.schematic = { x: command.schematic.x + part.schematic.x, y: command.schematic.y + part.schematic.y, rotation: part.schematic.rotation };
    component.pcb = { x: command.pcb.x + part.pcb.x, y: command.pcb.y + part.pcb.y, rotation: part.pcb.rotation, side: part.pcb.side };
    component.locked = true;
    document.components.push(component);
  }
  for (const net of definition.nets) document.nets.push({ id: `${command.instanceId}-${net.localId}`, name: `${command.instanceId}_${net.name}`, nodes: net.nodes.map(node => ({ componentId: `${command.instanceId}-${node.localId}`, pinId: node.pinId })) });
  addModuleInternalTracks(document, command.instanceId, definition, command.pcb);
  document.moduleInstances = [...(document.moduleInstances ?? []), { id: command.instanceId, moduleId: definition.moduleId, version: definition.version, sourceSha256: definition.sourceSha256, componentIds, internalNetIds, internalTrackIds }];
}

export function addModuleInternalTracks(document: EdaDocument, instanceId: string, definition: ModuleDefinition, origin: { x: number; y: number }): void {
  for (const track of definition.tracks) document.tracks.push({
    id: `${instanceId}-${track.localId}`, netId: `${instanceId}-${track.netLocalId}`, layer: track.layer, width: track.width,
    points: track.points.map(point => ({ x: origin.x + point.x, y: origin.y + point.y })),
  });
}

export function validateModuleInstances(document: EdaDocument, catalog: ModuleCatalog = MODULES): void {
  for (const instance of document.moduleInstances ?? []) {
    const definition = findModule(catalog, instance.moduleId, instance.version);
    if (!definition || definition.sourceSha256 !== instance.sourceSha256) throw new Error(`Module source hash or provenance mismatch: ${instance.id}`);
    const expectedParts = definition.parts.map(part => `${instance.id}-${part.localId}`);
    const expectedNets = definition.nets.map(net => `${instance.id}-${net.localId}`);
    const expectedTracks = definition.tracks.map(track => `${instance.id}-${track.localId}`);
    if (JSON.stringify(instance.componentIds) !== JSON.stringify(expectedParts) || JSON.stringify(instance.internalNetIds) !== JSON.stringify(expectedNets) || JSON.stringify(instance.internalTrackIds) !== JSON.stringify(expectedTracks)) throw new Error(`Module provenance mismatch: ${instance.id}`);
    for (const part of definition.parts) {
      const component = document.components.find(item => item.id === `${instance.id}-${part.localId}`);
      if (!component || component.kind !== part.kind || component.value !== part.value || !component.locked || component.schematic.rotation !== part.schematic.rotation || component.pcb.rotation !== part.pcb.rotation || component.pcb.side !== part.pcb.side) throw new Error(`Module internal component mismatch: ${instance.id}-${part.localId}`);
    }
    const first = definition.parts[0];
    const anchor = document.components.find(item => item.id === `${instance.id}-${first.localId}`)!;
    const schematicOrigin = { x: anchor.schematic.x - first.schematic.x, y: anchor.schematic.y - first.schematic.y };
    const pcbOrigin = { x: anchor.pcb.x - first.pcb.x, y: anchor.pcb.y - first.pcb.y };
    for (const part of definition.parts) {
      const component = document.components.find(item => item.id === `${instance.id}-${part.localId}`)!;
      if (Math.abs(component.schematic.x - schematicOrigin.x - part.schematic.x) > 0.00001 || Math.abs(component.schematic.y - schematicOrigin.y - part.schematic.y) > 0.00001 || Math.abs(component.pcb.x - pcbOrigin.x - part.pcb.x) > 0.00001 || Math.abs(component.pcb.y - pcbOrigin.y - part.pcb.y) > 0.00001) throw new Error(`Module layout mismatch: ${instance.id}`);
    }
    for (const net of definition.nets) {
      const actual = document.nets.find(item => item.id === `${instance.id}-${net.localId}`);
      const expectedNodes = net.nodes.map(node => `${instance.id}-${node.localId}.${node.pinId}`).sort();
      const actualNodes = actual?.nodes.map(node => `${node.componentId}.${node.pinId}`).sort();
      if (!actual || actual.name !== `${instance.id}_${net.name}` || JSON.stringify(actualNodes) !== JSON.stringify(expectedNodes)) throw new Error(`Module internal net mismatch: ${instance.id}-${net.localId}`);
    }
    for (const track of definition.tracks) {
      const actual = document.tracks.find(item => item.id === `${instance.id}-${track.localId}`);
      const expectedPoints = track.points.map(point => ({ x: pcbOrigin.x + point.x, y: pcbOrigin.y + point.y }));
      if (!actual || actual.netId !== `${instance.id}-${track.netLocalId}` || actual.layer !== track.layer || actual.width !== track.width
        || actual.points.length !== expectedPoints.length || actual.points.some((point, index) => Math.abs(point.x - expectedPoints[index].x) > 0.00001 || Math.abs(point.y - expectedPoints[index].y) > 0.00001)) {
        throw new Error(`Module internal track mismatch: ${instance.id}-${track.localId}`);
      }
    }
    const power = definition.ports.filter(port => port.signal === 'power').map(port => ({ port, pin: modulePortPin(document, instance.id, port.id, catalog) }));
    const ground = definition.ports.filter(port => port.signal === 'ground').map(port => ({ port, pin: modulePortPin(document, instance.id, port.id, catalog) }));
    for (const high of power) for (const low of ground) {
      const shared = document.nets.some(net => net.nodes.some(node => node.componentId === high.pin.componentId && node.pinId === high.pin.pinId)
        && net.nodes.some(node => node.componentId === low.pin.componentId && node.pinId === low.pin.pinId));
      if (shared) throw new Error(`Module power and ground ports are shorted: ${instance.id}`);
    }
  }
}

export function missingRequiredModulePorts(document: EdaDocument, catalog: ModuleCatalog = MODULES): { instanceId: string; portId: string }[] {
  return (document.moduleInstances ?? []).flatMap(instance => {
    const definition = findModule(catalog, instance.moduleId, instance.version);
    return (definition?.ports ?? []).filter(port => port.required && !document.nets.some(net => {
      const pin = modulePortPin(document, instance.id, port.id, catalog);
      return net.nodes.some(node => node.componentId === pin.componentId && node.pinId === pin.pinId)
        && net.nodes.some(node => !instance.componentIds.includes(node.componentId));
    })).map(port => ({ instanceId: instance.id, portId: port.id }));
  });
}
