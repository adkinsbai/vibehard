# EDA Agent Evaluation Implementation Plan

This plan tracks the evaluation phase. Completed implementation steps and remaining live-model acceptance are marked below.

**Goal:** Measure whether the configured model creates and revises schematics that satisfy explicit user intent, rather than merely returning valid edit JSON.

**Architecture:** A versioned scenario contract holds required and forbidden pin/network relations plus preserved circuit invariants. A deterministic evaluator checks the candidate `EdaDocument`; a separate runner calls the real configured model, exports native KiCad files, records CLI results and review evidence. Offline unit tests never count as live-model performance.

**Tech Stack:** TypeScript, Vitest, existing `proposeEdaEdit`/`applyEditBatch`, KiCad 9 `kicad-cli` and the existing desktop worker.

## Global Constraints

- Canonical user files are saved native KiCad files under a private `(owner, project)` worker; evaluation must not mutate a user's active project.
- Current production worker is KiCad 9.0.8. KiCad 9/10 IPC cannot write schematics; use the existing command path and native CLI for first measurements.
- The current controlled catalog contains seven official components. Do not claim ESP32 module scenarios pass until a reviewed module package is available.
- A pass needs matching topology and preserved unrelated work. ERC 0 alone is insufficient.
- Raw model output and reports may contain user designs; store evaluation artifacts only in a restricted local/test directory and never commit secrets or user data.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/eda/evaluation.ts` | Deterministic component, parameter, topology, forbidden-net, and preservation checks. |
| `lib/eda/evaluation-scenarios.ts` | Versioned three-turn task expressible with the current catalog; no fake library data. |
| `lib/eda/evaluation-runner.ts` | Sequentially applies real proposals and combines intent, preservation, ERC, and artifact capture. |
| `lib/eda/native-netlist-evaluation.ts` | Compare KiCad-exported component identity, values, and actual pin connectivity to the approved draft. |
| `__tests__/eda-evaluation.test.ts`, `__tests__/eda-evaluation-runner.test.ts`, `__tests__/eda-native-netlist-evaluation.test.ts` | Negative and positive evaluator behavior, including multi-turn preservation and native-export mismatches. |
| `scripts/evaluate-eda-agent.ts` | Opt-in real-model runner; writes restricted proposal/native evidence outside Git. |
| `docs/eda-agent-evaluation.md` | How to run, task rubric, evidence schema, results and verification boundary. |
| `.ai/TASK_LOG.md`, `.ai/PROJECT_STATUS.md` | Team handoff/status. |

### Task 1: Deterministic intent and modification evaluator

**Files:** Create `lib/eda/evaluation.ts`, `lib/eda/evaluation-scenarios.ts`, `__tests__/eda-evaluation.test.ts`.

**Interfaces:** `assessSchematicIntent(document, intent)` and `assessRevisionPreservation(before, after, options)` return `{passed:boolean, findings:{code:string,detail:string}[]}`. Scenario roles select component kind/reference/value; required net groups compare connectivity regardless of generated net names; forbidden groups require distinct nets; preservation compares unchanged references, kinds, values, and connection signatures. The evaluator does not infer chip ratings from an LLM.

- [x] Write positive and negative LED topology, parameter, and preservation tests and observe initial failures.
- [x] Implement pure comparison over `EdaDocument.components` and `EdaDocument.nets` with all findings returned.
- [x] Rerun focused tests and TypeScript validation.

### Task 2: Real-model, three-turn evaluation runner

**Files:** Create `lib/eda/evaluation-runner.ts`, `scripts/evaluate-eda-agent.ts`, `__tests__/eda-evaluation-runner.test.ts`; extend `docs/eda-agent-evaluation.md`.

**Interfaces:** Command `pnpm exec tsx scripts/evaluate-eda-agent.ts --runs 3` reads the configured design model through existing server settings, calls `proposeEdaEdit`, applies each proposal to an isolated evolving document, executes three dependent prompts, and writes a JSON report and private artifacts under ignored `.eda-data/agent-evaluations/run-*`. Credentials are never printed. A missing model is a failed attempt, not a pass.

- [x] Test missing model, invalid proposals, topology failures, ERC failures, native netlist mismatches, and dependent-turn stopping.
- [x] Implement the private evidence runner with `--runs` limited to 1–5, nonzero exit on failure, raw ERC, native netlist, and SHA-256 capture.
- [x] Run focused tests, TypeScript validation, and one local live-model invocation. Record that the local model was unavailable and yielded no model or ERC success.
- [ ] Run the three-turn scenario against the configured cloud model and KiCad CLI, then preserve reviewable trial artifacts.

### Task 3: Engineer review and model benchmark publication gate

**Files:** Modify `docs/eda-agent-evaluation.md`, `.ai/TASK_LOG.md`, `.ai/PROJECT_STATUS.md`.

**Interfaces:** The machine report records scenario and prompt hashes, model, KiCad version, baseline and candidate hashes, ERC and native-netlist results. A separate engineer review must record `approved | rejected | pending`, reviewer, and reasons before any product-quality claim.

- [ ] Review rendered PDF/SVG of each candidate with a hardware engineer and compare schematic connectivity to the reference topology. Record ambiguity, omitted functionality, unsafe assumptions, and visual legibility separately.
- [ ] Run at least the baseline LED creation and one request to change a component value while keeping unrelated connections. Repeat with a new session and record all trials; do not report a population-level pass rate from one success.
- [ ] Re-run native ERC and netlist export for every accepted candidate, and inspect any ERC exclusion/waiver instead of counting it as zero.
- [ ] Update platform status to distinguish offline evaluator, real-model trials, engineer approval, and deployment state; commit as `docs(eda): record agent generation and revision acceptance`.

## Self-review checklist

- [ ] Compare every acceptance row of `docs/superpowers/specs/2026-09-26-eda-agent-native-workflow-design.md` with this plan; this plan covers only evaluation phase 1, while module/native composition, Freerouting, and imports are independently deliverable phases.
- [ ] Confirm no generated module package or PDF reconstruction is represented as a live-model success.
- [ ] Run `git diff --check` and targeted test/type/build checks before opening a reviewable PR.
