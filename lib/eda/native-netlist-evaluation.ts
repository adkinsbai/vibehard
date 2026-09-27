import { parseDocument } from './document';
import { PARTS } from './library';
import { parseSExpression, type SExpression } from './sexpr';
import type { EdaDocument } from './types';
import type { EvaluationFinding, EvaluationResult, SchematicIntent, IntentPin } from './evaluation';

type Form = SExpression[];
function isForm(expression: SExpression, name: string): expression is Form { return Array.isArray(expression) && expression[0] === name; }
function children(expression: Form, name: string): Form[] { return expression.slice(1).filter((child): child is Form => isForm(child, name)); }
function field(expression: Form, name: string): string {
  const matches = children(expression, name);
  if (matches.length !== 1 || matches[0].length !== 2 || typeof matches[0][1] !== 'string') throw new Error(`Expected one ${name} field`);
  return matches[0][1];
}
function section(expression: Form, name: string): Form {
  const matches = children(expression, name);
  if (matches.length !== 1) throw new Error(`Expected one ${name} section`);
  return matches[0];
}

type NativeComponent = { value: string; footprint?: string; libraryId?: string };
type NativeGraph = { components: Map<string, NativeComponent>; netByPin: Map<string, string>; membersByNet: Map<string, string[]> };
function parseNativeGraph(source: string): NativeGraph {
  const root = parseSExpression(source);
  if (!isForm(root, 'export')) throw new Error('Expected KiCad export root');
  const components = new Map<string, NativeComponent>();
  for (const component of children(section(root, 'components'), 'comp')) {
    const ref = field(component, 'ref'), value = field(component, 'value');
    if (components.has(ref)) throw new Error(`Duplicate native reference ${ref}`);
    const footprint = children(component, 'footprint').length ? field(component, 'footprint') : undefined;
    const libsource = children(component, 'libsource')[0];
    const libraryId = libsource ? `${field(libsource, 'lib')}:${field(libsource, 'part')}` : undefined;
    components.set(ref, { value, footprint, libraryId });
  }
  const netByPin = new Map<string, string>(), membersByNet = new Map<string, string[]>();
  for (const [index, net] of children(section(root, 'nets'), 'net').entries()) {
    const name = field(net, 'name');
    const members: string[] = [];
    for (const node of children(net, 'node')) {
      const ref = field(node, 'ref'), pin = field(node, 'pin');
      if (!components.has(ref)) throw new Error(`Native node references missing component ${ref}`);
      const key = `${ref}.${pin}`;
      if (netByPin.has(key)) throw new Error(`Native pin ${key} is assigned to multiple nets`);
      netByPin.set(key, String(index));
      members.push(key);
    }
    if (name.startsWith('unconnected-') && members.length > 1) throw new Error(`Unconnected net ${name} has multiple pins`);
    membersByNet.set(String(index), members);
  }
  return { components, netByPin, membersByNet };
}

