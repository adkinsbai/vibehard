import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ clients: [] as Array<EventTarget & { disconnect: ReturnType<typeof vi.fn>; sendKey: ReturnType<typeof vi.fn> }> }));
vi.mock('@novnc/novnc', () => ({ default: class extends EventTarget {
  disconnect = vi.fn(); sendKey = vi.fn(); focus = vi.fn();
  constructor() { super(); mocks.clients.push(this); }
} }));
import { DesktopWorkbench } from '@/components/eda/desktop-workbench';
const project = { id: '22222222-2222-4222-8222-222222222222', name: '真实工程' };
beforeEach(() => { mocks.clients.length = 0; });
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function openProject() {
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes('capabilities') ? { agent: false } : url.includes('/modules') ? { modules: [] } : url === '/api/projects' ? { projects: [project] } : { running: true, files: [], ticket: crypto.randomUUID() })));
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '选择工程' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
  await waitFor(() => expect(mocks.clients).toHaveLength(1));
  return fetcher;
}

it('shows login without creating a simulated editor for unauthenticated users', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  render(<DesktopWorkbench />);
  expect(await screen.findByRole('link', { name: '登录平台' })).toHaveAttribute('href', '/login');
  expect(mocks.clients).toHaveLength(0);
});
it('identifies the public beta and hardware review boundary before login', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  render(<DesktopWorkbench />);
  expect(screen.getByRole('note', { name: '公开测试版说明' })).toHaveTextContent('公开测试版');
  expect(screen.getByRole('note', { name: '公开测试版说明' })).toHaveTextContent('不可用于正式硬件设计');
  expect(screen.getByRole('note', { name: '公开测试版说明' })).toHaveTextContent('硬件工程师审核');
});
it('exposes the Agent conversation in the real KiCad workbench', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes('capabilities') ? { agent: false } : url.includes('/modules') ? { modules: [] } : { projects: [] }))));
  render(<DesktopWorkbench />);
  expect(await screen.findByRole('complementary', { name: 'AI 原理图 Agent' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '向 Agent 描述电路' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '向 Agent 描述电路' }), { target: { value: '画一个电路' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agent 画图' }));
  expect(screen.getByRole('button', { name: 'Agent 画图' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Agent 画图' }));
  expect(screen.getByRole('textbox', { name: '向 Agent 描述电路' })).toHaveValue('画一个电路');
});

it('sends save keys only after connecting and preserves the saved-file warning', async () => {
  const fetcher = await openProject();
  expect(screen.getByRole('button', { name: '保存 Ctrl+S' })).toBeDisabled();
  act(() => mocks.clients[0].dispatchEvent(new Event('connect')));
  fireEvent.click(screen.getByRole('button', { name: '保存 Ctrl+S' }));
  expect(mocks.clients[0].sendKey).toHaveBeenCalledTimes(4);
  expect(screen.getByRole('status')).toHaveTextContent('已发送 Ctrl+S');
  const startBody = JSON.parse(fetcher.mock.calls.find(call => String(call[0]).includes('/api/eda/desktop/'))![1].body);
  expect(startBody).toEqual({ action: 'start', editor: 'schematic' });
  cleanup();
  expect(mocks.clients[0].disconnect).toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(call => String(call[0]).includes('/api/eda/desktop/'))).toHaveLength(1); // Leaving the page never terminates the native session.
});

it('offers reconnect when the transport drops instead of claiming a saved session', async () => {
  await openProject();
  act(() => mocks.clients[0].dispatchEvent(new Event('connect')));
  act(() => mocks.clients[0].dispatchEvent(new Event('disconnect')));
  expect(screen.getByRole('heading', { name: 'KiCad 连接已断开' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存 Ctrl+S' })).toBeDisabled();
  cleanup();
  expect(mocks.clients[0].disconnect).not.toHaveBeenCalled();
});

it('shows schematic parity failures separately from ordinary PCB DRC results', async () => {
  const fetcher = await openProject();
  fetcher.mockResolvedValue(Response.json({ exitCode: 5, report: { violations: [], unconnected_items: [], schematic_parity: [{ type: 'missing_footprint' }, { type: 'extra_footprint' }] } }));
  fireEvent.click(screen.getByRole('button', { name: '运行 DRC' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 项问题'));
  expect(screen.getByText(/原理图不一致 2/)).toBeInTheDocument();
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toEqual({ action: 'check', kind: 'drc' });
});

it('ends a stalled connection with a visible timeout', async () => {
  await openProject();
  const timer = vi.spyOn(window, 'setTimeout');
  fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
  await waitFor(() => expect(mocks.clients).toHaveLength(2));
  const callback = timer.mock.calls.find(call => call[1] === 20_000)?.[0];
  expect(typeof callback).toBe('function');
  act(() => { if (typeof callback === 'function') callback(); });
  expect(screen.getByRole('status')).toHaveTextContent('桌面连接超时');
  expect(mocks.clients[1].disconnect).toHaveBeenCalled();
  timer.mockRestore();
});

it('routes a saved board asynchronously and accepts the reviewed candidate as a new project', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const nextProject = { id: '33333333-3333-4333-8333-333333333333', name: '真实工程 · 自动布线候选' };
  const jobId = '44444444-4444-4444-8444-444444444444';
  const sources = { schematic: '(kicad_sch (version 20250114))', pcb: '(kicad_pcb (version 20241229))', project: '{"board":{"design_settings":{"rules":{"track_width":0.25}}}}', symLibTable: '(sym_lib_table (lib (name "Local")))', fpLibTable: '(fp_lib_table (lib (name "Local")))', designRules: '(version 1)\n(rule "custom" (constraint clearance (min 0.2mm)))' };
  const summary = { unconnected: 0, schematicParity: 0, violations: {}, violationSignatures: {} };
  const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes('capabilities')) return Promise.resolve(Response.json({ agent: false }));
    if (url.includes('/modules')) return Promise.resolve(Response.json({ modules: [] }));
    if (url === '/api/projects') return Promise.resolve(Response.json(options?.method === 'POST' ? { project: nextProject } : { projects: [project] }));
    if (url.includes('/api/eda/desktop/')) {
      const body = JSON.parse(String(options?.body));
      if (body.action === 'routeStart') return Promise.resolve(Response.json({ jobId, state: 'queued' }));
      if (body.action === 'routeStatus') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), before: { ...summary, unconnected: 2 }, after: summary }));
      if (body.action === 'routeCandidate') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), before: { ...summary, unconnected: 2 }, after: summary, sources }));
      return Promise.resolve(Response.json({ running: true, files: [], ticket: crypto.randomUUID() }));
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '选择工程' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
  await waitFor(() => expect(mocks.clients).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: '自动布线' }));
  await screen.findByText(/未布通 2 → 0/);
  expect(fetcher.mock.calls.filter(call => call[0] === '/api/projects' && call[1]?.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '审阅布线候选' }));
  await screen.findByText(/源 PCB 指纹/);
  fireEvent.click(screen.getByRole('button', { name: '接受为新工程' }));
  await waitFor(() => expect(fetcher.mock.calls.some(call => call[0] === '/api/projects' && call[1]?.method === 'POST')).toBe(true));
  const starts = fetcher.mock.calls.filter(call => String(call[0]).includes('/api/eda/desktop/') && JSON.parse(call[1].body).action === 'start');
  expect(starts).toHaveLength(2);
  expect(String(starts[0][0])).toContain(project.id);
  expect(String(starts[1][0])).toContain(nextProject.id);
  expect(JSON.parse(starts[1][1].body).sources).toEqual(sources);
  expect(JSON.parse(starts[1][1].body).verifySources).toBe(true);
  expect(fetcher.mock.calls.filter(call => JSON.parse(String(call[1]?.body ?? '{}')).action === 'routeCandidate')).toHaveLength(2);
  const stoppedAt = fetcher.mock.calls.findIndex(call => JSON.parse(String(call[1]?.body ?? '{}')).action === 'stop');
  const createdAt = fetcher.mock.calls.findIndex(call => call[0] === '/api/projects' && call[1]?.method === 'POST');
  expect(stoppedAt).toBeGreaterThan(-1);
  expect(stoppedAt).toBeLessThan(createdAt);
});

