import { importNativePcb, importNativeSchematic } from './kicad-import';
import { validateModulePackage, verifyModuleNetlist, type ModuleManifest } from './module-package';
import type { ModuleDefinition } from './modules';

export type CompiledModule = { manifest: ModuleManifest; packageSha256: string; definition: ModuleDefinition };
export type ModuleVersionRecord = CompiledModule & {
  status: 'pending' | 'published' | 'rejected' | 'disabled';
  submittedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReference: string | null;
};

/** Convert a fully checked native single-sheet project to the editor's bounded format. */
export function compileNativeModule(input: unknown, payloads: Record<string, Uint8Array>, nativeNetlist: string): CompiledModule {
  const { manifest, packageSha256 } = validateModulePackage(input, payloads);
  verifyModuleNetlist(manifest, nativeNetlist);
  const pcbEntry = manifest.files.find(file => file.role === 'pcb_design_block' && file.path.endsWith('.kicad_pcb'));
  if (!pcbEntry) throw new Error('A native PCB design block is required');
  const schematic = importNativeSchematic(new TextDecoder('utf-8', { fatal: true }).decode(payloads[manifest.entrySchematic]), nativeNetlist);
  const board = importNativePcb(new TextDecoder('utf-8', { fatal: true }).decode(payloads[pcbEntry.path]), schematic);
  if (board.components.length === 0) throw new Error('A native module must contain at least one supported component');
  const anchor = board.components[0];
  const localId = new Map(board.components.map(component => [component.id, component.ref.toLowerCase()]));
  const portLabels = new Set(manifest.ports.map(port => port.label));
  const internalNets = board.nets.filter(net => !portLabels.has(net.name));
  if (internalNets.some(net => net.nodes.some(node => !localId.has(node.componentId)))) throw new Error('Internal module net references an unknown component');
  const netIds = new Map(internalNets.map((net, index) => [net.id, `net-${index + 1}`]));
  if (board.tracks.some(track => !netIds.has(track.netId))) throw new Error('PCB module track crosses an external port network; it must be routed after composition');
  const definition: ModuleDefinition = {
    moduleId: manifest.moduleId,
    version: manifest.version,
    verification: manifest.verification,
    description: manifest.description,
    sourceSha256: packageSha256,
    ports: manifest.ports,
    parts: board.components.map(component => ({
      localId: localId.get(component.id)!, sourceRef: component.ref, kind: component.kind, value: component.value,
      schematic: { x: component.schematic.x - anchor.schematic.x, y: component.schematic.y - anchor.schematic.y, rotation: component.schematic.rotation },
      pcb: { x: component.pcb.x - anchor.pcb.x, y: component.pcb.y - anchor.pcb.y, rotation: component.pcb.rotation, side: component.pcb.side },
    })),
    nets: internalNets.map(net => ({
      localId: netIds.get(net.id)!, name: net.name,
      nodes: net.nodes.map(node => ({ localId: localId.get(node.componentId)!, pinId: node.pinId })),
    })),
    tracks: board.tracks.map((track, index) => ({
      localId: `track-${index + 1}`, netLocalId: netIds.get(track.netId)!, layer: track.layer, width: track.width,
      points: track.points.map(point => ({ x: point.x - anchor.pcb.x, y: point.y - anchor.pcb.y })),
    })),
  };
  return { manifest, packageSha256, definition };
}

/** Manifest review metadata is an assertion; a distinct authenticated reviewer must attest independently. */
export function publishModuleVersion(record: ModuleVersionRecord, review: { reviewerId: string; reviewReference: string }, hardwareReviewerIds: ReadonlySet<string>): ModuleVersionRecord {
  if (record.status !== 'pending') throw new Error('Only pending module versions can be published');
  if (record.manifest.verification === 'software-fixture' || record.definition.verification === 'software-fixture' || record.manifest.moduleId.startsWith('sample.')) throw new Error('Software fixtures cannot be published; a reviewed native module is required');
  if (record.manifest.verification !== record.definition.verification) throw new Error('Module review state does not match immutable source');
  if (!hardwareReviewerIds.has(review.reviewerId)) throw new Error('Reviewer is not an authorized hardware engineer');
  if (record.submittedBy === review.reviewerId) throw new Error('A separate reviewer must approve the module');
  if (!review.reviewReference.trim() || review.reviewReference.trim().length > 200) throw new Error('A hardware review reference is required');
  if (record.manifest.review && record.manifest.review.source !== review.reviewReference.trim()) throw new Error('Review reference must match the immutable package manifest');
  if (record.definition.sourceSha256 !== record.packageSha256) throw new Error('Native module source hash mismatch');
  return { ...record, status: 'published', reviewedBy: review.reviewerId, reviewedAt: new Date().toISOString(), reviewReference: review.reviewReference.trim() };
}

export function publicModuleDefinitions(records: readonly ModuleVersionRecord[]): ModuleDefinition[] {
  return records.filter(record => record.status === 'published'
    && record.reviewedBy && record.reviewedBy !== record.submittedBy && record.reviewedAt && record.reviewReference
    && record.manifest.verification !== 'software-fixture' && record.definition.verification !== 'software-fixture'
    && !record.manifest.moduleId.startsWith('sample.')
    && record.manifest.verification === record.definition.verification
    && (!record.manifest.review || record.manifest.review.source === record.reviewReference)
    && record.definition.sourceSha256 === record.packageSha256
    && record.manifest.moduleId === record.definition.moduleId && record.manifest.version === record.definition.version)
    .map(record => ({ ...structuredClone(record.definition), verification: 'reviewed' as const }));
}