/** Compare the actual KiCad-exported netlist to the approved draft and requested pin-level topology. */
export function assessNativeNetlist(source: string, input: EdaDocument, intent: SchematicIntent): EvaluationResult {
  const findings: EvaluationFinding[] = [];
  let graph: NativeGraph;
  let document: EdaDocument;
  try { graph = parseNativeGraph(source); document = parseDocument(input); }
  catch (error) { return { passed: false, findings: [{ code: 'invalid_native_netlist', detail: error instanceof Error ? error.message : 'Invalid native netlist' }] }; }
  const documentByRef = new Map(document.components.map(component => [component.ref, component]));
  for (const component of document.components) {
    const native = graph.components.get(component.ref);
    if (!native) findings.push({ code: 'native_component_missing', detail: `${component.ref} is absent from KiCad netlist` });
    else {
      if (native.value !== component.value) findings.push({ code: 'native_component_value_mismatch', detail: `${component.ref}: expected ${component.value}, native ${native.value}` });
      const part = PARTS[component.kind];
      if (part.native && (native.libraryId !== part.native.libraryId || native.footprint !== part.footprint.name)) {
        findings.push({ code: 'native_component_identity_mismatch', detail: `${component.ref}: expected ${part.native.libraryId} / ${part.footprint.name}, native ${native.libraryId || '(missing)'} / ${native.footprint || '(missing)'}` });
      }
    }
  }
  for (const ref of graph.components.keys()) if (!documentByRef.has(ref)) findings.push({ code: 'native_component_extra', detail: `${ref} is not in the approved document` });
  const modeledNetByPin = new Map<string, string>();
  for (const net of document.nets) {
    const nativeIds = new Set<string>();
    for (const pin of net.nodes) {
      const component = document.components.find(candidate => candidate.id === pin.componentId);
      if (!component) continue;
      const key = `${component.ref}.${pin.pinId}`;
      modeledNetByPin.set(key, net.id);
      const nativeId = graph.netByPin.get(key);
      if (nativeId !== undefined) nativeIds.add(nativeId);
    }
    if (nativeIds.size !== 1 || net.nodes.some(pin => {
      const component = document.components.find(candidate => candidate.id === pin.componentId);
      return component && !graph.netByPin.has(`${component.ref}.${pin.pinId}`);
    })) findings.push({ code: 'native_topology_mismatch', detail: `Modeled net ${net.name} is split or missing in native netlist` });
  }
  const modelNetByNative = new Map<string, string>();
  for (const [key, nativeId] of graph.netByPin) {
    const modelId = modeledNetByPin.get(key);
    if (modelId !== undefined) {
      if (modelNetByNative.has(nativeId) && modelNetByNative.get(nativeId) !== modelId) findings.push({ code: 'native_topology_mismatch', detail: `Native net joins distinct modeled nets at ${key}` });
      modelNetByNative.set(nativeId, modelId);
    } else if (documentByRef.has(key.slice(0, key.lastIndexOf('.'))) && (graph.membersByNet.get(nativeId)?.length || 0) > 1) {
      findings.push({ code: 'native_topology_mismatch', detail: `Unmodeled pin ${key} is connected in native netlist` });
    }
  }
  const roleRef = new Map<string, string>();
  for (const [role, selector] of Object.entries(intent.roles)) {
    const matches = document.components.filter(component => component.kind === selector.kind && (!selector.ref || component.ref.toUpperCase() === selector.ref.toUpperCase()));
    if (matches.length !== 1) { findings.push({ code: 'native_role_unresolved', detail: `${role} resolves to ${matches.length} components` }); continue; }
    roleRef.set(role, matches[0].ref);
  }
  const keyFor = ({ role, pin }: IntentPin): string | undefined => {
    const ref = roleRef.get(role);
    if (!ref) return undefined;
    const component = documentByRef.get(ref);
    if (!component || !PARTS[component.kind].pins.some(candidate => candidate.id === pin)) {
      findings.push({ code: 'invalid_native_intent_pin', detail: `${role}.${pin} is not in the catalog` });
      return undefined;
    }
    return `${ref}.${pin}`;
  };
  for (const group of intent.connections) {
    const keys = group.map(keyFor);
    if (keys.some(key => key === undefined)) continue;
    const net = graph.netByPin.get(keys[0]!);
    if (!net || keys.some(key => graph.netByPin.get(key!) !== net)) findings.push({ code: 'native_required_connection_missing', detail: keys.join(' ↔ ') });
  }
  for (const [a, b] of intent.separations || []) {
    const aKey = keyFor(a), bKey = keyFor(b);
    if (!aKey || !bKey) continue;
    const aNet = graph.netByPin.get(aKey);
    if (aNet && aNet === graph.netByPin.get(bKey)) findings.push({ code: 'native_forbidden_connection_present', detail: `${aKey} ↔ ${bKey}` });
  }
  return { passed: findings.length === 0, findings };
}
