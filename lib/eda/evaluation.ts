import { parseDocument } from './document';
import { PARTS } from './library';
import type { EdaComponent, EdaDocument, PartKind, PinRef } from './types';

export type IntentRole = { kind: PartKind; ref?: string; value?: string };
export type IntentPin = { role: string; pin: string };
export type SchematicIntent = {
  roles: Record<string, IntentRole>;
  connections: IntentPin[][];
  separations?: [IntentPin, IntentPin][];
  allowExtraComponents?: boolean;
};
export type EvaluationFinding = { code: string; detail: string };
export type EvaluationResult = { passed: boolean; findings: EvaluationFinding[] };

function pinKey(pin: PinRef): string { return `${pin.componentId}\u0000${pin.pinId}`; }

function memberships(document: EdaDocument): Map<string, string> {
  const result = new Map<string, string>();
  for (const net of document.nets) for (const pin of net.nodes) result.set(pinKey(pin), net.id);
  return result;
}

function validDocument(document: EdaDocument, findings: EvaluationFinding[]): EdaDocument | undefined {
  try { return parseDocument(document); }
  catch (error) {
    findings.push({ code: 'invalid_document', detail: error instanceof Error ? error.message : 'Invalid EDA document' });
    return undefined;
  }
}

function sameValue(actual: string, expected: string, kind: PartKind): boolean {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');
  if (kind !== 'r0603' && kind !== 'resistor') return clean(actual) === clean(expected);
  const ohms = (value: string): number | undefined => {
    const match = clean(value).match(/^([0-9]+(?:\.[0-9]+)?)(k|m)?(?:r|ω|ohm|ohms)?$/i);
    if (!match) return undefined;
    return Number(match[1]) * (match[2] === 'k' ? 1000 : match[2] === 'm' ? 1_000_000 : 1);
  };
  const actualOhms = ohms(actual), expectedOhms = ohms(expected);
  return actualOhms !== undefined && expectedOhms !== undefined ? actualOhms === expectedOhms : clean(actual) === clean(expected);
}

/** Check the requested circuit graph; a passing result is not electrical safety approval. */
export function assessSchematicIntent(input: EdaDocument, intent: SchematicIntent): EvaluationResult {
  const findings: EvaluationFinding[] = [];
  const document = validDocument(input, findings);
  if (!document) return { passed: false, findings };
  const resolved = new Map<string, EdaComponent>();
  for (const [role, selector] of Object.entries(intent.roles)) {
    const matches = document.components.filter(component => component.kind === selector.kind && (!selector.ref || component.ref.toUpperCase() === selector.ref.toUpperCase()));
    if (matches.length !== 1) {
      findings.push({ code: matches.length ? 'ambiguous_component' : 'required_component_missing', detail: `${role}: expected one ${selector.ref || selector.kind}, found ${matches.length}` });
      continue;
    }
    const component = matches[0];
    resolved.set(role, component);
    if (selector.value !== undefined && !sameValue(component.value, selector.value, selector.kind)) {
      findings.push({ code: 'component_value_mismatch', detail: `${role}: expected ${selector.value}, found ${component.value}` });
    }
  }
  if (intent.allowExtraComponents === false) {
    const expectedIds = new Set(Array.from(resolved.values(), component => component.id));
    for (const component of document.components) if (!expectedIds.has(component.id)) {
      findings.push({ code: 'unexpected_component', detail: `${component.ref} (${component.kind}) is outside the requested component set` });
    }
  }
  const netByPin = memberships(document);
  const resolvePin = ({ role, pin }: IntentPin): string | undefined => {
    const component = resolved.get(role);
    if (!component) return undefined;
    if (!PARTS[component.kind].pins.some(candidate => candidate.id === pin)) {
      findings.push({ code: 'invalid_intent_pin', detail: `${role}.${pin} is not in the catalog` });
      return undefined;
    }
    return pinKey({ componentId: component.id, pinId: pin });
  };
  const seenConnectionNets = new Map<string, number>();
  for (const [groupIndex, group] of intent.connections.entries()) {
    const keys = group.map(resolvePin);
    if (keys.some(key => key === undefined)) continue;
    const net = netByPin.get(keys[0]!);
    if (!net || keys.some(key => netByPin.get(key!) !== net)) {
      findings.push({ code: 'required_connection_missing', detail: group.map(pin => `${pin.role}.${pin.pin}`).join(' ↔ ') });
    } else if (seenConnectionNets.has(net)) {
      findings.push({ code: 'distinct_connection_groups_merged', detail: `Connection groups ${seenConnectionNets.get(net)! + 1} and ${groupIndex + 1} share one net` });
    } else {
      seenConnectionNets.set(net, groupIndex);
    }
  }
  for (const [a, b] of intent.separations || []) {
    const aKey = resolvePin(a), bKey = resolvePin(b);
    if (!aKey || !bKey) continue;
    const aNet = netByPin.get(aKey);
    if (aNet && aNet === netByPin.get(bKey)) {
      findings.push({ code: 'forbidden_connection_present', detail: `${a.role}.${a.pin} ↔ ${b.role}.${b.pin}` });
    }
  }
  return { passed: findings.length === 0, findings };
}

