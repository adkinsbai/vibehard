# ldcx.tech deployment

## Current deployment

As of 2026-09-20:

- Active platform release: `/opt/vibehard/releases/20260920-module-help/standalone`.
- Active Gateway release: `/opt/vibehard/releases/20260918-cloud-runner`.
- Previous platform unit, Runner bundle/environment and DB dumps are retained inside `/opt/vibehard/releases/20260918-llm-settings/backup/` (root-only).
- Cloud Runner service bundle: `/opt/vibehard/releases/20260919-project-knowledge/services/runner.cjs`; working directory remains `/opt/vibehard/cloud-runner`. Previous versioned bundles remain available for rollback.
- Platform and Gateway run on `47.102.197.71`.
- `cloud-runner` is the default production node and stores workspaces in `/var/lib/vibehard-runner/workspaces`.
- `device-runner` runs on the Mac mini for USB, serial and flashing tasks; its workspace root is `/Users/hushaohong/vibehard/.runner-workspaces`.
- The server runs pinned Codex CLI 0.149.1 through the unprivileged `vibehard-runner` service and bubblewrap wrapper. Provider requests returned 429 during release verification but recovered on September 19: three real browser conversation turns, context retention and reload recovery passed. This does not establish sustained availability or revalidate compilation/flashing.

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
