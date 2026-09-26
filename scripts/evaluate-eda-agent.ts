/** Operator-run, read-only Agent benchmark. Each repetition starts from a fresh in-memory draft. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LED_AGENT_SCENARIO } from '../lib/eda/evaluation-scenarios';
import { evaluateAgentScenario } from '../lib/eda/evaluation-runner';
import { exportKicadSchematic } from '../lib/eda/kicad';
import { assessNativeNetlist } from '../lib/eda/native-netlist-evaluation';
import { proposeEdaEdit } from '../lib/server/eda-agent';
import { nativeCheckArguments } from '../lib/server/eda-tools';

const execute = promisify(execFile);
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

async function main() {
  const requested = process.argv.indexOf('--runs');
  const runs = requested < 0 ? 3 : Number(process.argv[requested + 1]);
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > 5) throw new Error('--runs must be an integer from 1 to 5');
  const evidenceRoot = join(process.cwd(), '.eda-data', 'agent-evaluations');
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const evidenceDirectory = await mkdtemp(join(evidenceRoot, 'run-'));
  await chmod(evidenceDirectory, 0o700);
  const kicadExecutable = process.env.KICAD_CLI_PATH || 'kicad-cli';
  let kicadCliVersion: string | null = null;
  try { kicadCliVersion = (await execute(kicadExecutable, ['--version'], { timeout: 5_000, maxBuffer: 64_000, windowsHide: true })).stdout.trim(); }
  catch { /* The per-step ERC evidence records unavailability. */ }
  const artifacts: { run: number; step: number; schematic: string; schematicSha256: string; netlist: string; netlistSha256: string; nativeNetlistPassed: boolean }[] = [];
  const ercEvidence: { run: number; step: number; file: string; sha256: string; reportFile?: string; rawReportSha256?: string; available: boolean; exitCode?: number }[] = [];
  const proposals: { run: number; step: number; file: string; sha256: string }[] = [];
  const modelResponses: { run: number; step: number; model: string; file: string; sha256: string }[] = [];
  const promptSha256 = sha256(JSON.stringify(LED_AGENT_SCENARIO.steps.map(step => step.prompt)));
  const scenarioSha256 = sha256(JSON.stringify(LED_AGENT_SCENARIO));
  const results = [];
  for (let index = 0; index < runs; index++) {
    let nextStep = 0;
    const schematicFiles = new Map<number, { file: string; sha256: string }>();
    const result = await evaluateAgentScenario(LED_AGENT_SCENARIO, {
      propose: (document, prompt) => {
        const step = nextStep++;
        return proposeEdaEdit(document, prompt, undefined, async (raw, model) => {
          if (Buffer.byteLength(raw, 'utf8') > 1_000_000) throw new Error('Model response exceeds evidence size limit');
          const file = `run-${index + 1}-step-${step + 1}-model-raw.txt`;
          await writeFile(join(evidenceDirectory, file), raw, { encoding: 'utf8', mode: 0o600 });
          modelResponses.push({ run: index + 1, step: step + 1, model, file, sha256: sha256(raw) });
        });
      },
      checkErc: async (document, step) => {
        const stem = `run-${index + 1}-step-${step + 1}`;
        const schematicFile = `${stem}.kicad_sch`;
        const schematic = join(evidenceDirectory, schematicFile);
        const reportFile = `${stem}-erc-raw.json`;
        const reportPath = join(evidenceDirectory, reportFile);
        const metadataFile = `${stem}-erc-evidence.json`;
        let schematicSha256: string | undefined;
        let rawReportSha256: string | undefined;
        let exitCode: number | undefined;
        let outcome: { available: boolean; exitCode?: number; report?: unknown; message?: string } = { available: false, message: 'KiCad ERC was not executed' };
        try {
          const source = exportKicadSchematic(document);
          await writeFile(schematic, source, { encoding: 'utf8', mode: 0o600 });
          schematicSha256 = sha256(source);
          schematicFiles.set(step, { file: schematicFile, sha256: schematicSha256 });
          try { await execute(kicadExecutable, nativeCheckArguments('erc', schematic, reportPath), { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true }); exitCode = 0; }
          catch (error) {
            const failure = error as Error & { code?: number | string; killed?: boolean };
            if (typeof failure.code === 'number') exitCode = failure.code;
            else throw error;
          }
          let raw: Buffer;
          try { await chmod(reportPath, 0o600); raw = await readFile(reportPath); }
          catch { throw new Error('KiCad ERC did not produce a JSON report'); }
          rawReportSha256 = sha256(raw);
          outcome = { available: true, exitCode, report: JSON.parse(raw.toString('utf8')) };
        } catch (error) {
          outcome = { available: Boolean(rawReportSha256) || exitCode !== undefined, ...(exitCode !== undefined ? { exitCode } : {}), message: error instanceof Error ? error.message : 'KiCad ERC failed' };
        }
        const metadata = JSON.stringify({ kicadCliVersion, schematicFile: schematicSha256 ? schematicFile : null, schematicSha256: schematicSha256 || null, reportFile: rawReportSha256 ? reportFile : null, rawReportSha256: rawReportSha256 || null, available: outcome.available, exitCode: outcome.exitCode ?? null, message: outcome.message || null }, null, 2);
        await writeFile(join(evidenceDirectory, metadataFile), metadata, { encoding: 'utf8', mode: 0o600 });
        ercEvidence.push({ run: index + 1, step: step + 1, file: metadataFile, sha256: sha256(metadata), ...(rawReportSha256 ? { reportFile, rawReportSha256 } : {}), available: outcome.available, ...(outcome.exitCode !== undefined ? { exitCode: outcome.exitCode } : {}) });
        return outcome;
      },
      recordProposal: async (document, step, proposal) => {
        const file = `run-${index + 1}-step-${step + 1}-proposal.json`;
        const content = JSON.stringify({ scenarioId: LED_AGENT_SCENARIO.id, scenarioVersion: LED_AGENT_SCENARIO.version, scenarioSha256, step: step + 1, promptSha256: sha256(LED_AGENT_SCENARIO.steps[step].prompt), baseDocumentSha256: sha256(JSON.stringify(document)), baseDocument: document, model: proposal.model, summary: proposal.summary, batch: proposal.batch }, null, 2);
        await writeFile(join(evidenceDirectory, file), content, { encoding: 'utf8', mode: 0o600 });
        proposals.push({ run: index + 1, step: step + 1, file, sha256: sha256(content) });
      },
      recordPassingStep: async (document, step) => {
        const stem = `run-${index + 1}-step-${step + 1}`;
        const source = schematicFiles.get(step);
        if (!source) throw new Error('Missing native schematic from ERC stage');
        const schematic = join(evidenceDirectory, source.file);
        const netlist = join(evidenceDirectory, `${stem}.net`);
        await execute(kicadExecutable, ['sch', 'export', 'netlist', '-o', netlist, schematic], { timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true });
        await chmod(netlist, 0o600);
        const [schematicData, netlistData] = await Promise.all([readFile(schematic), readFile(netlist)]);
        if (sha256(schematicData) !== source.sha256) throw new Error('Native schematic changed after ERC; evidence is stale');
        const native = assessNativeNetlist(netlistData.toString('utf8'), document, LED_AGENT_SCENARIO.steps[step].intent);
        artifacts.push({ run: index + 1, step: step + 1, schematic: source.file, schematicSha256: source.sha256, netlist: `${stem}.net`, netlistSha256: sha256(netlistData), nativeNetlistPassed: native.passed });
        return native;
      },
    });
    results.push({ run: index + 1, ...result });
  }
  const passed = results.filter(result => result.passed).length;
  const modelRequestsSucceeded = results.reduce((total, result) => total + result.steps.filter(step => Boolean(step.model)).length, 0);
  const nativeErcExecuted = results.reduce((total, result) => total + result.steps.filter(step => step.ercAvailable && step.ercViolationCount !== undefined).length, 0);
  const report = { execution: 'live-model-attempt', kicadCliVersion, scenarioId: LED_AGENT_SCENARIO.id, scenarioVersion: LED_AGENT_SCENARIO.version, scenarioSha256, promptSha256, runs, passed, modelRequestsSucceeded, modelResponsesReceived: modelResponses.length, nativeErcExecuted, modelResponses, proposals, ercEvidence, artifacts, results };
  await writeFile(join(evidenceDirectory, 'report.json'), JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
  const summary = { evidenceDirectory, kicadCliVersion, scenarioId: report.scenarioId, scenarioVersion: report.scenarioVersion, scenarioSha256, promptSha256, runs, passed, modelRequestsSucceeded, modelResponsesReceived: modelResponses.length, nativeErcExecuted, modelResponses, proposals, ercEvidence, artifacts, outcomes: results.map(result => ({ run: result.run, passed: result.passed, steps: result.steps.map(step => ({ index: step.index, passed: step.passed, ercClean: step.ercClean, nativeNetlistPassed: step.nativeNetlist?.passed ?? null, findingCodes: [...step.intent.findings, ...(step.preservation?.findings || []), ...(step.nativeNetlist?.findings || [])].map(finding => finding.code) })) })) };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (passed !== runs) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed'}\n`);
  process.exitCode = 1;
});
