// Exact development-tree files allowed to differ from the active release.
// Keep the production baseline, including model discovery and PCB/Demo, intact.
export const ragReleaseOverlay = [
  "__tests__/design-page.test.tsx", "__tests__/design-postgres.test.ts",
  "__tests__/design-result-retrieval.test.tsx", "__tests__/design-worker.test.ts",
  "__tests__/knowledge-import-batch.test.ts",
  "__tests__/knowledge-library.test.tsx", "__tests__/knowledge-retrieval.test.ts",
  "__tests__/llm-routes.test.ts", "__tests__/shared-knowledge-postgres.test.ts",
  "app/api/design/route.ts", "app/api/design/[id]/route.ts", "app/api/design/[id]/download/route.ts",
  "app/api/knowledge/shared/route.ts", "app/app/agent/[projectId]/designs/page.tsx", "app/app/design/page.tsx",
  "components/app/agent-workbench.tsx", "components/app/design-workbench.tsx", "components/app/design-result.tsx",
  "components/app/knowledge-library.tsx", "components/app/shared-knowledge-library.tsx",
  "lib/agent/design-jobs.ts", "lib/agent/design-prompt.ts", "lib/agent/hardware-design-knowledge.ts",
  "lib/agent/knowledge-retrieval.ts", "lib/agent/llm.ts", "lib/agent/shared-knowledge.ts",
  "lib/db/schema.ts", "lib/module-help.ts", "lib/knowledge-import-batch.ts", "lib/knowledge-import.ts",
  "lib/server/design-job-store.ts", "lib/server/design-job-worker.ts", "lib/server/design-knowledge.ts", "lib/server/shared-knowledge-store.ts",
  "scripts/build-services.mjs", "scripts/design-worker.ts", "scripts/import-board-knowledge.mjs",
  "scripts/extract-knowledge-pdf.py", "scripts/verify-design-knowledge.mjs",
  "drizzle/0005_design_jobs.sql", "drizzle/0006_shared_knowledge.sql",
  "drizzle/meta/0005_snapshot.json", "drizzle/meta/0006_snapshot.json", "drizzle/meta/_journal.json",
  "deploy/systemd/vibehard-design-worker.service",
];
