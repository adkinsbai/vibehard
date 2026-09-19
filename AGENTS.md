<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment notes (production)

- Read `docs/current-status.md` for the latest verified runtime state and pending work; `docs/README.md` indexes the project documentation. Do not infer Runner availability from a stored `online` flag without checking heartbeat freshness and the live connection.
- Before team work, read `.ai/TEAM_RULES.md` and `.ai/PROJECT_STATUS.md`. Read `docs/team-cloud-delivery.md` only for production releases or project-knowledge imports. Teammates and their agents deliver normal changes through Git review; they must not upload directly into an active release, Runner state directory, or arbitrary server path.
- Deployment host: `root@47.102.197.71`; VibeHard base path: `/vibehard`.
- SSH key: `/Users/hushaohong/.ssh/ldcx_vibeboard_deploy` is passphrase-protected.
- On this development Mac the passphrase is stored in the macOS Keychain. Use `-o UseKeychain=yes` on `ssh`/`scp` so it unlocks automatically.
- Do not ask the user for the passphrase. If a prompt still appears, run `ssh-add --apple-use-keychain /Users/hushaohong/.ssh/ldcx_vibeboard_deploy`.
- Do not restart `vibeboard.service`, the nginx container, or the Gateway unless the task explicitly requires it.
- Frontend releases must preserve the complete published source overlay listed in the active release's `RELEASE.json` and `docs/deployment-ldcx.md`. When building from `96c4991`, include both the current Demo (`app/demo`, `public/demo`, `next.config.ts`) and PCB preview (`app/app/pcb`, `components/pcb`); a Demo-only overlay previously reverted the PCB page.
- Before and after activation, run `scripts/verify-frontend-release.mjs` against the actual release. It checks the protected PCB page and its referenced renderer bundle as well as Demo assets; checking only `/demo` is insufficient.
- Active platform release: `/opt/vibehard/releases/20260919-engineering-workflow`; cloud Runner bundle: `/opt/vibehard/releases/20260919-engineering-workflow/services/runner.cjs`; active Gateway release: `/opt/vibehard/releases/20260918-cloud-runner`. Read `docs/current-status.md` for live model evidence; do not infer availability from a stored Runner status. Do not replace or rotate the `cloud-runner` credential unless intentionally re-registering it and immediately verifying a fresh heartbeat.
- The Mac LaunchAgent `tech.ldcx.vibehard-device-runner` is the USB/serial/flashing node. Its secrets are under `/Users/hushaohong/Library/Application Support/VibeHardRunner` and must not be copied into the repository.
