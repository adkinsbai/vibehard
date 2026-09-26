import { applyEditBatch } from './commands';
import { parseDocument } from './document';
import type { EdaDocument, EditBatch } from './types';

export type EditorHistory = { past: EdaDocument[]; present: EdaDocument; future: EdaDocument[] };

export function createHistory(doc: EdaDocument): EditorHistory {
  return { past: [], present: parseDocument(doc), future: [] };
}

export function commitBatch(history: EditorHistory, batch: EditBatch): EditorHistory {
  const next = applyEditBatch(history.present, batch);
  if (next === history.present) return history;
  return { past: [...history.past, history.present], present: next, future: [] };
}

function restoredContent(snapshot: EdaDocument, current: EdaDocument): EdaDocument {
  return parseDocument({ ...snapshot, revision: current.revision + 1, appliedBatchIds: current.appliedBatchIds });
}

export function undo(history: EditorHistory): EditorHistory {
  if (history.past.length === 0) return history;
  const prior = history.past[history.past.length - 1];
  return { past: history.past.slice(0, -1), present: restoredContent(prior, history.present), future: [history.present, ...history.future] };
}

export function redo(history: EditorHistory): EditorHistory {
  if (history.future.length === 0) return history;
  const [next, ...future] = history.future;
  return { past: [...history.past, history.present], present: restoredContent(next, history.present), future };
}
