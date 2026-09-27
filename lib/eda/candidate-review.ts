import { parseDocument } from './document';
import type { EdaDocument, EdaNet } from './types';

function pinIds(net: EdaNet): string[] {
  return net.nodes.map(node => `${node.componentId}.${node.pinId}`).sort();
}

function pins(document: EdaDocument, net: EdaNet): string {
  const refs = new Map(document.components.map(component => [component.id, component.ref]));
  const names = net.nodes.map(node => `${refs.get(node.componentId) ?? node.componentId}.${node.pinId}`).sort();
  return names.length <= 12 ? names.join(' ↔ ') : `${names.slice(0, 12).join(' ↔ ')} …另有 ${names.length - 12} 个引脚`;
}

/** Human-readable summary of an Agent's proposed changes to a circuit draft. */
export function summarizeCandidateChanges(beforeInput: EdaDocument, afterInput: EdaDocument): string[] {
  const before = parseDocument(beforeInput);
  const after = parseDocument(afterInput);
  const changes: string[] = [];
  const oldParts = new Map(before.components.map(component => [component.id, component]));
  const newParts = new Map(after.components.map(component => [component.id, component]));
  for (const part of after.components) {
    const old = oldParts.get(part.id);
    if (!old) {
      changes.push(`新增器件 ${part.ref} · ${part.value}`);
      continue;
    }
    if (part.ref !== old.ref || part.kind !== old.kind) changes.push(`替换器件 ${old.ref} · ${old.kind} → ${part.ref} · ${part.kind}`);
    if (part.value !== old.value) changes.push(`修改 ${part.ref} 参数：${old.value} → ${part.value}`);
    if (JSON.stringify(part.schematic) !== JSON.stringify(old.schematic)) changes.push(`移动 ${part.ref} 原理图位置`);
    if (JSON.stringify(part.pcb) !== JSON.stringify(old.pcb)) changes.push(`移动 ${part.ref} PCB 位置`);
    if (part.locked !== old.locked) changes.push(`修改 ${part.ref} 锁定状态`);
  }
  for (const part of before.components) if (!newParts.has(part.id)) changes.push(`删除器件 ${part.ref} · ${part.value}`);

  const oldNets = new Map(before.nets.map(net => [net.id, net]));
  const newNets = new Map(after.nets.map(net => [net.id, net]));
  for (const net of after.nets) {
    const old = oldNets.get(net.id);
    if (!old) {
      changes.push(`新增网络 ${net.name}：${pins(after, net)}`);
      continue;
    }
    if (old.name !== net.name) changes.push(`网络改名：${old.name} → ${net.name}`);
    if (JSON.stringify(pinIds(old)) !== JSON.stringify(pinIds(net))) changes.push(`修改网络 ${net.name}：${pins(before, old)} → ${pins(after, net)}`);
  }
  for (const net of before.nets) if (!newNets.has(net.id)) changes.push(`删除网络 ${net.name}：${pins(before, net)}`);

  const oldTracks = new Map(before.tracks.map(track => [track.id, track]));
  const newTracks = new Map(after.tracks.map(track => [track.id, track]));
  for (const track of after.tracks) {
    const old = oldTracks.get(track.id);
    if (!old) changes.push(`新增 PCB 走线 ${track.id}`);
    else if (JSON.stringify(old) !== JSON.stringify(track)) changes.push(`修改 PCB 走线 ${track.id}`);
  }
  for (const track of before.tracks) if (!newTracks.has(track.id)) changes.push(`删除 PCB 走线 ${track.id}`);
  if (JSON.stringify(before.board) !== JSON.stringify(after.board)) changes.push(`PCB 尺寸：${before.board.width} × ${before.board.height} → ${after.board.width} × ${after.board.height} mm`);
  if (before.name !== after.name) changes.push(`工程名称：${before.name} → ${after.name}`);
  return changes.length ? changes : ['电路内容未改变'];
}
