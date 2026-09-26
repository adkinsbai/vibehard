# Web EDA Workbench Implementation Plan

> For agentic workers: use subagent-driven-development for independent domain, UI and export tasks; root integrates backend and performs runtime review.

Goal: build the approved collaborative browser schematic/PCB workspace in the existing VibeHard checkout.
Architecture: pure validated document/command engine, React/SVG editor, project-scoped authenticated storage/model adapter, deterministic KiCad export/check runner.
Tech Stack: existing Next.js 16.3.1, React 19, TypeScript, Zod, Vitest. Native SVG initially, no unverified viewer dependency required for bounded editor.

## Global constraints
Read AGENTS.md, .ai/TEAM_RULES.md and the relevant installed Next docs before app changes. Existing auth/Runner routes and production services preserved. Long-term user request authorizes work in this feature checkout. No secrets printed. Test-first domain/IO behavior. No fake AI, ERC/DRC or progress. Missing tools return capability unavailable. Existing tests have two Windows symlink fixture failures and two database-dependent skips.

## Contract
All below types/exports are implemented by Task 1 in lib/eda/types.ts and accompanying modules.

```ts
export type PartKind = 'resistor'|'capacitor'|'led'|'connector2'|'connector4'|'mcu'|'sensor';
export type ViewMode = 'schematic'|'pcb';
export type Position = {x:number;y:number;rotation:number};
export type PinRef = {componentId:string;pinId:string};
export type EdaComponent = {id:string;ref:string;kind:PartKind;value:string;schematic:Position;pcb:Position & {side:'top'|'bottom'};locked:boolean};
export type EdaNet = {id:string;name:string;nodes:PinRef[]};
export type EdaTrack = {id:string;netId:string;layer:'top'|'bottom';width:number;points:{x:number;y:number}[]};
export type EdaDocument = {schemaVersion:1;id:string;name:string;revision:number;components:EdaComponent[];nets:EdaNet[];tracks:EdaTrack[];board:{width:number;height:number};appliedBatchIds:string[]};
export type EditCommand =
 | {type:'addComponent';component:EdaComponent}
 | {type:'removeComponent';id:string}
 | {type:'moveComponent';id:string;view:ViewMode;x:number;y:number;rotation?:number}
 | {type:'setComponent';id:string;changes:Partial<Pick<EdaComponent,'ref'|'value'|'locked'>>}
 | {type:'connectPins';a:PinRef;b:PinRef;netName?:string}
 | {type:'disconnectPin';pin:PinRef}
 | {type:'renameNet';id:string;name:string}
 | {type:'addTrack';track:EdaTrack}
 | {type:'removeTrack';id:string}
 | {type:'setBoard';width:number;height:number}
 | {type:'renameDocument';name:string};
export type EditBatch = {id:string;baseRevision:number;label:string;actor:'user'|'agent';commands:EditCommand[]};
export type EdaIssue = {id:string;severity:'error'|'warning'|'info';message:string;componentId?:string;netId?:string;trackId?:string};
// library.ts
export type PartDefinition = {kind:PartKind;name:string;prefix:string;defaultValue:string;description:string;symbol:{width:number;height:number};footprint:{name:string;width:number;height:number;padWidth:number;padHeight:number};pins:{id:string;name:string;x:number;y:number;pcbX:number;pcbY:number;electrical:string}[]};
export const PARTS:Record<PartKind,PartDefinition>;
export function createComponent(kind:PartKind,index:number=1):EdaComponent;
export function pinPosition(component:EdaComponent,pinId:string,view:ViewMode):{x:number;y:number};
// document.ts
export function createStarterDocument():EdaDocument;
export function parseDocument(input:unknown):EdaDocument; // throws descriptive error on schema/graph mismatch
// commands.ts
export function parseEditBatch(input:unknown):EditBatch;
export function applyEditBatch(doc:EdaDocument,batch:EditBatch):EdaDocument; // immutable atomic, revision conflict, dedup ID
// checks.ts
export function checkDocument(doc:EdaDocument):EdaIssue[]; // internal checks, explicitly not KiCad ERC/DRC
// history.ts
export type EditorHistory = {past:EdaDocument[];present:EdaDocument;future:EdaDocument[]};
export function createHistory(doc:EdaDocument):EditorHistory;
export function commitBatch(history:EditorHistory,batch:EditBatch):EditorHistory;
export function undo(history:EditorHistory):EditorHistory;
export function redo(history:EditorHistory):EditorHistory;
// kicad.ts (Task 3)
export function exportKicadSchematic(doc:EdaDocument):string;
export function exportKicadPcb(doc:EdaDocument):string;
export function exportBomCsv(doc:EdaDocument):string;
```

