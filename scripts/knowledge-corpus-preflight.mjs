// Read-only unless --output is explicitly supplied. Run with:
// node --import tsx scripts/knowledge-corpus-preflight.mjs <folder> [--hash] [--output manifest.json]
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectKnowledgeCorpus } from "../lib/server/knowledge-corpus-preflight.ts";

const args = process.argv.slice(2);
const folder = args[0];
if (!folder || folder.startsWith("--")) {
  console.error("用法：tsx scripts/knowledge-corpus-preflight.mjs <资料目录> [--hash] [--output manifest.json]");
  process.exitCode = 2;
} else {
  const hash = args.includes("--hash");
  const outputAt = args.indexOf("--output");
  const output = outputAt < 0 ? null : args[outputAt + 1];
  if (outputAt >= 0 && (!output || output.startsWith("--"))) {
    console.error("--output 后需要指定新文件路径");
    process.exitCode = 2;
  } else {
    try {
      const inventory = await inspectKnowledgeCorpus(folder, { hash });
      if (output) await writeFile(resolve(output), `${JSON.stringify(inventory, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ schema: inventory.schema, files: inventory.entries.length, totalBytes: inventory.totalBytes,
        counts: inventory.counts, skippedSymlinks: inventory.skippedSymlinks, skippedEntries: inventory.skippedEntries,
        duplicates: inventory.duplicates, duplicateBytes: inventory.duplicateBytes, hashesCalculated: hash,
        manifestWritten: Boolean(output), uploadPerformed: false, indexBuilt: false }, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "盘点失败");
      process.exitCode = 1;
    }
  }
}
