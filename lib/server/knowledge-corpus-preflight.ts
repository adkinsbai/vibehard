import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { classifyKnowledgeFile, type ImportMode } from "@/lib/knowledge-import";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv"]);
const MAX_FILES = 100_000;
const MAX_DEPTH = 16;

export type CorpusEntry = { path: string; bytes: number; mode: ImportMode; reason: string; sha256?: string };
export type CorpusPreflight = {
  schema: "vibehard-corpus-preflight/v1";
  entries: CorpusEntry[];
  totalBytes: number;
  skippedSymlinks: number;
  skippedEntries: number;
  duplicates: number;
  duplicateBytes: number;
  counts: Record<ImportMode, number>;
};

async function hashFile(path: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

// Read-only inventory: never follows symlinks, expands archives, uploads data,
// reads secrets, or writes to a cloud service. Hashing is opt-in for a quick pass.
export async function inspectKnowledgeCorpus(root: string, options: { hash?: boolean } = {}): Promise<CorpusPreflight> {
  const resolved = await realpath(root);
  if (!(await lstat(resolved)).isDirectory()) throw new Error("资料源必须是目录");
  const entries: CorpusEntry[] = [];
  let skippedSymlinks = 0; let skippedEntries = 0; let totalBytes = 0;
  const counts = { text: 0, pdf: 0, image: 0, eda: 0, archive: 0, metadata: 0, reject: 0 };
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) { skippedEntries++; return; }
    const dir = await opendir(directory);
    for await (const item of dir) {
      if (item.name.startsWith(".") || SKIP_DIRECTORIES.has(item.name)) { skippedEntries++; continue; }
      const full = join(directory, item.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) { skippedSymlinks++; continue; }
      if (info.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!info.isFile()) continue;
      if (entries.length >= MAX_FILES) throw new Error(`资料文件超过 ${MAX_FILES} 份，请先分批`);
      const path = relative(resolved, full).split(sep).join("/");
      const decision = classifyKnowledgeFile(path);
      if (decision.mode === "reject") { counts.reject++; continue; }
      totalBytes += info.size;
      entries.push({ path, bytes: info.size, ...decision, ...(options.hash ? { sha256: await hashFile(full) } : {}) });
    }
  };
  await walk(resolved, 0);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const seen = new Set<string>(); let duplicates = 0; let duplicateBytes = 0;
  for (const entry of entries) {
    counts[entry.mode]++;
    if (entry.sha256) {
      if (seen.has(entry.sha256)) { duplicates++; duplicateBytes += entry.bytes; }
      else seen.add(entry.sha256);
    }
  }
  return { schema: "vibehard-corpus-preflight/v1", entries, totalBytes, skippedSymlinks, skippedEntries, duplicates, duplicateBytes, counts };
}
