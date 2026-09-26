import { parseDocument } from './document';
import { PARTS, pinPosition } from './library';
import type { EdaDocument, EdaIssue } from './types';

/** Fast internal graph and placement checks. These are not KiCad ERC or DRC. */
export function checkDocument(doc: EdaDocument): EdaIssue[] {
  let valid: EdaDocument;
  try { valid = parseDocument(doc); } catch (error) {
    return [{ id: 'invalid-document', severity: 'error', message: `Invalid document: ${error instanceof Error ? error.message : String(error)}. Internal check only; KiCad ERC/DRC was not run.` }];
  }
  const issues: EdaIssue[] = [];
  const connected = new Set(valid.nets.flatMap((net) => net.nodes.map((node) => `${node.componentId}\u0000${node.pinId}`)));
  for (const component of valid.components) {
    for (const pin of PARTS[component.kind].pins) {
      if (pin.electrical !== 'no_connect' && !connected.has(`${component.id}\u0000${pin.id}`)) issues.push({ id: `unconnected-${component.id}-${pin.id}`, severity: 'warning', message: `${component.ref}.${pin.id} 尚未连接`, componentId: component.id });
      const pos = pinPosition(component, pin.id, 'pcb');
      if (pos.x < 0 || pos.x > valid.board.width || pos.y < 0 || pos.y > valid.board.height) issues.push({ id: `pad-outside-${component.id}-${pin.id}`, severity: 'warning', message: `${component.ref}.${pin.id} lies outside the board outline (internal placement check, not DRC).`, componentId: component.id });
    }
  }
  for (const net of valid.nets) {
    if (net.nodes.length === 1) issues.push({ id: `single-node-${net.id}`, severity: 'warning', message: `${net.name} has only one pin (internal graph check, not ERC).`, netId: net.id });
  }
  for (const track of valid.tracks) {
    if (track.points.some((point) => point.x < 0 || point.x > valid.board.width || point.y < 0 || point.y > valid.board.height)) issues.push({ id: `track-outside-${track.id}`, severity: 'warning', message: `${track.id} extends outside the board outline (internal placement check, not DRC).`, trackId: track.id });
  }
  return issues;
}
