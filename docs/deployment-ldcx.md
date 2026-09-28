# ldcx.tech deployment

## 2026-09-28 audit fixes and BOM pricing (current)

Platform `20260928-bom-pricing-v2`; design worker and private retrieval `20260928-audit-fixes-v1`. Cloud Runner remains `/opt/vibehard/cloud-runner`; Gateway/VibeBoard/EDA manager/nginx unchanged. The two stages passed separate candidate, backup, activation and public protection gates. The unactivated BOM v1 package had a verifier-only relative URL bug and must never be used. Full immutable archive hashes, validation limitations and reverse-order rollback are in [release record](release-audit-bom-20260928.md). No DB migration, OSS or model credential change.

## 2026-09-27 staged reliability / unified retrieval / controlled ingestion (previous)

Units verified at that time (now superseded above):

| Scope | Release | Evidence |
| --- | --- | --- |
| Platform, design worker, cloud Runner | `20260927-unified-retrieval-v1` | PR #5; public Agent tool round, 21.717 s design with verifiable citations, EDA proposal; access denial and protected PCB/Demo checks |
| Internal retrieval and batch CLI | `20260927-controlled-ingestion-v1` | PR #6; 60 concurrent-pair queries P95 34.5 ms, MemoryPeak 43,335,680 bytes; 384 MiB/50% limits; admin/member/socket checks |
| Gateway / VibeBoard / nginx | unchanged | PIDs preserved during each scoped activation |

