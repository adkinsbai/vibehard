// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/server/llm-settings', () => ({ runtimeLlm: vi.fn() }));
vi.mock('@/lib/server/llm-client', () => ({ callLlm: vi.fn() }));
import { runtimeLlm } from '@/lib/server/llm-settings';
import { callLlm } from '@/lib/server/llm-client';
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
});
