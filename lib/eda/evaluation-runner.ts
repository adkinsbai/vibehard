import type { EditBatch, EdaDocument } from './types';
import type { EdaAgentScenario } from './evaluation-scenarios';
import type { EvaluationResult } from './evaluation';
import { createEmptyDocument } from './document';
import { applyEditBatch } from './commands';
import { assessRevisionPreservation, assessSchematicIntent } from './evaluation';

export type ErcOutcome = { available: boolean; exitCode?: number; report?: unknown; message?: string };
export type ScenarioProposal = { batch: EditBatch; model: string; summary: string };
export type ScenarioDependencies = {
  propose: (document: EdaDocument, prompt: string) => Promise<ScenarioProposal>;
  checkErc: (document: EdaDocument, index: number) => Promise<ErcOutcome>;
  recordProposal?: (document: EdaDocument, index: number, proposal: ScenarioProposal) => Promise<void>;
  recordPassingStep?: (document: EdaDocument, index: number) => Promise<EvaluationResult | void>;
};
export type ScenarioStepResult = { index: number; revision?: number; model?: string; summary?: string; commandCount?: number; intent: EvaluationResult; preservation?: EvaluationResult; nativeNetlist?: EvaluationResult; ercClean: boolean; ercAvailable: boolean; ercViolationCount?: number; error?: string; passed: boolean };
export type ScenarioResult = { scenarioId: string; passed: boolean; steps: ScenarioStepResult[] };

function permittedValueIds(document: EdaDocument, scenario: EdaAgentScenario, stepIndex: number): string[] {
  const previousRoles = scenario.steps[stepIndex - 1]?.intent.roles || {};
  return (scenario.steps[stepIndex].allowedValueChangeRoles || []).flatMap(role => {
    const selector = previousRoles[role];
    if (!selector) return [];
    const matches = document.components.filter(component => component.kind === selector.kind && (!selector.ref || component.ref.toUpperCase() === selector.ref.toUpperCase()));
    return matches.length === 1 ? [matches[0].id] : [];
  });
}

function ercViolationCount(report: unknown): number | undefined {
  if (!report || typeof report !== 'object' || !('sheets' in report) || !Array.isArray(report.sheets) || report.sheets.length === 0) return undefined;
  if (!report.sheets.every(sheet => sheet && typeof sheet === 'object' && 'violations' in sheet && Array.isArray(sheet.violations))) return undefined;
  return report.sheets.reduce<number>((total, sheet) => total + sheet.violations.length, 0);
}

/** Executes dependent prompts on one evolving document. The caller supplies the real model and KiCad adapters. */
export async function evaluateAgentScenario(scenario: EdaAgentScenario, dependencies: ScenarioDependencies): Promise<ScenarioResult> {
  let document = createEmptyDocument();
  const steps: ScenarioStepResult[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    let proposal: Awaited<ReturnType<ScenarioDependencies['propose']>>;
    try { proposal = await dependencies.propose(document, step.prompt); }
    catch (error) {
      steps.push({ index, intent: { passed: false, findings: [{ code: 'model_request_failed', detail: error instanceof Error ? error.message : 'Model request failed' }] }, ercClean: false, ercAvailable: false, error: 'model_request_failed', passed: false });
      break;
    }
    if (dependencies.recordProposal) {
      try { await dependencies.recordProposal(document, index, proposal); }
      catch (error) {
        steps.push({ index, model: proposal.model, summary: proposal.summary, commandCount: proposal.batch.commands.length, intent: { passed: false, findings: [{ code: 'proposal_capture_failed', detail: error instanceof Error ? error.message : 'Proposal capture failed' }] }, ercClean: false, ercAvailable: false, error: 'proposal_capture_failed', passed: false });
        break;
      }
    }
    let candidate: EdaDocument;
    try { candidate = applyEditBatch(document, proposal.batch); }
    catch (error) {
      steps.push({ index, model: proposal.model, summary: proposal.summary, commandCount: proposal.batch.commands.length, intent: { passed: false, findings: [{ code: 'command_invalid', detail: error instanceof Error ? error.message : 'Edit batch invalid' }] }, ercClean: false, ercAvailable: false, error: 'command_invalid', passed: false });
      break;
    }
    const intent = assessSchematicIntent(candidate, step.intent);
    const preservation = step.preserveExisting ? assessRevisionPreservation(document, candidate, { allowedValueChanges: permittedValueIds(document, scenario, index) }) : undefined;
    let erc: ErcOutcome;
    try { erc = await dependencies.checkErc(candidate, index); }
    catch (error) { erc = { available: false, message: error instanceof Error ? error.message : 'KiCad ERC failed' }; }
    const ercCount = ercViolationCount(erc.report);
    const ercClean = erc.available && erc.exitCode === 0 && ercCount === 0;
    let passed = intent.passed && (preservation?.passed ?? true) && ercClean;
    let artifactError: string | undefined;
    let nativeNetlist: EvaluationResult | undefined;
    if (passed && dependencies.recordPassingStep) {
      try {
        const result = await dependencies.recordPassingStep(candidate, index);
        if (result) { nativeNetlist = result; if (!result.passed) passed = false; }
      }
      catch (error) { artifactError = error instanceof Error ? error.message : 'Artifact capture failed'; passed = false; }
    }
    steps.push({ index, revision: candidate.revision, model: proposal.model, summary: proposal.summary, commandCount: proposal.batch.commands.length, intent, preservation, nativeNetlist, ercClean, ercAvailable: erc.available, ercViolationCount: ercCount, error: artifactError || erc.message, passed });
    if (!passed) break; // Later instructions refer to the result of this step.
    document = candidate;
  }
  return { scenarioId: scenario.id, passed: steps.length === scenario.steps.length && steps.every(step => step.passed), steps };
}
