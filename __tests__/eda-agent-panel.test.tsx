import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPanel } from '@/components/eda/agent-panel';
import { createComponent } from '@/lib/eda/library';
import { createEmptyDocument } from '@/lib/eda/document';
import { exportKicadSchematic } from '@/lib/eda/kicad';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('lets a user discuss a bounded circuit proposal and opens real native KiCad files only after acceptance', async () => {
  const component = createComponent('r0603', 1);
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agent: true })).mockResolvedValueOnce(Response.json({ summary: '添加电阻 R1', model: 'test-model', batch: { id: 'batch-1', baseRevision: 0, actor: 'agent', label: '添加电阻', commands: [{ type: 'addComponent', component }] } }));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<AgentPanel onCreate={onCreate} />);
  fireEvent.change(screen.getByRole('textbox', { name: '向 Agent 描述电路' }), { target: { value: '画一个电阻' } });
  await waitFor(() => expect(screen.getByRole('button', { name: '生成修改提案' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '生成修改提案' }));
  const review = await screen.findByRole('region', { name: '待审阅修改' });
  expect(within(review).getByText(/添加 R1/)).toBeInTheDocument();
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
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes('capabilities') ? { agent: false } : { schematic: exportKicadSchematic(source), netlist: '(export (nets))', savedFilesOnly: true })));
  vi.stubGlobal('fetch', fetcher);
  const onCreate = vi.fn();
  render(<AgentPanel currentProjectId="22222222-2222-4222-8222-222222222222" onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: '读取当前已保存原理图' }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: '设计草稿' })).getByText(/R1/)).toBeInTheDocument());
  expect(fetcher.mock.calls.find(call => String(call[0]).includes('/api/eda/desktop/'))![1].body).toContain('snapshot');
  expect(onCreate).not.toHaveBeenCalled();
});