## Task 1 — tested document and commands (domain worker)
Files: lib/eda/{types,library,document,commands,checks,history}.ts; __tests__/eda-core.test.ts.
- [ ] Write tests: one pin cannot belong to two nets, connecting nets merges, deleting component removes dangling refs and invalidates copper, batch atomicity/revision conflict, dedup, nonfinite/import bounds, undo/redo monotonic revision.
- [ ] Run pnpm exec vitest run __tests__/eda-core.test.ts, observe missing implementation/behavior fail.
- [ ] Implement contract with bounded Zod parsing; immutable operations validate final document; locked objects refuse geometric edit; electrical changes invalidate affected tracks.
- [ ] Verify tests and typecheck. Record exact output.

## Task 2 — interactive editor (UI worker)
Files: components/eda/*; app/eda/page.tsx; app/app/eda/page.tsx; __tests__/eda-workbench.test.tsx.
- [ ] Test pin connect, selection/property edit, tab switch, persistence, undo; use domain contract.
- [ ] Implement full-screen Chinese editor with actual SVG geometry and structured operations; browser draft protected during load. Toolbar/palette/inspector/Agent proposal/diagnostics.
- [ ] Human and Agent apply through commitBatch; Agent proposal API consumes document plus prompt, returns batch with baseRevision; preview and explicit apply, errors visibly rendered.
- [ ] JSON backup/import and actual KiCad downloads. Local mode clear; server save optional project association via existing project API.
- [ ] Browser checks at 1440x900 and 390px, no broken actions or hidden errors. No module-wide new global styles.

## Task 3 — deterministic KiCad exports (export worker)
Files: lib/eda/{kicad,sexpr,kicad-import}.ts; __tests__/eda-kicad.test.ts.
- [ ] Tests for actual syntax, unique deterministic UUIDs, label-at-pin net topology, schematic symbol pin definitions/instances, PCB footprint pad-net mapping, rotation, escaping and CSV formula protection.
- [ ] Generate self-contained KiCad 8/9 schematic symbols and PCB footprint pads/tracks using contract. Generic symbols clearly identified. Preserve graph semantics; no fake native import claims.
- [ ] Export BOM fields Ref/Value/Kind/Footprint/Quantity. Optional bounded generated-file import if feasible, but unsupported general import must fail clearly.
- [ ] Validate with actual CLI when available; root will install/discover KiCad and run roundtrip checks. No assertion of ERC correctness from syntax tests alone.

## Task 4 — project IO, AI proposal and capability checks (root)
Files: lib/server/eda-{store,agent,tools}.ts; app/api/eda/{projects,agent,capabilities,check}/*; tests.
- [ ] Write failing tests for scoped ownership, atomic save/revision conflicts, malformed/oversized docs, unconfigured AI, fixed tool args/missing executable.
- [ ] Use existing requestUser/ownedProject and runtimeLlm/callLlm; never invent local credentials or copy unrelated model keys. Public local editor requires no login; server endpoints do.
- [ ] Save project documents/versions atomically under configured EDA data dir with bounded inputs, lock and monotonic revision. No migration of existing data.
- [ ] AI only proposes validated batch; no implicit apply. Reject invalid graph modifications and baseRevision mismatch; return model provenance.
- [ ] Tool execution uses generated files, fixed executable, bounded timeout/output; cleanup precisely scoped temp directory. Check result has real exit code/report or unavailable.

## Task 5 — integration, runtime QA and handoff (root + reviewer)
- [ ] Add navigation link without removing existing pages. Update .ai task log/status and editor docs with exact limitations.
- [ ] Focused tests, full suite vs baseline, tsc, production build; browser operate edits/reload/undo/export/agent errors.
- [ ] Review domain corruption, concurrent edits, authentication, file safety, export semantics and runtime UX; fix findings with regression tests.
- [ ] Launch accessible local preview and open it for user; keep long-term goal active while required wider import/EDA features remain.

## Ledger
Worktree codex/web-eda-workbench; production untouched. No hardware verification claim.

User amendment during implementation: no example or placeholder implementation is acceptable. Default projects are now empty, the palette uses seven official KiCad symbol/footprint pairs, and generic MCU/sensor entries are hidden. Legacy definitions remain for compatibility/tests only. The shared PartKind contract has been extended with official catalog kinds. Native stacked pins are normalized and NC connections rejected. Read current code and docs/eda-workbench.md over the initial contract above.

Tasks 1–4 are implemented with bounded native import and manufacturing export added. Task 5 build/type/lint and focused tests passed; full suite retains baseline Windows symlink failures and DB skips. Native HTTP integration, ERC/DRC and real ZIP generation passed. Actual LLM calls remain unverified because this checkout has no model configured. Independent final review stopped at the account usage limit. Long-term goal is usageLimited, not complete. See docs/eda-workbench.md for exact acceptance evidence and outstanding work.
