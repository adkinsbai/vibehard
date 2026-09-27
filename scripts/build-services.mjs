import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";

const entries = {
  "knowledge-batch-control": "scripts/knowledge-batch-control.ts",
  "accept-agent-retrieval": "scripts/accept-agent-retrieval.ts",
  "knowledge-retrieval": "scripts/knowledge-retrieval-worker.ts",
  "design-worker": "scripts/design-worker.ts",
  gateway: "gateway/index.ts",
  runner: "runner/index.ts",
  migrate: "scripts/migrate.ts",
  "llm-bootstrap": "scripts/bootstrap-llm-settings.ts",
};

await mkdir("dist/services", { recursive: true });
const workflowSkill = await readFile(new URL("../runner/skills/cloud-project-workflow/SKILL.md", import.meta.url), "utf8");

await Promise.all(Object.entries(entries).map(([name, entry]) => build({
  entryPoints: [entry],
  outfile: `dist/services/${name}.cjs`,
  bundle: true,
  define: { __VIBEHARD_WORKFLOW_SKILL__: JSON.stringify(workflowSkill) },
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  minify: false,
  logLevel: "info",
})));
