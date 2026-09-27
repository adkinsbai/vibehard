// Generate the restricted board-catalog evidence snapshot from immutable OSS
// batch manifests. This never uploads data or changes the retrieval index.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, createReadStream, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const BATCH_ID = "6cf96eea-af45-4e7d-96c0-c99afbe8c192";
const RAW_MANIFEST_SHA = "6d3a879a57d64c373db1883be618cbb8a0574241fd73b6b2c75cf78829734207";
const PROCESSED_MANIFEST_SHA = "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1";
const INDEX_SHA = "cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9";

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(path)) hash.update(block);
  return hash.digest("hex");
}

function rawManifestDigest(state) {
  const manifest = structuredClone(state);
  delete manifest.manifestUploaded;
  delete manifest.manifestKey;
  delete manifest.manifestSha256;
  for (const object of manifest.objects) delete object.uploaded;
  return digest(JSON.stringify(manifest));
}

export function buildCatalogEvidence(catalog, rawState, processed) {
  assert.equal(rawState.schema, "vibehard-oss-raw-batch/v1");
  assert.equal(processed.schema, "vibehard-oss-processed-batch/v1");
  assert.equal(rawState.batchId, BATCH_ID);
  assert.equal(processed.rawBatchId, BATCH_ID);
  // Accept either the local upload state or the immutable manifest fetched
  // privately from OSS. The latter has no upload-state bookkeeping fields.
  if (rawState.manifestUploaded === true) assert.equal(rawState.manifestSha256, RAW_MANIFEST_SHA);
  else assert.equal(rawState.manifestUploaded, undefined);
  assert.equal(processed.rawManifestSha256, RAW_MANIFEST_SHA);
  assert.equal(rawManifestDigest(rawState), RAW_MANIFEST_SHA);
  assert.equal(processed.statistics.indexedChunks, 20582);

  const rawByPath = new Map();
  const rawKeys = new Set();
  for (const object of rawState.objects) {
    if (object.uploaded !== undefined) assert.equal(object.uploaded, true);
    assert.match(object.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(object.bytes) && object.bytes > 0);
    assert.ok(!rawKeys.has(object.key), `Repeated raw object key: ${object.key}`);
    rawKeys.add(object.key);
    for (const path of object.paths) {
      assert.ok(!rawByPath.has(path), `Repeated raw path: ${path}`);
      rawByPath.set(path, object);
    }
  }
  const documentsByRawKey = new Map();
  for (const document of processed.documents) {
    assert.ok(["auto_approved_for_index", "quarantine"].includes(document.review.status));
    for (const key of document.rawObjectKeys) {
      assert.ok(rawKeys.has(key), "Processed document has an unknown raw object key");
      const existing = documentsByRawKey.get(key) ?? [];
      existing.push(document);
      documentsByRawKey.set(key, existing);
    }
  }

  const resources = {};
  const counts = { sourceBoards: catalog.length, sourceReferences: 0, withoutPath: 0,
    rawReferences: 0, indexed: 0, partlyIndexed: 0, rawOnly: 0,
    processedQuarantined: 0, invalidRaw: 0, visibleBoards: 0, visibleReferences: 0 };
  for (const board of catalog) {
    let boardVisible = false;
    for (const resource of board.resources) {
      counts.sourceReferences++;
      if (!resource.path) { counts.withoutPath++; continue; }
      assert.ok(resource.path.split("/").includes(board.name), `Board/path mismatch: ${board.name}`);
      const object = rawByPath.get(resource.path);
      assert.ok(object, `Catalog path absent from the verified raw batch: ${resource.path}`);
      counts.rawReferences++;
      if (object.validation !== "raw_unindexed") { counts.invalidRaw++; continue; }
      const documents = documentsByRawKey.get(object.key) ?? [];
      const indexedDocuments = documents.filter(document =>
        document.review.status === "auto_approved_for_index" && document.chunks > 0).length;
      if (documents.length && !indexedDocuments) { counts.processedQuarantined++; continue; }
      const status = indexedDocuments ? object.mode === "archive" ? "partly-indexed" : "indexed" : "raw-only";
      if (status === "indexed") counts.indexed++;
      else if (status === "partly-indexed") counts.partlyIndexed++;
      else counts.rawOnly++;
      boardVisible = true;
      counts.visibleReferences++;
      const entry = { status, sha256: object.sha256, bytes: object.bytes,
        indexedDocuments, processedDocuments: documents.length };
      const previous = resources[resource.path];
      if (previous) assert.deepEqual(previous, entry);
      else resources[resource.path] = entry;
    }
    if (boardVisible) counts.visibleBoards++;
  }
  assert.equal(counts.sourceReferences, counts.withoutPath + counts.rawReferences);
  assert.equal(counts.rawReferences, counts.visibleReferences + counts.processedQuarantined + counts.invalidRaw);
  return { schema: "vibehard-board-evidence/v1", batchId: BATCH_ID,
    rawManifestSha256: RAW_MANIFEST_SHA, processedManifestSha256: PROCESSED_MANIFEST_SHA,
    indexSha256: INDEX_SHA, counts, resources };
}

async function main() {
  const [catalogPath, rawStatePath, processedPath, indexPath, outputPath] = process.argv.slice(2);
  if (!outputPath) throw new Error("Usage: node scripts/build-board-catalog-evidence.mjs <catalog.json> <raw-batch-state.json> <processed-manifest.json> <knowledge-fts.sqlite> <output.json>");
  const processedBytes = readFileSync(processedPath);
  assert.equal(digest(processedBytes), PROCESSED_MANIFEST_SHA, "Processed manifest checksum mismatch");
  const indexMeta = JSON.parse(readFileSync(`${indexPath}.meta.json`, "utf8"));
  assert.equal(indexMeta.batchId, BATCH_ID);
  assert.equal(indexMeta.manifestSha256, PROCESSED_MANIFEST_SHA);
  assert.equal(indexMeta.sqliteSha256, INDEX_SHA);
  assert.equal(indexMeta.indexedChunks, 20582);
  assert.equal(await fileDigest(indexPath), INDEX_SHA, "Index checksum mismatch");
  const processed = JSON.parse(processedBytes.toString("utf8"));
  const database = new DatabaseSync(indexPath, { readOnly: true });
  try {
    database.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF");
    const indexed = new Map(database.prepare("SELECT source_sha, count(*) AS chunks FROM chunks GROUP BY source_sha")
      .all().map(row => [row.source_sha, row.chunks]));
    const approved = processed.documents.filter(document => document.review.status === "auto_approved_for_index");
    assert.equal(indexed.size, approved.length, "Approved sources differ from the index");
    for (const document of approved) assert.equal(indexed.get(document.sourceSha256), document.chunks,
      `Indexed chunk count differs for ${document.sourceSha256}`);
  } finally { database.close(); }
  const evidence = buildCatalogEvidence(
    JSON.parse(readFileSync(catalogPath, "utf8")),
    JSON.parse(readFileSync(rawStatePath, "utf8")),
    processed);
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "w", mode: 0o644 });
  chmodSync(outputPath, 0o644); // Safe metadata only; no OSS object key or credential is exported.
  console.log(JSON.stringify({ output: outputPath, counts: evidence.counts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
