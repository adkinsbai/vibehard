import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdaWorkbench } from '@/components/eda/workbench';
import { createStarterDocument } from '@/lib/eda/document';
import { pinPosition } from '@/lib/eda/library';

beforeEach(() => {
  const items = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => items.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { items.set(key, value); });
  vi.mocked(localStorage.clear).mockImplementation(() => items.clear());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('browser EDA workbench', () => {
  it('edits a selected component, undoes it, and restores the saved draft after remount', async () => {
    const first = render(<EdaWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '添加 电阻' }));
    fireEvent.click(screen.getByRole('button', { name: /选中 R1/ }));
    const value = screen.getByRole('textbox', { name: '器件值' });
    fireEvent.change(value, { target: { value: '470R' } });
    fireEvent.click(screen.getByRole('button', { name: '应用属性' }));
    expect(screen.getByRole('textbox', { name: '器件值' })).toHaveValue('470R');
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByRole('textbox', { name: '器件值' })).not.toHaveValue('470R');
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(localStorage.getItem('vibehard-eda-draft-v1')).toContain('470R'));
    first.unmount();
    render(<EdaWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: /选中 R1/ }));
    expect(screen.getByRole('textbox', { name: '器件值' })).toHaveValue('470R');
  });

  it('connects two visible pins and exposes the resulting net', async () => {
    localStorage.setItem('vibehard-eda-draft-v1', JSON.stringify(createStarterDocument()));
    render(<EdaWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '添加 电阻' }));
    fireEvent.click(screen.getByRole('button', { name: /连接引脚 R2\.1/ }));
    fireEvent.click(screen.getByRole('button', { name: /连接引脚 R1\.1/ }));
    expect(screen.getByText(/已连接/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PCB' }));
    expect(screen.getByRole('img', { name: /PCB 编辑画布/ })).toBeInTheDocument();
  });

  it('preserves a damaged draft and requires an explicit new draft action', () => {
    localStorage.setItem('vibehard-eda-draft-v1', '{damaged');
    render(<EdaWorkbench />);
    expect(screen.getByRole('heading', { name: '本地草稿无法读取' })).toBeInTheDocument();
    expect(localStorage.getItem('vibehard-eda-draft-v1')).toBe('{damaged');
  });
  it('starts with an empty user document and no placeholder controllers', () => {
    render(<EdaWorkbench />);
    expect(screen.getByRole('textbox', { name: '文档名称' })).toHaveValue('未命名电路');
    expect(screen.queryByRole('button', { name: /选中 R1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加 通用控制器' })).not.toBeInTheDocument();
  });
  it('routes copper at exact native pad positions without canvas offsets', () => {
    render(<EdaWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '添加 电阻' }));
    fireEvent.click(screen.getByRole('button', { name: '添加 LED' }));
    fireEvent.click(screen.getByRole('button', { name: '连接引脚 R1.2' }));
    fireEvent.click(screen.getByRole('button', { name: '连接引脚 D1.2' }));
    fireEvent.click(screen.getByRole('button', { name: 'PCB' }));
    fireEvent.click(screen.getByRole('button', { name: '走线' }));
    fireEvent.click(screen.getByRole('button', { name: '连接引脚 R1.2' }));
    fireEvent.click(screen.getByRole('button', { name: '连接引脚 D1.2' }));
    const saved = JSON.parse(localStorage.getItem('vibehard-eda-draft-v1')!);
    expect(saved.tracks).toHaveLength(1);
    expect(saved.tracks[0].points).toEqual([pinPosition(saved.components[0], '2', 'pcb'), pinPosition(saved.components[1], '2', 'pcb')]);
  });
  it('reports an invalid reference without crashing or corrupting the canvas', () => {
    render(<EdaWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '添加 电阻' }));
    fireEvent.change(screen.getByRole('textbox', { name: '位号' }), { target: { value: 'INVALID' } });
    fireEvent.click(screen.getByRole('button', { name: '应用属性' }));
    expect(screen.getByRole('button', { name: /选中 R1/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('vibehard-eda-draft-v1')!).components[0].ref).toBe('R1');
  });
});
