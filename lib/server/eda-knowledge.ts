import OSS from 'ali-oss';
import { createHash } from 'node:crypto';
import { buildKnowledgeIndex, readKnowledgeArtifact, searchKnowledgeIndex, type EdaKnowledgeIndex } from './eda-knowledge-index';

export class EdaKnowledgeError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

type Config = { bucket: string; manifestKey: string; manifestSha256: string; region: string; endpoint?: string; internal: boolean; accessKeyId: string; accessKeySecret: string };
let cached: { key: string; index: EdaKnowledgeIndex; expiresAt: number } | undefined;
let pending: { key: string; value: Promise<EdaKnowledgeIndex> } | undefined;

export function edaKnowledgeEnabled(): boolean { return process.env.EDA_KNOWLEDGE_ENABLED === 'true'; }

function config(): Config | null {
  if (!edaKnowledgeEnabled()) return null;
  const bucket = process.env.EDA_KNOWLEDGE_OSS_BUCKET || '';
  const manifestKey = process.env.EDA_KNOWLEDGE_OSS_MANIFEST_KEY || '';
  const manifestSha256 = process.env.EDA_KNOWLEDGE_OSS_MANIFEST_SHA256 || '';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || '';
  const region = process.env.EDA_KNOWLEDGE_OSS_REGION || 'oss-cn-beijing';
  const endpoint = process.env.EDA_KNOWLEDGE_OSS_ENDPOINT || undefined;
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket) || !/^knowledge\/processed\/[A-Za-z0-9/._-]+\.json$/.test(manifestKey) || !/^[a-f0-9]{64}$/.test(manifestSha256) || !/^oss-[a-z0-9-]+$/.test(region) || !accessKeyId || !accessKeySecret) {
    throw new EdaKnowledgeError('EDA 资料库服务端配置不完整');
  }
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*aliyuncs\.com$/.test(url.hostname)) throw new Error('Unsupported endpoint');
    } catch { throw new EdaKnowledgeError('EDA 资料库 Endpoint 配置不受支持'); }
  }
  return { bucket, manifestKey, manifestSha256, region, endpoint, internal: process.env.EDA_KNOWLEDGE_OSS_INTERNAL === 'true', accessKeyId, accessKeySecret };
}

async function loadIndex(settings: Config): Promise<EdaKnowledgeIndex> {
  const client = new OSS({ bucket: settings.bucket, region: settings.region, endpoint: settings.endpoint, internal: settings.internal, secure: true, authorizationV4: true, accessKeyId: settings.accessKeyId, accessKeySecret: settings.accessKeySecret, timeout: 20_000 });
  const read = async (key: string): Promise<Buffer> => {
    const result = await client.get(key);
    if (!Buffer.isBuffer(result.content)) throw new Error('Unexpected OSS object body');
    return result.content;
  };
  const manifest = await read(settings.manifestKey);
  if (createHash('sha256').update(manifest).digest('hex') !== settings.manifestSha256) throw new Error('Pinned knowledge manifest hash mismatch');
  const artifact = readKnowledgeArtifact(manifest);
  const compressed = await read(artifact.key);
  return buildKnowledgeIndex(manifest, compressed);
}

export async function searchEdaKnowledge(query: string, limit = 5) {
  const settings = config();
  if (!settings) return null;
  const key = `${settings.bucket}:${settings.manifestKey}:${settings.manifestSha256}:${settings.region}:${settings.endpoint || ''}:${settings.internal}`;
  try {
    if (cached?.key === key && cached.expiresAt > Date.now()) return searchKnowledgeIndex(cached.index, query, limit);
    if (!pending || pending.key !== key) pending = { key, value: loadIndex(settings) };
    const index = await pending.value;
    cached = { key, index, expiresAt: Date.now() + 15 * 60_000 };
    return searchKnowledgeIndex(index, query, limit);
  } catch {
    throw new EdaKnowledgeError('EDA 资料库暂不可用或快照未通过校验');
  } finally {
    if (pending?.key === key) pending = undefined;
  }
}