it('does not create a project when the original board changed after candidate review', async () => {
  const jobId = '44444444-4444-4444-8444-444444444444';
  let candidateReads = 0;
  const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes('capabilities')) return Promise.resolve(Response.json({ agent: false }));
    if (url.includes('/modules')) return Promise.resolve(Response.json({ modules: [] }));
    if (url === '/api/projects') return Promise.resolve(Response.json({ projects: [project] }));
    const body = JSON.parse(String(options?.body));
    if (body.action === 'routeStart') return Promise.resolve(Response.json({ jobId, state: 'queued' }));
    if (body.action === 'routeStatus') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), before: { unconnected: 1, schematicParity: 0, violations: {} }, after: { unconnected: 0, schematicParity: 0, violations: {} } }));
    if (body.action === 'routeCandidate') {
      candidateReads += 1;
      return Promise.resolve(candidateReads === 1
        ? Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), sources: { schematic: '(kicad_sch)', pcb: '(kicad_pcb)', project: '{}' } })
        : Response.json({ error: '源工程已修改，请重新布线' }, { status: 409 }));
    }
    return Promise.resolve(Response.json({ running: true, files: [], ticket: crypto.randomUUID() }));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '选择工程' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '自动布线' }));
  await screen.findByText(/未布通 1 → 0/);
  fireEvent.click(screen.getByRole('button', { name: '审阅布线候选' }));
  await screen.findByText(/源 PCB 指纹/);
  fireEvent.click(screen.getByRole('button', { name: '接受为新工程' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('源工程已修改，请重新布线');
  expect(fetcher.mock.calls.filter(call => call[0] === '/api/projects' && call[1]?.method === 'POST')).toHaveLength(0);
});

it('rejects a candidate without its native project settings before any new project is created', async () => {
  const jobId = '44444444-4444-4444-8444-444444444444';
  const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes('capabilities')) return Promise.resolve(Response.json({ agent: false }));
    if (url.includes('/modules')) return Promise.resolve(Response.json({ modules: [] }));
    if (url === '/api/projects') return Promise.resolve(Response.json({ projects: [project] }));
    const body = JSON.parse(String(options?.body));
    if (body.action === 'routeStart') return Promise.resolve(Response.json({ jobId, state: 'queued' }));
    if (body.action === 'routeStatus') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), before: { unconnected: 1, schematicParity: 0, violations: {} }, after: { unconnected: 0, schematicParity: 0, violations: {} } }));
    if (body.action === 'routeCandidate') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), sources: { schematic: '(kicad_sch)', pcb: '(kicad_pcb)' } }));
    return Promise.resolve(Response.json({ running: false, files: [] }));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '选择工程' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '自动布线' }));
  await screen.findByText(/未布通 1 → 0/);
  fireEvent.click(screen.getByRole('button', { name: '审阅布线候选' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('布线候选文件格式或大小不符合导入限制');
  expect(fetcher.mock.calls.filter(call => call[0] === '/api/projects' && call[1]?.method === 'POST')).toHaveLength(0);
  expect(fetcher.mock.calls.filter(call => JSON.parse(String(call[1]?.body ?? '{}')).action === 'stop')).toHaveLength(0);
});

it('resumes the same destination after reload when capacity initially blocks native import', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const nextProject = { id: '33333333-3333-4333-8333-333333333333', name: '候选工程' };
  const jobId = '44444444-4444-4444-8444-444444444444';
  let destinationStarts = 0;
  let projectCreates = 0;
  const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes('capabilities')) return Promise.resolve(Response.json({ agent: false }));
    if (url.includes('/modules')) return Promise.resolve(Response.json({ modules: [] }));
    if (url === '/api/projects') {
      if (options?.method === 'POST') { projectCreates += 1; return Promise.resolve(Response.json({ project: nextProject })); }
      return Promise.resolve(Response.json({ projects: projectCreates ? [project, nextProject] : [project] }));
    }
    const body = JSON.parse(String(options?.body));
    if (body.action === 'routeStart') return Promise.resolve(Response.json({ jobId, state: 'queued' }));
    if (body.action === 'routeStatus') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), before: { unconnected: 1, schematicParity: 0, violations: {} }, after: { unconnected: 0, schematicParity: 0, violations: {} } }));
    if (body.action === 'routeCandidate') return Promise.resolve(Response.json({ jobId, state: 'ready', sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), sources: { schematic: '(kicad_sch)', pcb: '(kicad_pcb)', project: '{}' } }));
    if (body.action === 'start' && String(url).includes(nextProject.id)) {
      destinationStarts += 1;
      return Promise.resolve(destinationStarts === 1 ? Response.json({ error: 'KiCad desktop capacity is full' }, { status: 429 }) : Response.json({ running: true, files: [], ticket: crypto.randomUUID() }));
    }
    return Promise.resolve(Response.json({ running: false, files: [] }));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '选择工程' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '自动布线' }));
  await screen.findByText(/未布通 1 → 0/);
  fireEvent.click(screen.getByRole('button', { name: '审阅布线候选' }));
  await screen.findByText(/源 PCB 指纹/);
  fireEvent.click(screen.getByRole('button', { name: '接受为新工程' }));
  await screen.findByRole('button', { name: '重试打开候选工程' });
  expect(screen.getAllByRole('status').some(item => item.textContent?.includes('KiCad desktop capacity is full'))).toBe(true);
  const pending = sessionStorage.getItem('vibehard-eda-pending-route-v1');
  expect(pending).toContain(nextProject.id);
  expect(pending).not.toContain('kicad_sch');
  cleanup();
  render(<DesktopWorkbench />);
  await screen.findByRole('button', { name: '审阅布线候选' });
  expect(screen.getByRole('combobox', { name: '选择工程' })).toHaveValue(project.id);
  fireEvent.click(screen.getByRole('button', { name: '审阅布线候选' }));
  await screen.findByRole('button', { name: '重试打开候选工程' });
  fireEvent.click(screen.getByRole('button', { name: '重试打开候选工程' }));
  await waitFor(() => expect(destinationStarts).toBe(2));
  const destinationBodies = fetcher.mock.calls.filter(call => String(call[0]).includes(nextProject.id) && JSON.parse(String(call[1]?.body ?? '{}')).action === 'start').map(call => JSON.parse(String(call[1].body)));
  expect(destinationBodies.every(body => body.verifySources === true)).toBe(true);
  expect(fetcher.mock.calls.filter(call => call[0] === '/api/projects' && call[1]?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(call => JSON.parse(String(call[1]?.body ?? '{}')).action === 'stop')).toHaveLength(2);
  expect(fetcher.mock.calls.filter(call => JSON.parse(String(call[1]?.body ?? '{}')).action === 'routeCandidate')).toHaveLength(4);
  expect(sessionStorage.getItem('vibehard-eda-pending-route-v1')).toBeNull();
});

it('does not restore a pending route when the destination is absent from owned projects', async () => {
  sessionStorage.setItem('vibehard-eda-pending-route-v1', JSON.stringify({ sourceProjectId: project.id, jobId: '44444444-4444-4444-8444-444444444444', id: '33333333-3333-4333-8333-333333333333' }));
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes('capabilities') ? { agent: false } : url.includes('/modules') ? { modules: [] } : { projects: [project] })));
  vi.stubGlobal('fetch', fetcher);
  render(<DesktopWorkbench />);
  await screen.findByRole('option', { name: project.name });
  expect(screen.getByRole('combobox', { name: '选择工程' })).toHaveValue('');
  expect(sessionStorage.getItem('vibehard-eda-pending-route-v1')).toBeNull();
  expect(fetcher.mock.calls.some(call => String(call[0]).includes('/api/eda/desktop/'))).toBe(false);
});
