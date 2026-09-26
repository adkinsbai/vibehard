# Web EDA workbench — implementation and verification

**2026-09-25:** The main `/eda` route now runs the real KiCad/noVNC desktop described in [eda-desktop.md](eda-desktop.md). The JSON canvas described below is retained at `/eda/legacy`; its Agent and fabrication APIs do not operate on native desktop files.

The current acceptance result, including three model-blocked Agent tasks and native ERC/DRC evidence, is in [eda-acceptance-2026-09-25.md](eda-acceptance-2026-09-25.md).

Status: functional engineering workbench with explicitly bounded import/library support. The full long-term objective is **not complete**. Work is on `codex/web-eda-workbench`; production has not been changed.

## Run

`pnpm install --frozen-lockfile`, then `pnpm dev -- --port 3212` (or `pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3212`). Open `/eda`. `/app/eda` redirects to the full-screen workbench after platform authentication.

New documents are empty. No example circuit or generic MCU/sensor is offered in the palette. The old generic definitions remain only for compatibility and regression fixtures. The engineering ZIP rejects those legacy placeholder parts.

The editor currently provides seven official KiCad symbol/footprint pairs: resistor 0603, capacitor 0603, LED 0603, 2-pin and 4-pin 2.54-mm headers, ESP32-WROOM-32, and TMP102xxDRL/SOT-563. See `lib/eda/catalog/README.md` for provenance, extraction command and license. The current catalog was rebuilt from the KiCad 9.0.8 library used by the noVNC desktop after KiCad 10 forms failed to load there. This does not substitute for selecting a manufacturer part or validating the circuit electrically.

## Working paths

- Add/select/move/rotate/delete components; edit references/values/positions and lock placement.
- Connect/disconnect schematic pins. Same-name labels represent shared nets; there are no misleading cosmetic wires connecting different nets. Native stacked pins are kept electrically equivalent; NC pins cannot be connected.
- View PCB, place footprints, draw top/bottom copper between actual pad centers or canvas points, select/delete tracks, change board size and layer visibility. Moving a footprint or changing net membership invalidates affected copper.
- Atomic command batches, stale proposal rejection, duplicate-batch detection, monotonic undo/redo, browser draft restore and corruption protection.
- JSON backup/import. Native KiCad schematic/PCB export, BOM and net CSV, internal check report.
- Authenticated project version save/load with ownership checks, filesystem snapshots and optimistic concurrency. `EDA_DATA_ROOT` must point to persistent storage in deployment. Accounts/projects still use the platform's existing database; development memory mode is not persistent account/project storage.
- Authenticated Agent proposal endpoint reuses the platform's `design` model configuration. It sends document/library context, parses structured commands and validates trial application before returning a proposal. User edits and Agent edits share the same command engine. User explicitly applies proposals.
- Real KiCad ERC/DRC and real Gerber/Excellon production-file generation. Engineering ZIP contains source files, BOM, reports, revision metadata and SHA-256 manifest. Exporting a ZIP does not mark a design manufacturing-approved.

## Import boundaries

Schematic import uses native KiCad CLI netlist extraction, so wires, junctions and labels are resolved by KiCad. It currently requires a single page and supported library symbols, with matching pin definitions; mirrored/multi-unit symbols, independent drawing text/images, hierarchical sheets and unsupported parts are rejected. It reconstructs the editable graph using catalog symbols and net labels, not the original wire artwork. Initial PCB positions are assigned for subsequent editing.

PCB import supports rectangular two-layer boards using supported catalog footprints and straight segments. It checks pad geometry and can merge PCB placement/tracks into the current schematic only when component and net membership match. Root-level vias, zones, arcs and annotations are rejected. Arbitrary native file round-trip is not claimed. JSON remains the complete workbench backup format.

## Configuration and limits

- `KICAD_CLI_PATH`: trusted administrator-configured executable path, or `kicad-cli` on PATH. The original browser-editor validation used Windows KiCad 10.0.6; the current native desktop and catalog are checked against KiCad 9.0.8. Revalidate both versions after any catalog rebuild.
- `EDA_DATA_ROOT`: persistent, application-owned directory. Default `.eda-data` is ignored by Git. Do not share it with untrusted filesystem writers. Writes use a directory lock plus immutable snapshots and atomic replacement. A crashed process can leave `.write-lock`; an operator must verify no writer is active before removing that specific empty lock directory. Automatic crash recovery and multi-host storage are pending.
- Native subprocesses use fixed arguments, no shell, temporary directories, output limits and timeouts. API endpoints require existing platform authentication and have per-user rate limits. Production process-level resource isolation and global job concurrency still need deployment review.
- This checkout has no configured design model. Live LLM generation has **not been tested**. The UI reports unavailable; no canned AI response is used. Configure the existing platform model through its administrator flow rather than placing keys in source or chat.

## Evidence — 2026-09-24

- EDA focused tests with actual native CLI enabled: **48 passed** across 10 files.
- Full repository suite with native tests enabled: **111 passed, 2 failed, 2 skipped**. The two failures are the pre-existing Windows symlink permission (`EPERM`) fixtures in `__tests__/project-download.test.ts`; the two skips require a separate PostgreSQL test database. This is not an all-green repository claim.
- `pnpm build`: passed, including TypeScript/static generation. Targeted ESLint: passed.
- Native schematic regression: catalog and legacy pins/net membership checked under 0/90/180/270-degree rotations. Native PCB loading checked for all seven official footprints and bottom-side geometry tests.
- Native engineering fixture (test-only, not shown as a starter): ERC exit 0, DRC exit 0; Gerber/drill package contains 19 entries. This is CAD verification, not measured hardware verification.
- Live local HTTP integration (`pnpm exec tsx scripts/verify-eda-local.ts`): authentication boundary, project save/reload, stale-write 409, native schematic import, real ERC/DRC reports, and ZIP generation passed. Model capability false and missing-config response 503 confirmed. No actual model call made.
- Browser at 1440×900: add official resistor/LED/ESP32, edit value to 470R, connect pins, route exact PCB pad coordinates, undo/redo and reload preserved 3 components and 1 trace. 390×844 layout inspected; panels remain scrollable. Full mobile editing coverage is not claimed.
- Independent final review was interrupted by the account usage limit. Root integration review and the checks above were completed; a fresh peer review is still required before merge.

## Remaining work for the long-term objective

1. Configure and verify actual model calls: generation from a blank design, iterative changes, cancellation/timeouts, and repair after ERC/DRC findings.
2. Expand real library selection, manufacturer part/pin/footprint matching, arbitrary symbols and native import coverage; remove remaining single-page/rectangle restrictions.
3. Add general schematic wire/junction routing and annotation editing, multi-sheet designs and deliberate net naming UI.
4. Add vias, copper zones, design rules, board cutouts, richer interactive routing, real autorouter integration and 3D view.
5. Add EasyEDA Standard/Pro adapters and PDF reconstruction with explicit review of uncertain connectivity. None of these are implemented yet.
6. Add persistent revision browsing/recovery, global native-job limits, crash-safe locking/recovery, database-backed deployment validation and production release review.
7. Finish responsive interaction tests and independent code review, then validate a selected real board through manufacturing/assembly/power-on.

The long-term task is currently `usageLimited` in Codex; it has not been marked complete. Resume from this document and the implementation plan when execution becomes available.