Stage one (`20260927-design-reliability-v1`, PR #4, commit `1e8f471`) applied additive migration `0007_design_diagnostics`. After evidence-driven model policy fixes, the dedicated isolation DB passed all 12 real design requests below 90 seconds; no automatic paid retries. Earlier failed runs are retained, not counted as passes. Diagnostic columns remain when reverting code. Old records remain readable without fabricated diagnostics.

Immutable archives SHA256:

- reliability: `a89f5049a350034aabf9a0030aa58df94f9dd6f931a226100a59012e3d825ae8`
- unified retrieval: `9d16d0fb86cb5bb2033d83b1fa41111dfce61cb5f636b9eac006d51928ea039d`
- controlled ingestion: `ba7d08ae35341362c5481f9d883d8276ca05762c5cfcb648c0cdcd744002a872`

Each release contains a root-only `backup/` with the previous units and verified PostgreSQL dump; `RELEASE.json` fingerprints source/bundles. The production frontend's complete source overlay remains the unified release; stage three is **not** a replacement frontend package. Preserve that distinction for future frontend packaging.

The index remains `/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite`, original hash `cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9`; no raw OSS originals or new knowledge were imported. `control/current.json` points to this legacy baseline, `disabled.json` is initially empty. The worker is the only indexed retrieval entry over `/run/vibehard-knowledge/search.sock`; callers use the common server authorization service. See controlled-knowledge-ingestion.md for subsequent admin batches.

Rollback in reverse release order, with no in-flight tasks and the existing protected platform environment loaded by systemd: run each release's `source/scripts/deploy-controlled-ingestion.mjs rollback`, then `deploy-unified-retrieval.mjs rollback`, then (if needed) the first-stage reliability deployment script. Do not restore the DB dump over newer data or drop the additive diagnostic column. Stage three rollback only restores the old retrieval unit and leaves its inert registry/evidence intact. Batch content rollback is separate (`knowledge-batch-control.cjs rollback <admin-id> previous`). Candidate units and the local test SSH tunnel have been stopped; failed/successful synthetic task evidence is retained. No credential rotation or account role change occurred.

## 2026-09-27 board-associated RAG worker-only release

Active platform remains `/opt/vibehard/releases/20260926-board-spec-v2/standalone`; only `vibehard-design-worker.service` moved to `/opt/vibehard/releases/20260927-rag-board-links-v1/services/design-worker.cjs`. The previous worker unit is backed up at `<new-release>/backup/vibehard-design-worker.service` (root-only). New unit differs only in `WorkingDirectory` and `ExecStart` release paths. It still uses `DynamicUser=true`, `SupplementaryGroups=vibehard-knowledge`, `MemoryMax=384M`, `CPUQuota=50%`, and the same read-only index. Platform, Runner, Gateway, VibeBoard, EDA manager and nginx were not restarted. No database migration, OSS write, credential/role/model setting change or frontend build occurred.

Archive: `/opt/vibehard/releases/vibehard-20260927-rag-board-links-v1.tar.gz`, SHA256 `5420c17004b1165bf4eaf387672c1abb217c0758b1540faede167562a62c30dd`; worker SHA256 `82f100051bf74c8cd853f5a9309438b266c76e69a07db0f3c889a295360ceec9`. Original index SHA256 `cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9` remained unchanged. The release contains the worker, bundled read-only board retrieval audit, association map and source evidence. Source is from branch `codex/eda-rag-integration` with uncommitted task edits; `RELEASE.json` records the base Git commit and per-file hashes, not a published Git commit.

Before switching, production had zero queued/running design jobs. Under the same dedicated group, 384 MB and 50% CPU limits, the bundled audit queried 61 boards × two intents: 122 queries, 118 hits, 4 honest schematic gaps, 894 verifiable citations, P95 219.9 ms and RSS 91.4 MiB. The index directory is root:`vibehard-knowledge` 0750; SQLite and metadata are 0640, and `nobody` could not read SQLite. The production API returned owner 200, anonymous 401, cross-user detail/download 404 and an isolated cross-user list.

The first retained synthetic job `dcaf534a-1bca-4610-b9dc-f801d3260cc1` ran 92.7 seconds and failed at the 90-second full-design model deadline. A separate short saved-model request succeeded in 1.3 seconds. The second full-design job `99f43e71-90b5-42e9-9298-8bbdec425b50` completed in 57.2 seconds through the configured `deepseek-v4-pro`: 8 BOM rows, 2 server-recorded auto-indexed references including the exact board schematic. Each citation path was matched against the approved board alias and each SHA/page/part/excerpt against the private SQLite text; the downloaded Markdown contained both citations and the automatic-review label. The same job and permission assertions passed again over public HTTPS after the formal cutover, without another model call. Both synthetic jobs/projects are retained. One failed and one successful full task do **not** establish sustained model stability.

After cutover, formal worker PID 946291 was active with `NRestarts=0`, `MemoryMax=384M`, `CPUQuota=50%`; candidate was inactive. Platform/Runner/Gateway/VibeBoard/EDA manager PIDs remained 932015/758750/727637/807921/908160. Public `/vibehard/login` returned 200. The raw 8 GB originals remain in private OSS; the same 106,811,392-byte index remains on the host. Four board models still lack suitable indexed schematic text, and automatic screening is not engineering fact-checking.

Rollback only after checking that `design_jobs` has no `queued` or `running` row and no worker task is in flight; do not restore a database dump. Stop only `vibehard-design-worker.service`, install the exact saved unit from this release's `backup/` to `/etc/systemd/system/vibehard-design-worker.service` with mode 0644, run `systemctl daemon-reload`, and start only `vibehard-design-worker.service`. Confirm the old `ExecStart`, a stable PID, and the public login/API. The new release and both synthetic records remain for audit. Do not change the platform, Runner, Gateway or nginx as part of this rollback.

## 2026-09-26 board specification directory frontend release

Active platform: `/opt/vibehard/releases/20260926-board-spec-v2/standalone`; previous platform and unchanged design worker: `20260926-esp32-fts-v1`. Archive `/opt/vibehard/releases/vibehard-20260926-board-spec-v2.tar.gz`, SHA256 `b3cd6303cbe41d1a9816e23ae0639e2617fe06035f34bca19ec1be17fc61c855`. `RELEASE.json` holds 998 source-file hashes and compares all 976 source files from the active predecessor; exactly six existing runtime files changed and three read-only server data/mapping files were added. Demo, PCB, EDA, Agent, auth, database, dependencies and protected service code remained byte-identical. No migration, OSS write, RAG reindex or model setting change.

The UI now displays 61 boards with 351 official-board-page-supported feature labels and 762 SKU-associated resource references (568 directly indexed, 88 partly indexed, 106 raw-only). Five wrong-variant Touch schematics were removed from their incorrect UI associations only; the original OSS files and existing RAG index remain. This is documentation-based review, not physical board testing. The administrator/developer role check still reads the current database role. The candidate at 127.0.0.1:3211, active 3210 and public HTTPS passed both `verify-frontend-release.mjs` (PCB renderer plus five Demo media assets) and `verify-knowledge-library.mjs` (read-only role/data/privacy checks). At activation, no Agent turns or design jobs were active. The candidate unit is inactive, 3211 is closed, and the design worker/Runner/Gateway/VibeBoard/EDA manager/nginx PIDs and environment-file hashes stayed unchanged. The old platform unit is in `<release>/backup/vibehard.service` (root-only).

The first `20260926-board-spec-v1` candidate was built without `NEXT_PUBLIC_BASE_PATH=/vibehard`; its loopback preflight caught a 404 on `/vibehard/login`, and it was never activated. The failed candidate and archive are retained; v2 packaging asserts the compiled base path before upload.

Rollback, only after confirming no queued/running `agent_turns` or `design_jobs`: run the v2 deployment script with the existing environment files and `rollback`. It restores the exact saved platform unit and restarts only `vibehard.service`; the worker, index and database are not rolled back:

```bash
/opt/vibehard/runtime/node-v22.23.1 --env-file=/etc/vibehard/platform.env --env-file=/etc/vibehard/eda-platform.env /opt/vibehard/releases/20260926-board-spec-v2/scripts/deploy-board-spec-page.mjs rollback
```

## 2026-09-26 ESP32-S3 restricted FTS release

Platform and design worker now run from `/opt/vibehard/releases/20260926-esp32-fts-v1` (platform `standalone/`, worker `services/design-worker.cjs`). The merged EDA PR and existing board RAG are both included. The worker alone receives `VIBEHARD_OSS_INDEX_PATH=/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite` and supplementary group `vibehard-knowledge`; the index directory is 0750, files 0640, owned by root and that group. The worker remains `DynamicUser=true`, single-concurrency, `CPUQuota=50%`, with `MemoryMax=384M`. No direct public index endpoint or cloud OSS access key was added. Raw 8 GB originals stay in private OSS; only the checksum-verified 106,811,392-byte SQLite index is on the server. The compressed OSS artifact and processing manifest remain the recovery source. Automatic document screening is not human technical approval; result citations display that distinction.

Release archive SHA256: `159e68f4f6a7125b71d147ad1400e16834006ccd9aa90ff362acbfee0ab72b47`. Index SQLite SHA256: `cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9`. Full source hashes and worker hash are in `RELEASE.json`. Previous units are saved as `<release>/backup/vibehard.service` and `<release>/backup/vibehard-design-worker.service`. No migration; existing 95 published RV sources remain in PostgreSQL. The candidate used loopback 3211 and a temporary single worker replacing the old worker only after checking zero active design and Agent tasks. One real ESP32-S3 design completed with four source/page/part/hash citations, then the public API and Markdown were rechecked without another model call. Restricted 90-query cloud benchmark: warm P95 74 ms, RSS ~70 MiB at 50% CPU/384 MiB limit. Public protection and EDA/PCB/Demo regressions passed. Runner, Gateway, VibeBoard, EDA manager, nginx and config hashes were not changed; candidate units and port 3211 were reclaimed.

If rollback is required, first verify there are no queued/running `design_jobs` or Agent turns. Stop only `vibehard.service` and `vibehard-design-worker.service`, copy the two exact saved units from this release's `backup/` into `/etc/systemd/system/`, run `systemctl daemon-reload`, then start the design worker and platform. This restores the EDA grid platform and prior board-RAG worker without altering the database or deleting the private index. The saved synthetic task is retained. Restoring database contents is a separate destructive operation and is not part of code rollback. To withdraw the entire ESP32-S3 corpus quickly, restore just the saved worker unit after tasks are idle; per-document revocation UI is not implemented yet.

## 2026-09-26 EDA release

Current platform: `/opt/vibehard/releases/20260926-eda-grid-v1/standalone`; previous platform: `20260925-eda-isolated-v2`. The isolated KiCad manager stays in `/opt/vibehard/eda-manager/current`, with per-project data under `/var/lib/vibehard-eda`. The manager and nginx WebSocket route were deployed with the previous EDA release; this release fixes native symbol grid alignment in the platform export. No migration or model configuration changed. Public `/vibehard/eda` and `/vibehard/login` returned 200 after cutover; a production account's saved KiCad project remained accessible with ERC 0 and DRC 3 expected unrouted items. The temporary acceptance account and volumes were removed. Full evidence and rollback: [EDA cloud acceptance](eda-cloud-acceptance-2026-09-26.md).

## Current deployment

Historical snapshot as of 2026-09-25 22:02 +08:00 (superseded for the platform by the EDA release above):

- Active platform release: `/opt/vibehard/releases/20260925-board-rag-v3/standalone`.
- Active design worker: `vibehard-design-worker.service`, using `/opt/vibehard/runtime/node-v22.23.1` because `/usr/local/bin/node` resolves through root-only `/root/.hermes`. The active unit was corrected after the v3 platform cutover; the checked-in template is corrected, but the immutable v3 source snapshot still has the earlier worker template and must not be reused as-is to reinstall the unit.
- Active Gateway release: `/opt/vibehard/releases/20260918-cloud-runner`.
- Previous platform unit, Runner bundle/environment and DB dumps are retained inside `/opt/vibehard/releases/20260918-llm-settings/backup/` (root-only).
- Cloud Runner service bundle: `/opt/vibehard/releases/20260919-project-knowledge/services/runner.cjs`; working directory remains `/opt/vibehard/cloud-runner`. Previous versioned bundles remain available for rollback.
- Platform and Gateway run on `47.102.197.71`.
- `cloud-runner` is the default production node and stores workspaces in `/var/lib/vibehard-runner/workspaces`.
- `device-runner` runs on the Mac mini for USB, serial and flashing tasks; its workspace root is `/Users/hushaohong/vibehard/.runner-workspaces`.
- The server runs pinned Codex CLI 0.149.1 through the unprivileged `vibehard-runner` service and bubblewrap wrapper. Provider requests returned 429 during release verification but recovered on September 19: three real browser conversation turns, context retention and reload recovery passed. This does not establish sustained availability or revalidate compilation/flashing.

### Shared knowledge RAG and durable design worker, 2026-09-25 22:02

`20260925-board-rag-v3` was built from all 819 hash-verified files of the prior active model-discovery release plus a strict design/RAG overlay. Archive `/opt/vibehard/releases/vibehard-20260925-board-rag-v3.tar.gz` has SHA256 `280158926ce97bb331d22aba072ba6365c86ffad9c538ecfc43bc6a02a1e427d`. The complete 850-file source manifest is in `RELEASE.json`; PCB/Demo remain protected. The failed v2 candidate used the outdated source-snapshot Taishan verifier and restored the prior platform automatically; v3 packages the current release's corrected verifier scripts. No Runner/Gateway/VibeBoard/nginx or model/key changes were part of activation.

Before production migration, `pg_dump -Fc` and `pg_restore --list` verified the root-only dump at `<release>/backup/platform.dump`, SHA256 `f15f159d3b6fd51c9227b4f615bff10d385c41c5193874f81b8641a9e3f1c23a`. It was copied from the first candidate's pre-migration backup into v3; it is **not** a post-import backup. Additive `0005_design_jobs` and `0006_shared_knowledge` created empty tables while the previous platform remained active. Isolated candidate checks and public regression passed; the real worker later revealed an execution-path failure that the immediate `systemctl is-active` check had missed. Its 32 initial auto-restarts stopped after copying the trusted Node 22.23.1 binary into `/opt/vibehard/runtime/` (SHA256 `93956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068`) and changing only the worker unit's `ExecStart`. Current worker PID 899646 remained stable through the real task; future deployment checks must verify stable PID after several seconds, not just immediate active state.

The authorized direct import wrote 95 published chunks from 9 RV1106/RV1126B files, batch hash `7373380e3214781ed7967b29f27ad087de875290d7a782c1b861bc11998abb84`, with one audit entry marking `manualReview:false`. Raw originals were not uploaded. Public-site task `3780b4de-fe12-455d-ab15-74ee1f34e0dd` in project `aa0e51b7-3c8e-465a-a34c-e9b9b1489ad6` completed through DeepSeek; 5/5 saved references match currently published source/version/hash rows, and Markdown download includes them. The synthetic admin-owned project/task is retained for review. This is bounded keyword retrieval and one successful generation, not 8 GB OSS ingestion, vector search or sustained provider availability.

Rollback, only after both Agent turns and design jobs are idle:

```bash
/usr/local/bin/node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260925-board-rag-v3/scripts/deploy-board-rag.mjs rollback
```

Rollback restores the prior platform unit and disables the design worker; it deliberately retains the additive tables, imported knowledge and completed job. Database restore from the pre-migration dump is a separate, destructive operation and must not be inferred from platform rollback.

### Administrator model discovery, 2026-09-25 18:19

`20260925-llm-model-discovery-v2` overlays six runtime files and three test files on the complete, hash-verified `20260922-taishan-integration` source. It adds administrator-only provider `GET /models` discovery for both LLM settings, searchable selection, manual fallback, and automatic Profile refresh after an Agent model save. Discovery never saves a setting. Production model/Key/role rows and environment files were fingerprinted unchanged. No database migration, design worker/RAG release, Runner/Gateway/VibeBoard/nginx change, or complete Agent tool-task validation was included.

The isolated build passed 158 tests (3 existing DB-only skipped), TypeScript, targeted lint and Next production build. Candidate and activated services passed the protected PCB renderer/Demo/media, homepage, knowledge roles, admin, auth cookies, engineering workflow UI and Taishan iframe checks. The model-list verifier used the server-stored key without printing or returning it: both design and agent settings listed 2 model IDs via the public domain; anonymous/member access and stale-key-on-new-address were rejected. Public `verify-frontend-release.mjs` passed. No production browser visual click-through was run. The first candidate `20260925-llm-model-discovery` was never activated: it bundled an outdated source-snapshot Taishan verifier; v2 used the actual prior release's corrected scripts.

Only `vibehard.service` restarted (PID 894091); protected service PIDs, nginx PID and configuration hashes matched before/after. Candidate unit is inactive and 3211 closed. Versioned archive `/opt/vibehard/releases/vibehard-20260925-llm-model-discovery-v2.tar.gz` SHA256 `3596b27e9ba65cf247ff38f85054ce9e71bf078ae8216c86d454fe5e4662197b`; old platform unit is in `20260925-llm-model-discovery-v2/backup/vibehard.service`. To roll back when no Agent turns are active:

```bash
/usr/local/bin/node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260925-llm-model-discovery-v2/scripts/deploy-llm-model-discovery.mjs rollback
```

### Taishan/VibeBoard entry, 2026-09-22 21:45

`20260922-taishan-integration` overlays exactly four runtime files on the complete `20260922-homepage` source: the Taishan page, desktop sidebar, mobile app navigation and module-help registry. Authenticated users get `/vibehard/app/taishan`, which embeds the separately deployed `/Vibeboard/`. The page states that VibeBoard has its own login and that projects, knowledge and Agent context are not synchronized. Local design background jobs and migration `0005` remain excluded.

The isolated release passed 151 tests with three existing DB-only cases skipped, type checking, targeted lint and the production build. Candidate and active checks cover the protected PCB renderer/Demo assets, admin sections, auth cookies, design/workflow UI, 15 help modules, knowledge role isolation, homepage and Taishan HTML/RSC/navigation/iframe checks. Public verification passed over `https://ldcx.tech`; the VibeBoard endpoint returned 200 without iframe-denying response headers. Production browser automation timed out, so there is no visual click-through claim.

Only `vibehard.service` restarted (PID 834514). Runner/Gateway/VibeBoard/nginx PIDs 758750/727637/807921/501913 and config hashes remained unchanged. There was no database write/migration, account/role/model/key change or model call. Candidate and diagnostic units were reclaimed and port 3211 closed. Archive SHA256 `62ea10a404a784953e30ac55bdc2764adb5439daafe0d92f90b9a7c6f21b855e`. Rollback after checking no active tasks: `node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260922-taishan-integration/scripts/deploy-taishan-integration.mjs rollback`.

### Public homepage, 2026-09-22 09:38

`20260922-homepage` replaces only seven homepage runtime files on the complete `20260921-knowledge-library` source. Current feature descriptions and a prominent 20px/24px registration announcement preserve invitation-only registration and all authenticated features. The independent build excludes local design background jobs/0005 and Taishan iframe. 148 tests passed, 3 DB-only tests skipped; types/build/lint passed. Candidate and active full checks passed; public homepage/assets, knowledge role HTML/RSC checks, PCB renderer and Demo assets passed. Local desktop/320px visual checks passed; production browser connection timed out.

Platform PID 823384; Runner/Gateway/VibeBoard PIDs 758750/727637/807921 and nginx/config hashes unchanged. No database writes/migration, account changes or model calls. Preflight unit is not-found/inactive; port 3211 closed. Archive SHA256 `ded0c621873788ca3bf67e4f8e5c305c6bcfa46ec5d7b9528f908f41da1960fb`, complete source hashes in `RELEASE.json`. Rollback after checking no active tasks: `node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260922-homepage/scripts/deploy-homepage.mjs rollback`. Only restores old platform unit, not the database. No commit/push this turn.

### Knowledge catalog UI, 2026-09-21 22:28

`20260921-knowledge-library` adds `/vibehard/app/knowledge` with six categories and all 63 board/1076 resource-reference metadata records. Current persisted admin/developer roles are required; this is not original-file hosting, formal project knowledge publication or Agent retrieval. Only 12 runtime files overlay the complete production `20260920-module-help` source. All existing backend, authentication, schema, Runner/Gateway, dependencies and PCB/Demo remain unchanged. Local design background jobs/0005 migration and Taishan iframe are explicitly excluded.

Isolated release build: 145 tests passed, 3 existing database-only cases skipped; types and production build passed. Candidate and active protection checks passed. Public HTML/RSC authorization, forged-role/deleted-user denial, old-route redirect, public bundle isolation, PCB renderer, Demo and 18 assets passed. Existing production admin/member roles were exercised read-only; developer is covered by local tests, not a newly created production account. Production browser connection timed out; no production click-through claim.

Only platform restarted (PID 813457); Runner/Gateway/VibeBoard PIDs 758750/727637/807921 and nginx/config hashes remained unchanged. No database writes/migrations or model calls. Preview `vibehard-knowledge-ui-preflight.service` is not-found/inactive and port 3211 is closed. The first verification script needed the canonical RSC `?_rsc` marker; its candidate was never activated and remains under `20260921-knowledge-library-preflight-v1` for deliberate retention management.

Archive `/opt/vibehard/releases/vibehard-20260921-knowledge-library.tar.gz`; SHA256 `0a72e566bc02fbbd1e4c5f81d6d77af1ba9888ee82bfe82010af3af53a44d154`. Complete source and hashes are in the release's `RELEASE.json`. Rollback after checking no active tasks: `node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260921-knowledge-library/scripts/deploy-knowledge-library.mjs rollback`. This restores root-only `backup/vibehard.service` and restarts only the platform, with no database restoration. Local documentation updates do not mutate the active release; no commit/push this turn.

### Module usage help, 2026-09-20 13:51

`20260920-module-help` adds title-adjacent question-mark dialogs for 15 guide categories across 17 page entry points. Only `vibehard.service` restarts. Backend/API/auth/schema/Runner/Gateway/dependency/Next/proxy source is byte-identical to `20260920-knowledge-review`; this release has no migration, model call, fixture/user write or nginx reload. A loopback-only candidate with existing production configuration is exercised strictly through read-only page/API checks (logout checks only Cookie response headers). No temporary database is created.

118 regular tests passed, including 17 help-dialog component cases; 3 database-only tests skipped because no DB code changed. Types, targeted lint and standalone production build passed. Candidate, active and public checks cover 15 help page bindings/bundles, PCB detailed renderer, 18 shared assets/five GIFs, authentication Cookie, administrator/knowledge review and design/workflow UI. Browser automation connection timed out; actual browser click-through/mobile visual verification was not completed. No provider or hardware availability claim is added.

Backup of the prior platform unit: `/opt/vibehard/releases/20260920-module-help/backup/vibehard.service`. Rollback after checking no active tasks: `node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260920-module-help/scripts/deploy-module-help.mjs rollback`. No database or proxy restoration is involved. The Runner/Gateway/VibeBoard/nginx PIDs and platform/Runner/model/nginx configuration hashes are checked unchanged. Preview `vibehard-help-preflight.service` is stopped and port 3211 reclaimed.

Archive `/opt/vibehard/releases/vibehard-20260920-module-help.tar.gz`; SHA-256 `93c8cd9298ddd70b5e5d5a86f2112b893dd24e6a7fac504064751fa62e2f140c`. Complete source snapshot based on `54fa2ca`, pending commit/push, includes `RELEASE.json` and protected PCB/Demo source overlay. No active release source is edited after activation.

Timing caveat: protected PID checks passed during activation. A later public verification observed a different VibeBoard PID (776211 versus the initial 775438), still active. This deployment script never stopped/started/restarted that external service or edited its files; do not interpret the activation check as proof that its PID remained unchanged for the entire session.

### Knowledge review roles and schematic requests, 2026-09-20

Platform-only `20260920-knowledge-review`: ordinary owners submit/edit candidates; only persisted `admin`/`developer` roles publish/reject/disable. Reviewers can inspect knowledge across projects but cannot edit others' drafts or access their chats/workspaces. Developer has no administrator model/password privileges. New review queue `/vibehard/app/knowledge-review`; schematic result submission links to the candidate's status page. No account/role/password/model configuration changes and no DB migration.

101 regular and 3 isolated PostgreSQL tests passed. Candidate HTTP checks exercise role separation, forged/stale Cookie roles, developer restrictions, rejection audit, edit/resubmit and idempotent applications. Candidate/production/public PCB, renderer, 15 assets, five GIFs, authentication, administrator sections, design/workflow bundles passed. Only `vibehard.service` restarted; Runner/Gateway/VibeBoard PIDs remained unchanged. Current model request results/limitations are in `current-status.md`.

Nginx previously inherited its default upload limit. Only `location /vibehard/` gained `client_max_body_size 6m;`, preserving the application's 5 MiB bound. The script writes in place to preserve the single-file bind mount inode, validates `nginx -t` then gracefully reloads; container/master PID unchanged. Do not replace that mounted file's inode. Other routes/configuration unchanged.

Backup: `<release>/backup/platform.dump` (custom pg_dump, archive directory verified), prior `vibehard.service` and nginx.conf in root-only backup directory. No full restore drill. The pre-deployment inventory found zero active versions reviewed by non-admin/non-developer users; no legacy knowledge was deleted or rewritten. Temporary database/role `vibehard_knowledge_test_20260919`, credentials and tunnel removed; preflight unit inactive, port 3211 closed.

Archive `/opt/vibehard/releases/vibehard-20260920-knowledge-review.tar.gz`, SHA-256 `47f0fc1524a561014605790155bbed5f6b4ca12322c30b65fe434a68e2a92f04`. Complete source snapshot based on `54fa2ca`, pending commit/push; `RELEASE.json` records protected source overlays. Later verification-script/doc updates are local and do not mutate the active release.

Rollback (check idle tasks and confirm nginx has not received unrelated changes since backup first): `node --env-file=/etc/vibehard/platform.env /opt/vibehard/releases/20260920-knowledge-review/scripts/deploy-knowledge-review.mjs rollback`. This restores the preceding platform unit and proxy configuration, not the database or Runner. Beware: rolling back re-enables the preceding owner-review policy. If nginx has newer unrelated edits, do not restore the whole backup; reconcile only VibeHard's upload limit separately.

### Project knowledge, 2026-09-19

`20260919-project-knowledge` adds project-owner review, versioned knowledge and immutable per-task snapshots. Migration `0004_project_knowledge` only adds a table. Production was backed up to `<release>/backup/platform.dump` with `pg_dump --format=custom`; its archive directory was checked with `pg_restore --list`. This is not a full restore drill.

85 normal tests and all 3 isolated PostgreSQL tests passed. Candidate HTTP checks used only `vibehard_knowledge_test_20260919`, including a test-only administrator, another user, lifecycle and stale-revision rejection. Candidate and activated versions passed PCB/renderer/15 assets/5 GIFs, administrator sections/API, Cookie and design/workflow checks. Platform and cloud Runner switched only with zero active tasks; fresh `project-knowledge-v1` heartbeat verified. Gateway/VibeBoard PIDs unchanged; no account, secret or device Runner update. Runtime task results are recorded in `current-status.md`.

Archive: `/opt/vibehard/releases/vibehard-20260919-project-knowledge-v2.tar.gz`; SHA-256 `51253c8e5a308868dde81c21b5db9d936fa14b63c18c163031c2d5cdbd55a449`. Complete uncommitted source snapshot based on `54fa2ca` is included, with all protected frontend overlays. Subsequent documentation/evidence updates live in the repository.

Packaging: Node `cpSync` must use `verbatimSymlinks: true`; otherwise relative pnpm links become Mac absolute paths. The first candidate failed readiness because of this and was never activated. Use `--no-xattrs` and `COPYFILE_DISABLE=1` when producing Linux release archives on macOS. Keep release root traversable by the unprivileged Runner. Failed candidate is retained as `20260919-project-knowledge-failed-packaging` pending deliberate retention cleanup.

Rollback after checking active tasks:

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260919-project-knowledge/scripts/deploy-project-knowledge.mjs rollback
```

This restores the saved platform/Runner units to engineering-workflow. Keep the additive knowledge table and new user records; do not restore the old database over current data. Preflight must load `/opt/vibehard/test-state/20260919-project-knowledge/test.env` for both the driver and transient service, never production credentials. Recreate a fresh isolated test environment before rerunning preflight after cleanup.

### Engineering workflow, 2026-09-19

`20260919-engineering-workflow` deploys the versioned cloud-project-workflow rule pack and workbench evidence reports. The cloud Runner unit enables `RUNNER_ENGINEERING_WORKFLOW=true` and points directly to the versioned bundle. No account, database, provider, credential or device Runner changes. Gateway and VibeBoard PIDs stayed unchanged. Both preflight and active releases passed protected PCB/renderer/assets, all Demo GIFs, administrator API/sections, auth-cookie and design/workflow bundle checks. Public login/Demo return 200; preflight unit is not-found/inactive and port 3211 is closed.

Archive SHA-256: `5bbdf70ac2e9340d20da4f587c213bcd6f251198534aada3cb6ffb6d953eb224`.

Packaging note: extracting the mktemp staging root preserved mode 0700. The new release root was changed to 0755 so the unprivileged Runner can traverse it; backup and verification directories remain root-only. Verify `runuser -u vibehard-runner -- test -r <release>/services/runner.cjs` before activation in future releases. On this release the first Runner startup was denied until that permission correction; systemd then recovered and a new heartbeat was verified before task testing.

Rollback after checking active tasks:

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260919-engineering-workflow/scripts/deploy-engineering-workflow.mjs rollback
```

This restores both saved units from the root-only `backup/` directory, returning the platform to `20260919-design-knowledge-pricing` and Runner to its previous bundle. Do not restore database dumps or replace Runner credentials. Real task verification and remaining boundaries are tracked in `docs/current-status.md`.

### Design reference prices and built-in rules, 2026-09-19

`20260919-design-knowledge-pricing` supplies versioned built-in engineering rules to design requests and asks for CNY small-batch reference unit prices. The rules are not the team's TaishanPi knowledge base, a retrieval system or live supplier data. Prices remain explicitly labeled AI estimates; unsupported estimates may include a reason instead of fabricated numbers.

65 tests passed, 2 database-only tests skipped; TypeScript, lint and build passed. A real candidate request produced 13 BOM rows with prices and a knowledge version. Candidate and active releases passed all frontend/PCB/Demo, admin, cookie and design-bundle checks. Only the platform was restarted, with no database or credential change.

Public Chrome verified the new copy but both full and shortened design requests hit the upstream 90-second timeout. Browser-rendered price results remain unverified; the successful candidate request does not establish provider reliability. The transient preflight unit is reclaimed and port 3211 is closed.

Archive SHA-256: `92736a70cffa287c01a14d298c1d49a394386248c39c508148e29f9dd89c054c`.

Rollback to `20260919-auth-cookies` after checking active tasks:

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260919-design-knowledge-pricing/scripts/deploy-design-knowledge.mjs rollback
```

### Authentication cookie fix, 2026-09-19

`20260919-auth-cookies` fixes legacy root cookies shadowing new `/vibehard` sessions. Login, registration and logout append separate path-specific Set-Cookie headers. Database roles, passwords and secrets are unchanged. Only the platform service was restarted; Gateway/VibeBoard PIDs were preserved. The preflight listener on 3211 is closed.

63 tests passed and 2 database-only tests were skipped; type checking, lint and the production build passed. The regression exercises actual auth routes and an RFC-aware cookie jar: three failures before the fix, all six cases passing afterward. Both candidate and active releases passed the protected PCB/Demo checks, admin section/API checks and actual HTTP cookie checks; public HTTPS also preserved both deletion headers. Chrome logout cleared the previous member session; administrator login awaits the user's original password.

Archive: `/opt/vibehard/releases/vibehard-20260919-auth-cookies.tar.gz`, SHA-256 `28db450ecc76f5171a75d3caebaf8e76e9552f76fd989d4424957c1841d3e4db`.

Rollback to the saved `20260919-admin-sections` unit (inspect active tasks first):

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260919-auth-cookies/scripts/deploy-auth-cookies.mjs rollback
```

Rollback restores the cookie bug; do not restore a database dump for this application-only change.

### Managed LLM settings release, 2026-09-18/19

`20260918-llm-settings` deploys real hardware-design requests, separate encrypted design/Agent settings and per-task cloud provider configuration. It preserves the complete PCB/Demo source and assets. Only `vibehard.service` and `vibehard-runner.service` were restarted; Gateway, VibeBoard and nginx were preserved, and the existing Runner credential was not rotated.

Migration `0003_llm_settings` is additive. Existing provider credentials were imported without printing them, with system audit actor null. `RUNNER_PLATFORM_URL=http://127.0.0.1:3210/vibehard` was added to the Runner environment. Configuration changes now apply to new tasks without a service restart. Read [LLM settings](llm-settings.md) before rotating encryption secrets or changing providers.

Preflight database: `vibehard_llm_preflight_20260918`; root-only environment: `<release>/preflight.env`. During initial preparation, an inherited `DATABASE_URL` overrode Node's `--env-file`, so the additive migration first reached production instead of the clone. A pre-change dump existed; existing tables/data were not overwritten. The deployment script now explicitly supplies the clone URL to child processes, and both schemas were verified. Do not repeat preparation against an existing clone or rely on env-file precedence to isolate migrations.

54 tests passed and 2 database-only tests were skipped. Production build, type checking and changed-file lint passed. `verify-frontend-release.mjs` checked the protected PCB renderer and all five Demo GIFs before and after activation. Browser admin UI verification uses only the isolated clone; production role elevation requires explicit owner approval. Keep the production browser verification project `云端对话验收-20260919` as user-visible evidence.

Rollback (inspect active tasks first):

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260918-llm-settings/scripts/deploy-llm-settings.mjs rollback
```

This restores the saved platform unit, Runner environment and bundle; the additive settings table remains. Do not restore an old DB dump over new user projects merely to roll back application code.

### Admin sections release, 2026-09-19

`20260919-admin-sections` splits the administrator console into Overview, Model Settings, Runner Nodes, User Management and Audit Log sections. Only one section is visible at a time; hidden panels remain mounted so unsaved model form input survives navigation. Authentication, password-reset behavior, APIs, database schema, Gateway and Runner are unchanged.

The release was built from the complete current source, preserving Demo and PCB overlays. 57 tests passed and 2 database-only tests were skipped; TypeScript, targeted ESLint and the production build passed. Both the localhost preflight on 3211 and active service on 3210 passed `verify-frontend-release.mjs` and `verify-admin-sections.mjs`. Public login and Demo returned HTTP 200. Gateway and VibeBoard PIDs did not change; nginx was not restarted. The transient preflight unit was reclaimed and port 3211 is closed.

Release archive: `/opt/vibehard/releases/vibehard-20260919-admin-sections.tar.gz`, SHA-256 `dd873a1357cd91d0f5dab553d4bd905354d863d59ebb5ac0b18cbe42155fb0d9`.

Rollback:

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260919-admin-sections/scripts/deploy-admin-sections.mjs rollback
```

### PCB and showcase release, 2026-09-05

The server database was checked read-only and still lacks migration `0002` (`runner_nodes.instance_id` is absent). To avoid introducing the pending backend/Runner changes in a visual update, this release was built from foundation commit `96c4991` with the current PCB preview, demo page/media, BOM empty-state fix, login/register copy and homepage demo links overlaid in a separate build directory. It does not include the newer admin overview or Runner hardening commits. The main working tree was not reverted.

Build staging directory: `/tmp/vibehard-release-20260905-jGzLdU`. The published source snapshot and release manifest are retained alongside the server release. `release-v2.tar.gz` SHA-256: `4e8e5084fbc61ff54e39c2f8d4c14b00e8038209d30131b8dced04e2ae1f0d7e`.

The package preserves relative pnpm symlinks, includes `public`, `.next/static` and `@swc/helpers/esm`, and excludes macOS sharp native packages. It was preflighted on loopback port `3211`, then verified on port `3210` and `https://ldcx.tech`: login page, protected PCB page rendering, unauthenticated API rejection, detailed PCB client bundle, demo page and all five MP4 resources. The temporary preview service was stopped. VibeBoard and Gateway process IDs stayed unchanged. No database migration or nginx change was performed.

To roll back, restore the saved unit to `/etc/systemd/system/vibehard.service`, run `systemctl daemon-reload`, then restart only `vibehard.service`. The existing unit uses an explicit release path; there is no `/opt/vibehard/current` symlink.

### Demo GIF release, 2026-09-09

The `/vibehard/demo` page was refreshed to use native animated GIF media for all five workflow recordings. This release was built from the same deployment baseline `96c4991` with only `app/demo`, `public/demo` and `next.config.ts` overlaid, so the production database and Runner/Gateway services were not changed. It was preflighted on port `3211` and then activated on port `3210`; `vibeboard.service` and Gateway PIDs stayed unchanged.

### Demo copy layout release, 2026-09-10

The five module descriptions on `/vibehard/demo` were moved beneath their section titles and reduced in size. The lower module-introduction blocks were also restyled with clearer label, copy and metadata hierarchy. This release was built from baseline `96c4991` with only `app/demo`, `public/demo` and `next.config.ts` overlaid, so it remains compatible with the existing production database.

The standalone package was preflighted locally and on server loopback port `3211`, then activated on port `3210`. The public page and all five GIF resources returned HTTP 200, the new copy was present in the rendered HTML, and the root VibeBoard route remained available. `vibeboard.service`, Gateway and nginx container PIDs stayed unchanged. No database migration, nginx change or non-VibeHard service restart was performed. The temporary preview process and uploaded archive were removed after verification. Package SHA-256: `af03d41661a59e1c1779312e9eafcfa24a18a7daf3538991e565d9e7e22f90da`.

### PCB preview restoration, 2026-09-16

The September 9 and 10 Demo-only builds omitted the PCB overlay previously published on September 5, reverting `/vibehard/app/pcb` to the old preview. This release restores the detailed TH-NODE v0.2 example with assembly/routing views, copper and silkscreen visibility, zoom/pan and PNG export. This remains an example preview; it does not add EDA generation or production Gerber export.

The build uses baseline `96c4991` with the full current overlay: `app/demo`, `public/demo`, `next.config.ts`, `app/app/pcb` and `components/pcb`. Preserve this full list in subsequent visual releases. The source snapshot, `RELEASE.json`, verification script, activation script and previous systemd unit are retained in `/opt/vibehard/releases/20260916-pcb-restore/`. No database migration was required.

Six existing PCB/Demo tests and the production build passed. `scripts/verify-frontend-release.mjs` passed against the local standalone, server preview, active service and public domain. It verifies a short-lived fictional user's PCB page render, the detailed drawing code in the assets actually referenced by that page, the unauthenticated redirect/API guard, and all five GIF hashes. The Demo's rendered body markup also matched production before and after the switch. VibeBoard, Gateway and nginx process IDs remained unchanged. The temporary preview service was stopped after verification.

Standalone archive SHA-256: `be09c5520e5e347b839cc948ea554a4adcc82f8b533d3ea43ce4a40ebd459bdd`. Source archive SHA-256: `fd5d98212b89c72bafea4c17dc5c55d1db6b4d3be2285ee40ea195fafb365cb8`.

On the server, verify the active release without exposing credentials:

```bash
node --env-file=/etc/vibehard/platform.env \
  /opt/vibehard/releases/20260916-pcb-restore/verify-frontend-release.mjs \
  https://ldcx.tech /opt/vibehard/releases/20260916-pcb-restore/standalone
```

### Cloud Runner release, 2026-09-18

Release `/opt/vibehard/releases/20260918-cloud-runner` deploys the complete platform branch, Gateway protocol hardening, cloud Runner, project ZIP downloads and the existing PCB/Demo frontend. Database backup `/opt/vibehard/backups/20260918-before-cloud/platform.dump` was created immediately before applying migration `0002_lucky_daimon_hellstrom`.

The cloud Runner uses the unprivileged `vibehard-runner` account, bubblewrap filesystem/process isolation, a 2 GB memory limit, 150% CPU quota and a 15-minute per-Codex-process timeout. Provider credentials are root-only and are allowlisted into Codex without exposing platform or database secrets.

Preflight and production verification covered real `tokenadvent / gpt-5.6-sol` responses, approved file changes, GCC compilation, binary execution and authenticated ZIP downloads. The production verification project was deleted from the business database after success; its workspace is retained root-only under the release evidence directory. The public PCB/Demo regression check passed. VibeBoard and nginx were not restarted.

The Mac mini `device-runner` is installed as LaunchAgent `tech.ldcx.vibehard-device-runner`. Its local configuration lives under `/Users/hushaohong/Library/Application Support/VibeHardRunner` with mode 600 secrets. It is online but has not yet been validated against the physical product.

## Route ownership

- `/` and `/api`: existing VibeBoard/WebHUD. VibeHard deployments must not modify these routes or `vibeboard.service`.
- `/vibehard/`: VibeHard Next.js standalone on host port `3210`.
- `/vibehard/runner`: authenticated Runner WebSocket Gateway on host Docker bridge address `172.17.0.1:8787`.
- `/zutils/`: existing VibeHard static compatibility route.

The nginx container bind-mounts a single configuration file read-only. A host-side edit that replaces the file inode is not visible after `nginx -s reload`; restart the nginx container once to remount it, after `nginx -t` succeeds.

### SSH access from the development Mac

The deploy key `/Users/hushaohong/.ssh/ldcx_vibeboard_deploy` is passphrase-protected. The passphrase is stored in the developer Mac's macOS Keychain and SSH loads it automatically when `-o UseKeychain=yes` is passed to `ssh`/`scp`. Do not ask the user for the passphrase; if reloading is needed, run `ssh-add --apple-use-keychain /Users/hushaohong/.ssh/ldcx_vibeboard_deploy`.

## Runtime layout

```text
/opt/vibehard/releases/<release>/standalone  Next.js standalone
/opt/vibehard/releases/<release>/services    Gateway, Runner and migration bundles
/opt/vibehard/releases/<release>/drizzle     SQL migrations
/etc/vibehard/platform.env                   root-owned secrets, mode 600
```

PostgreSQL, active workspaces, Codex sessions and service code stay on block storage. OSS is appropriate for training datasets, uploads, firmware, reports, archived artifacts and backups. Do not mount OSS as the live database or Agent workspace.

## Build

```bash
NEXT_PUBLIC_BASE_PATH=/vibehard pnpm build
pnpm build:services
```

Copy `.next/standalone`, `.next/static`, `public`, `dist/services` and `drizzle` into a versioned release. Run `services/migrate.cjs` with `DATABASE_URL` before switching the systemd working directory.

The current source requires migration `0002`, which adds Runner instance identity, structured approval details, the model provider/model uniqueness constraint and the Runner command foreign key. Back up PostgreSQL, run the migration bundle once, and only then switch the `current` symlink.

On Linux, a production Runner must set `RUNNER_CODEX_WRAPPER` to a strong workspace isolation command. `RUNNER_ALLOW_WEAK_ISOLATION=true` is a development-only escape hatch and must not be present in the production environment.

## Safety and rollback

1. Keep the previous release and systemd unit.
2. Verify the new Gateway locally before changing nginx.
3. Run `nginx -t` before reload or restart.
4. Confirm the root WebHUD response and `vibeboard.service` PID are unchanged.
5. To roll back, restore the previous `vibehard.service`, run `systemctl daemon-reload`, and restart only `vibehard.service`. Restore the nginx backup only if the Gateway route itself caused the failure.

Provider API keys and Runner shared secrets must never be committed. A Runner on a developer machine may connect outbound to production, but it is available only while that machine is online. A permanent server Runner requires a separately installed and authenticated Codex CLI.
