import type { CatalogBoard, ResourceEvidence } from "@/lib/board-catalog";

type EvidenceSnapshot = {
  schema: "vibehard-board-evidence/v1";
  batchId: string;
  rawManifestSha256: string;
  processedManifestSha256: string;
  indexSha256: string;
  counts: { visibleBoards: number; visibleReferences: number; indexed: number; partlyIndexed: number; rawOnly: number };
  resources: Record<string, ResourceEvidence>;
};
type SpecEvidenceSnapshot = {
  schema: "vibehard-board-spec-evidence/v1";
  sourceDate: string;
  boards: { name: string; category: string; features: string[]; sourceUrl: string; sourceSha256: string;
    supplementalSourceUrl: string | null; note: string | null; excludedResources: string[] }[];
};

// Called only after the database role check. The source catalog remains an
// unverified lead list; this view contains only paths tied to an uploaded,
// checksum-verified OSS object and excludes invalid/quarantined material.
export function verifiedBoardCatalog(boards: CatalogBoard[], evidence: EvidenceSnapshot, specifications: SpecEvidenceSnapshot) {
  if (evidence.schema !== "vibehard-board-evidence/v1" ||
      !/^[a-f0-9]{64}$/.test(evidence.rawManifestSha256) ||
      !/^[a-f0-9]{64}$/.test(evidence.processedManifestSha256) ||
      !/^[a-f0-9]{64}$/.test(evidence.indexSha256)) {
    throw new Error("Board catalog evidence is invalid");
  }
  if (specifications.schema !== "vibehard-board-spec-evidence/v1" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(specifications.sourceDate) ||
      specifications.boards.length !== evidence.counts.visibleBoards ||
      new Set(specifications.boards.map(board => board.name)).size !== specifications.boards.length) {
    throw new Error("Board specification evidence is invalid");
  }
  const specs = new Map(specifications.boards.map(board => [board.name, board]));
  const usedPaths = new Set<string>();
  const verified = boards.flatMap(board => {
    const spec = specs.get(board.name);
    const resources = board.resources.flatMap(resource => {
      const proof = resource.path && evidence.resources[resource.path];
      if (!proof) return [];
      if (!resource.path.split("/").includes(board.name) ||
          !["indexed", "partly-indexed", "raw-only"].includes(proof.status) ||
          !/^[a-f0-9]{64}$/.test(proof.sha256) || !Number.isSafeInteger(proof.bytes) || proof.bytes < 1 ||
          !Number.isSafeInteger(proof.indexedDocuments) || proof.indexedDocuments < 0 ||
          !Number.isSafeInteger(proof.processedDocuments) || proof.processedDocuments < proof.indexedDocuments ||
          (proof.status === "raw-only" ? proof.indexedDocuments !== 0 : proof.indexedDocuments < 1)) {
        throw new Error("Board catalog evidence entry is invalid");
      }
      usedPaths.add(resource.path);
      return [{ ...resource, evidence: proof }];
    });
    // Original size strings contain unverified model suffixes and are not
    // relevant to the evidenced view; do not serialize them to the client.
    if (!resources.length) {
      if (spec) throw new Error(`Specification has no resource evidence: ${board.name}`);
      return [];
    }
    if (!spec || !/^https:\/\/docs\.waveshare\.com\/ESP32-S3-/.test(spec.sourceUrl) ||
        !/^[a-f0-9]{64}$/.test(spec.sourceSha256) ||
        (spec.supplementalSourceUrl && !/^https:\/\/www\.waveshare\.com\/esp32-s3-/.test(spec.supplementalSourceUrl)) ||
        !spec.category || !Array.isArray(spec.features) ||
        new Set(spec.features).size !== spec.features.length ||
        spec.features.some(feature => typeof feature !== "string" || !feature.trim()) ||
        !Array.isArray(spec.excludedResources) || new Set(spec.excludedResources).size !== spec.excludedResources.length ||
        spec.excludedResources.some(path => !resources.some(resource => resource.path === path))) {
      throw new Error(`Board specification is invalid: ${board.name}`);
    }
    return [{ name: board.name, category: spec.category,
      size: "", features: spec.features,
      specSourceUrl: spec.sourceUrl, supplementalSpecSourceUrl: spec.supplementalSourceUrl, specNote: spec.note,
      resources: resources.filter(resource => !spec.excludedResources.includes(resource.path)) }];
  });
  const allResources = boards.flatMap(board => board.resources).filter(resource => usedPaths.has(resource.path));
  const excluded = new Set(specifications.boards.flatMap(board => board.excludedResources));
  if (usedPaths.size !== Object.keys(evidence.resources).length ||
      verified.length !== evidence.counts.visibleBoards || allResources.length !== evidence.counts.visibleReferences ||
      allResources.filter(resource => evidence.resources[resource.path]?.status === "indexed").length !== evidence.counts.indexed ||
      allResources.filter(resource => evidence.resources[resource.path]?.status === "partly-indexed").length !== evidence.counts.partlyIndexed ||
      allResources.filter(resource => evidence.resources[resource.path]?.status === "raw-only").length !== evidence.counts.rawOnly ||
      verified.flatMap(board => board.resources).length !== allResources.length - excluded.size) {
    throw new Error("Board catalog and evidence counts do not match");
  }
  return verified;
}
