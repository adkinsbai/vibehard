/** Read-only inventory of an OSS processed snapshot. Never prints credentials or excerpts. */
import OSS from 'ali-oss';
import { createHash } from 'node:crypto';
import { buildKnowledgeIndex, readKnowledgeArtifact, searchKnowledgeIndex } from '../lib/server/eda-knowledge-index';

async function main() {
  const bucket = process.env.EDA_KNOWLEDGE_OSS_BUCKET;
  const region = process.env.EDA_KNOWLEDGE_OSS_REGION || 'oss-cn-beijing';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  if (!bucket || !accessKeyId || !accessKeySecret) throw new Error('Set OSS bucket and read-only credential environment variables');
  const client = new OSS({ bucket, region, authorizationV4: true, accessKeyId, accessKeySecret, secure: true, timeout: 20_000 });
  const requestedKey = process.env.EDA_KNOWLEDGE_OSS_MANIFEST_KEY;
  let manifestKey = requestedKey;
  if (!manifestKey) {
    const listing = await client.list({ prefix: 'knowledge/processed/', 'max-keys': 1000 }, {});
    const candidates = (listing.objects || []).map(object => object.name).filter(name => /^knowledge\/processed\/[A-Za-z0-9/._-]+\.json$/.test(name));
    if (listing.isTruncated || candidates.length !== 1) throw new Error('Set EDA_KNOWLEDGE_OSS_MANIFEST_KEY explicitly; expected exactly one processed manifest');
    manifestKey = candidates[0];
  }
  const manifest = (await client.get(manifestKey)).content;
  if (!Buffer.isBuffer(manifest)) throw new Error('Unexpected manifest body');
  const artifact = readKnowledgeArtifact(manifest);
  const compressed = (await client.get(artifact.key)).content;
  if (!Buffer.isBuffer(compressed)) throw new Error('Unexpected chunks body');
  const index = buildKnowledgeIndex(manifest, compressed);
  const queries = ['ESP32-S3 reset circuit', 'SIM7670X', 'STM32F4 schematic'];
  console.log(JSON.stringify({
    bucket,
    region,
    manifestKey,
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    indexedSources: index.indexedSources,
    quarantinedSources: index.quarantinedSources,
    indexedChunks: index.chunks.length,
    queries: queries.map(query => ({ query, hits: searchKnowledgeIndex(index, query, 3).hits.map(hit => ({ source: hit.source, category: hit.category, page: hit.page })) })),
  }, null, 2));
}

void main().catch(error => { console.error(`EDA knowledge inspection failed: ${error instanceof Error ? error.name : 'unknown'}`); process.exitCode = 1; });
