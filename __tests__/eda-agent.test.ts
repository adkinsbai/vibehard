// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/server/llm-settings', () => ({ runtimeLlm: vi.fn() }));
vi.mock('@/lib/server/llm-client', () => ({ callLlm: vi.fn() }));
vi.mock('@/lib/server/eda-knowledge', () => ({ searchEdaKnowledge: vi.fn(), EdaKnowledgeError: class extends Error { status = 503; } }));
import { runtimeLlm } from '@/lib/server/llm-settings';
import { callLlm } from '@/lib/server/llm-client';
import { searchEdaKnowledge } from '@/lib/server/eda-knowledge';
import { proposeEdaEdit } from '@/lib/server/eda-agent';
import { createStarterDocument } from '@/lib/eda/document';
beforeEach(() => vi.resetAllMocks());
describe('Agent edits are validated proposals', () => {
  it('reports unavailable model honestly without generating a fake result', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue(null);
    await expect(proposeEdaEdit(createStarterDocument(), '改成绿色')).rejects.toThrow(/配置/);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it('binds server-generated identity and current revision, without mutating input', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test', apiKey: 'fake-test', baseUrl: 'https://example.com', protocol: 'responses' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ summary: '重命名', commands: [{ type: 'renameDocument', name: 'My circuit' }] }));
    const doc = createStarterDocument(); const original = structuredClone(doc);
    const result = await proposeEdaEdit(doc, '重命名');
    expect(result.batch).toMatchObject({ actor: 'agent', baseRevision: doc.revision });
    expect(result.model).toBe('test'); expect(doc).toEqual(original);
  });
  it('rejects syntactically valid but impossible graph edits', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ summary: 'broken', commands: [{ type: 'removeComponent', id: 'missing' }] }));
    await expect(proposeEdaEdit(createStarterDocument(), 'remove')).rejects.toThrow();
  });
  it('captures raw model output before rejecting an invalid proposal during an audit run', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(callLlm).mockResolvedValue('not valid JSON');
    const capture = vi.fn(async () => undefined);
    await expect(proposeEdaEdit(createStarterDocument(), '请修改电路', undefined, capture)).rejects.toThrow(/模型返回的修改/);
    expect(capture).toHaveBeenCalledWith('not valid JSON', 'test');
  });
  it('passes retrieved source excerpts to the model and returns their provenance with the proposal', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(searchEdaKnowledge).mockResolvedValue({ snapshotSha256: 'a'.repeat(64), indexedSources: 1, quarantinedSources: 0, hits: [{ sourceSha256: 'b'.repeat(64), source: 'board.pdf', category: 'schematics', page: 2, excerpt: 'ESP32-S3 EN reset', reviewStatus: 'auto_approved_for_index', manualReview: false }] });
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ summary: '参考资料后重命名', commands: [{ type: 'renameDocument', name: 'Test circuit' }] }));
    const result = await proposeEdaEdit(createStarterDocument(), '本次要求：参考 ESP32-S3 复位电路');
    expect(searchEdaKnowledge).toHaveBeenCalledWith('参考 ESP32-S3 复位电路', 3);
    expect(JSON.parse(vi.mocked(callLlm).mock.calls[0][2] as string).knowledgeReferences[0]).toMatchObject({ source: 'board.pdf', page: 2 });
    expect(result.references[0]).toMatchObject({ source: 'board.pdf', page: 2 });
    expect(result.knowledgeSnapshotSha256).toBe('a'.repeat(64));
  });
});
