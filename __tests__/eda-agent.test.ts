// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/server/llm-settings', () => ({ runtimeLlm: vi.fn() }));
vi.mock('@/lib/server/llm-client', () => ({ callLlm: vi.fn() }));
vi.mock('@/lib/server/eda-module-catalog', () => ({ publishedNativeCatalog: vi.fn(async () => ({})) }));
import { runtimeLlm } from '@/lib/server/llm-settings';
import { callLlm } from '@/lib/server/llm-client';
import { proposeEdaEdit } from '@/lib/server/eda-agent';
import { createStarterDocument } from '@/lib/eda/document';
import { createEmptyDocument } from '@/lib/eda/document';
import { applyEditBatch } from '@/lib/eda/commands';
import { MODULES, catalogFromDefinitions } from '@/lib/eda/modules';
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
  it('hides the software fixture and rejects its insertion proposal', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ summary: '添加测试用 LED 指示模块，仍需接入 3.3 V 和 GND', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] }));
    const doc = createEmptyDocument();
    await expect(proposeEdaEdit(doc, '添加一个状态 LED 指示模块')).rejects.toThrow(/校验/);
    const modelInput = String(vi.mocked(callLlm).mock.calls[0]?.[2] ?? '');
    expect(modelInput).not.toContain('sample.led-indicator');
    expect(doc.components).toHaveLength(0);
  });

  it('uses a request-scoped published definition and validates the proposal against it', async () => {
    vi.mocked(runtimeLlm).mockResolvedValue({ model: 'test' } as Awaited<ReturnType<typeof runtimeLlm>>);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ summary: '插入已审核模块', commands: [
      { type: 'insertModule', moduleId: 'sample.led-indicator', version: '0.1.0', instanceId: 'status-led', schematic: { x: 50.8, y: 50.8 }, pcb: { x: 20, y: 20 } },
    ] }));
    const definition = { ...MODULES['sample.led-indicator'], verification: 'reviewed' as const };
    const catalog = catalogFromDefinitions([definition]);
    const doc = createEmptyDocument();
    const result = await proposeEdaEdit(doc, '添加已审核状态 LED 模块', undefined, undefined, catalog);
    expect(String(vi.mocked(callLlm).mock.calls[0]?.[2])).toContain(definition.sourceSha256);
    expect(applyEditBatch(doc, result.batch, catalog).moduleInstances).toHaveLength(1);
  });
});
