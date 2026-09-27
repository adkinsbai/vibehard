#!/usr/bin/env node
// Deterministically link verified board resources to deduplicated FTS sources.
// Reads a local processed manifest; never uploads or modifies the SQLite index.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node scripts/build-oss-rag-board-associations.mjs <processed-manifest.json>");
const root = resolve(import.meta.dirname, "..");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const catalog = readJson(resolve(root, "lib/server/data/board-catalog.json"));
const evidence = readJson(resolve(root, "lib/server/data/board-catalog-evidence.json"));
const specifications = readJson(resolve(root, "lib/server/data/board-spec-evidence.json"));
if (manifest.schema !== "vibehard-oss-processed-batch/v1" ||
    evidence.processedManifestSha256 !== "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1" ||
    createHash("sha256").update(manifestBytes).digest("hex") !== evidence.processedManifestSha256 ||
    !/^[a-f0-9]{64}$/.test(evidence.indexSha256) ||
    manifest.rawBatchId !== evidence.batchId ||
    specifications.boards.length !== evidence.counts.visibleBoards) {
  throw new Error("Processed batch or board evidence does not match the approved index");
}
const specs = new Map(specifications.boards.map(board => [board.name, board]));
const approved = manifest.documents.filter(doc => doc.review.status === "auto_approved_for_index" && doc.chunks > 0);
if (approved.some(doc => !/^[a-f0-9]{64}$/.test(doc.sourceSha256) || !Array.isArray(doc.aliases) ||
    doc.aliases.some(alias => !alias || alias.startsWith("/") || alias.split("/").includes("..")))) {
  throw new Error("Invalid indexed document evidence");
}
const bySha = new Map(approved.map(doc => [doc.sourceSha256, doc]));
const archiveAliases = new Map();
for (const doc of approved) {
  for (const alias of doc.aliases) {
    const bang = alias.indexOf("!");
    if (bang < 0) continue;
    const archive = alias.slice(0, bang);
    if (!archiveAliases.has(archive)) archiveAliases.set(archive, []);
    archiveAliases.get(archive).push({ sourceSha256: doc.sourceSha256, citationPath: alias, category: doc.category });
  }
}
const boards = {};
for (const board of catalog) {
  const spec = specs.get(board.name);
  if (!spec) continue;
  const associations = new Map();
  for (const resource of board.resources) {
    const path = resource.path;
    const proof = evidence.resources[path];
    if (!path || !proof || proof.status === "raw-only" || spec.excludedResources.includes(path)) continue;
    const direct = bySha.get(proof.sha256);
    const candidates = [
      ...(direct ? [{ sourceSha256: direct.sourceSha256, citationPath: path, category: direct.category }] : []),
      ...(archiveAliases.get(path) ?? []),
    ];
    for (const candidate of candidates) {
      if (!candidate.citationPath.startsWith(`${path}!`) && candidate.citationPath !== path) throw new Error("Invalid alias");
      const previous = associations.get(candidate.sourceSha256);
      if (!previous || candidate.citationPath.length < previous.citationPath.length ||
          (candidate.citationPath.length === previous.citationPath.length && candidate.citationPath < previous.citationPath)) {
        associations.set(candidate.sourceSha256, candidate);
      }
    }
  }
  boards[board.name] = [...associations.values()].sort((a, b) =>
    a.citationPath < b.citationPath ? -1 : a.citationPath > b.citationPath ? 1 : 0);
}
if (Object.keys(boards).length !== specifications.boards.length || Object.values(boards).some(entries => !entries.length)) {
  throw new Error("Some verified boards have no index associations");
}
const output = {
  schema: "vibehard-rag-board-associations/v1",
  indexSha256: evidence.indexSha256,
  manifestSha256: evidence.processedManifestSha256,
  boards,
};
const outputPath = resolve(root, "lib/server/data/oss-rag-board-associations.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ boards: Object.keys(boards).length,
  associations: Object.values(boards).reduce((sum, entries) => sum + entries.length, 0),
  uniqueIndexedFiles: new Set(Object.values(boards).flat().map(entry => entry.sourceSha256)).size,
  outputPath }, null, 2));
