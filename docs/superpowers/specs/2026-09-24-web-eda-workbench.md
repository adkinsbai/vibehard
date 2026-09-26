# Approved web EDA workbench

User approved route 2 and instructed sustained implementation on 2026-09-24. Goal: Agent and human share a browser schematic/PCB editor backed by EDA tooling. This spec records the authorized task; no deployment or hardware operation is required for the initial editor.

## Deliverables
- One real document with independent schematic and PCB geometry and shared electrical nets, stable IDs, finite coordinates and bounded input.
- Palette, selection, property editing, pin-to-pin connections, component move/rotate/delete, PCB placement/manual track editing, board bounds, layer display, zoom/pan.
- Validated atomic edit batches used equally by human and Agent. Revision precondition prevents overwriting intervening edits. Undo/redo and browser persistence are actual operations. Never silently overwrite a damaged imported draft.
- Chinese professional full-screen workspace, real sample LED circuit with clear unverified engineering status. Editable JSON backup/import, KiCad schematic/PCB export and netlist/BOM/report.
- Authenticated project-scoped server save and AI proposal API reuse existing auth and model settings; absent model returns unconfigured, no fake model completion. Local public editor uses only browser draft, never exposes private project data.
- Backend KiCad capability detection/check task: safe fixed executable and argument arrays, timeout, output limits, no shell snippets supplied by client. Missing installation reports unavailable, never ERC success.
- Existing platform preserved. No changes to production services or firmware.

## Incremental scope
M1 editor core, local editing, stable command contract and exports. M2 server project revisions/Agent proposal preview and real KiCad validation. M3 wider KiCad/EasyEDA roundtrip, PDF evidence workflow and Freerouting integration. M3 remains part of long-term goal; first milestones do not falsely claim universal import, completed manufacturing or full hardware validation.

## Shared contract (version 1)
Source files and exact signatures in implementation plan. All coordinates in mm. Schematic default viewport 220x140; board default 80x55. Prototype library geometry is explicitly labeled generic where appropriate. IDs use ASCII letters/digits/underscore/hyphen. User strings are bounded and escaped by file generators. Reference designators unique.
