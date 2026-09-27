import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPanel } from '@/components/eda/agent-panel';
import { createComponent } from '@/lib/eda/library';
import { createEmptyDocument } from '@/lib/eda/document';
import { exportKicadSchematic } from '@/lib/eda/kicad';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('lets a user discuss a bounded circuit proposal and opens real native KiCad files only after acceptance', async () => {
  const component = createComponent('r0603', 1);
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agent: true })).mockResolvedValueOnce(Response.json({ summary: '添加电阻 R1', model: 'test-model', references: [{ sourceSha256: 'a'.repeat(64), source: 'board.pdf', category: 'schematics', page: 2, excerpt: 'R1', reviewStatus: 'auto_approved_for_index', manualReview: false }], batch: { id: 'batch-1', baseRevision: 0, actor: 'agent', label: '添加电阻', commands: [{ type: 'addComponent', component }] } }));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<AgentPanel onCreate={onCreate} />);
  fireEvent.change(screen.getByRole('textbox', { name: '向 Agent 描述电路' }), { target: { value: '画一个电阻' } });
  await waitFor(() => expect(screen.getByRole('button', { name: '生成修改提案' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '生成修改提案' }));
  const review = await screen.findByRole('region', { name: '待审阅修改' });
  expect(within(review).getByText(/添加 R1/)).toBeInTheDocument();
  expect(within(review).getByText(/新增器件 R1/)).toBeInTheDocument();
  expect(within(review).getByText(/OSS 资料参考/)).toBeInTheDocument();
  expect(within(review).getByText(/board.pdf.*第 2 页/)).toBeInTheDocument();
  expect(onCreate).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[1][0]).toBe('/api/eda/agent');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).document.components).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '加入设计草稿' }));
  expect(within(screen.getByRole('region', { name: '设计草稿' })).getByText(/R1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '创建并打开 KiCad 工程' }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  const [sources] = onCreate.mock.calls[0];
  expect(sources.schematic).toContain('(kicad_sch');
  expect(sources.schematic).toContain('"R1"');
  expect(sources.pcb).toContain('(kicad_pcb');
});

it('shows the real model configuration state instead of offering fake generation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ agent: false })));
  render(<AgentPanel onCreate={vi.fn()} />);
  expect(await screen.findByRole('link', { name: '模型设置' })).toHaveAttribute('href', '/app/admin');
  expect(screen.getByRole('button', { name: '生成修改提案' })).toBeDisabled();
});
it('can start a copy from the current saved KiCad schematic without modifying the source project', async () => {
  const source = createEmptyDocument(); source.components = [createComponent('r0603', 1)];
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes('capabilities') ? { agent: false } : { schematic: exportKicadSchematic(source), netlist: '(export (nets))', sha256: 'a'.repeat(64), savedFilesOnly: true })));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn();
  render(<AgentPanel currentProjectId="22222222-2222-4222-8222-222222222222" onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: '读取当前已保存原理图' }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: '设计草稿' })).getByText(/R1/)).toBeInTheDocument());
  expect(fetcher.mock.calls.find(call => String(call[0]).includes('/api/eda/desktop/'))![1].body).toContain('snapshot');
  expect(onCreate).not.toHaveBeenCalled();
});

it('creates a labeled candidate only after rechecking the original saved schematic', async () => {
  const sourceId = '22222222-2222-4222-8222-222222222222';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const source = createEmptyDocument(); source.components = [createComponent('r0603', 1)];
  let finishRecheck!: (response: Response) => void;
  const recheck = new Promise<Response>(resolve => { finishRecheck = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agent: false }))
    .mockResolvedValueOnce(Response.json({ schematic: exportKicadSchematic(source), netlist: '(export (nets))', sha256: 'a'.repeat(64) }))
    .mockReturnValueOnce(recheck);
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const view = render(<AgentPanel currentProjectId={sourceId} onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: '读取当前已保存原理图' }));
  await screen.findByRole('region', { name: '设计草稿' });
  view.rerender(<AgentPanel currentProjectId={otherId} onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: /创建.*KiCad 工程/ }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[2][0]).toBe(`/api/eda/desktop/${sourceId}`);
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '新对话' })).toBeDisabled();
  finishRecheck(Response.json({ sha256: 'a'.repeat(64) }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  expect(onCreate.mock.calls[0][1]).toContain('候选');
  expect(onCreate.mock.calls[0][1]).toContain(sourceId);
});

it('keeps the candidate draft and blocks creation when the saved source changed', async () => {
  const source = createEmptyDocument(); source.components = [createComponent('r0603', 1)];
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agent: false }))
    .mockResolvedValueOnce(Response.json({ schematic: exportKicadSchematic(source), netlist: '(export (nets))', sha256: 'a'.repeat(64) }))
    .mockResolvedValueOnce(Response.json({ sha256: 'b'.repeat(64) }));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn();
  render(<AgentPanel currentProjectId="22222222-2222-4222-8222-222222222222" onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: '读取当前已保存原理图' }));
  await screen.findByRole('region', { name: '设计草稿' });
  fireEvent.click(screen.getByRole('button', { name: /创建.*KiCad 工程/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/409.*源工程.*变化/);
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: '设计草稿' })).toBeInTheDocument();
});

it('refuses to import a saved source without a verifiable snapshot hash', async () => {
  const source = createEmptyDocument(); source.components = [createComponent('r0603', 1)];
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agent: false }))
    .mockResolvedValueOnce(Response.json({ schematic: exportKicadSchematic(source), netlist: '(export (nets))' }));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn();
  render(<AgentPanel currentProjectId="22222222-2222-4222-8222-222222222222" onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: '读取当前已保存原理图' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/SHA-256/);
  expect(screen.queryByRole('region', { name: '设计草稿' })).not.toBeInTheDocument();
  expect(onCreate).not.toHaveBeenCalled();
});