/** Preserve all previous parts and the connectivity partition among their pins. */
export function assessRevisionPreservation(beforeInput: EdaDocument, afterInput: EdaDocument, options: { allowedValueChanges?: string[]; allowedTopologyChanges?: PinRef[] } = {}): EvaluationResult {
  const findings: EvaluationFinding[] = [];
  const before = validDocument(beforeInput, findings);
  const after = validDocument(afterInput, findings);
  if (!before || !after) return { passed: false, findings };
  const afterParts = new Map(after.components.map(component => [component.id, component]));
  const allowedValues = new Set(options.allowedValueChanges || []);
  for (const original of before.components) {
    const current = afterParts.get(original.id);
    if (!current) {
      findings.push({ code: 'existing_component_removed', detail: `${original.ref} (${original.id}) was removed` });
      continue;
    }
    if (current.kind !== original.kind || current.ref !== original.ref) {
      findings.push({ code: 'existing_component_replaced', detail: `${original.ref} (${original.id}) changed kind or reference` });
    }
    if (!allowedValues.has(original.id) && current.value !== original.value) {
      findings.push({ code: 'unrequested_value_change', detail: `${original.ref} value changed from ${original.value} to ${current.value}` });
    }
    if (JSON.stringify(current.schematic) !== JSON.stringify(original.schematic) || JSON.stringify(current.pcb) !== JSON.stringify(original.pcb)) {
      findings.push({ code: 'existing_component_moved', detail: `${original.ref} schematic or PCB placement changed` });
    }
    if (current.locked !== original.locked) {
      findings.push({ code: 'existing_component_lock_changed', detail: `${original.ref} lock status changed` });
    }
  }
  if (before.name !== after.name) findings.push({ code: 'document_name_changed', detail: 'Document title changed without an explicit request' });
  if (JSON.stringify(before.board) !== JSON.stringify(after.board)) findings.push({ code: 'board_changed', detail: 'Board dimensions changed' });
  const afterTracks = new Map(after.tracks.map(track => [track.id, track]));
  for (const original of before.tracks) {
    const current = afterTracks.get(original.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(original)) {
      findings.push({ code: 'existing_track_changed', detail: `Track ${original.id} was removed or changed` });
    }
  }
  const beforeNets = memberships(before), afterNets = memberships(after);
  const currentNets = new Map(after.nets.map(net => [net.id, net]));
  for (const oldNet of before.nets) {
    const oldPin = oldNet.nodes[0];
    const currentNet = oldPin && currentNets.get(afterNets.get(pinKey(oldPin)) || '');
    if (currentNet && currentNet.name !== oldNet.name) {
      findings.push({ code: 'existing_net_renamed', detail: `Net ${oldNet.name} was renamed to ${currentNet.name}` });
    }
  }
  const beforeToAfter = new Map<string, string>(), afterToBefore = new Map<string, string>();
  const allowedPins = new Set((options.allowedTopologyChanges || []).map(pinKey));
  let topologyChanged = false;
  for (const component of before.components) {
    if (!afterParts.has(component.id)) continue;
    for (const pin of PARTS[component.kind].pins) {
      const key = pinKey({ componentId: component.id, pinId: pin.id });
      if (allowedPins.has(key)) continue;
      const oldGroup = beforeNets.get(key) || `unconnected:${key}`;
      const newGroup = afterNets.get(key) || `unconnected:${key}`;
      if (beforeNets.has(key) !== afterNets.has(key)) topologyChanged = true;
      if ((beforeToAfter.has(oldGroup) && beforeToAfter.get(oldGroup) !== newGroup) || (afterToBefore.has(newGroup) && afterToBefore.get(newGroup) !== oldGroup)) {
        topologyChanged = true;
      }
      beforeToAfter.set(oldGroup, newGroup);
      afterToBefore.set(newGroup, oldGroup);
    }
  }
  if (topologyChanged) findings.push({ code: 'existing_topology_changed', detail: 'A previous pin connection was split or previously separate pins were joined' });
  return { passed: findings.length === 0, findings };
}
