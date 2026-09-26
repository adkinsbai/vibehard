# KiCad in-browser desktop implementation

**Goal:** Replace the default EDA canvas with a real, editable KiCad session rendered by noVNC. User approved this architecture on 2026-09-25.

**Architecture:** Existing Next.js authentication/project ownership authorizes a separate Linux desktop broker. The browser connects through a same-origin WebSocket rewrite using a short-lived, single-use ticket. The broker runs KiCad on a private virtual X display, never the host user's desktop. Native KiCad files are the source of truth after migration; do not round-trip them through the restricted JSON editor.

**Scope:** A working local, single-owner WSL runtime first. The local runtime must bind loopback and refuse a second owner; it is not a production multi-tenant sandbox. Do not change production servers, existing authentication or Runner behavior. Expose service unavailability honestly. Keep old editor at `/eda/legacy` and preserve its browser draft.

## Tasks

- [x] Add regression tests for authenticated project access, rejected cross-origin writes, ticket expiry/replay/project scoping, bounded native file import and no overwrites on reconnect.
- [x] Implement `services/eda-desktop/server.py`: persistent project files; Xvnc/Openbox/KiCad lifecycle; WebSocket bridge; native archive/check operations; fixed executable allowlist and subprocess arguments; local-only single-owner lease; clean shutdown.
- [x] Implement `lib/server/eda-desktop.ts` and `app/api/eda/desktop/[id]/route.ts`, using existing `requestUser`/`ownedProject`. Send only broker tickets to the client, never the broker credential.
- [x] Add `components/eda/desktop-workbench.tsx`, noVNC viewport, reconnect, project selection/creation, editor switching, imports, downloads, and explicit saved-file checks. Main `/eda` uses this; retain `/eda/legacy`.
- [x] Add local start/setup instructions and scripts. Install Linux dependencies in WSL, run service, configure only ignored local environment files.
- [x] Test actual browser RFB connection, mouse/keyboard editing, Ctrl+S, native file download, reconnect and check execution. Run focused regressions, TypeScript/lint/build. Record verified scope and remaining production/Agent work in `docs/eda-desktop.md`, `.ai/TASK_LOG.md`, `.ai/PROJECT_STATUS.md`.

## Acceptance

Empty projects open as real KiCad documents. Browser actions change native files and survive reconnect/reopen. Existing projects are never overwritten by repeated start requests. A ticket cannot connect to another project or be reused. Export/check reads native saved files, including edits outside the previous seven-part catalog. Unsaved in-application changes are not falsely reported as saved. Missing runtime returns a clear error, not a simulated editor.
