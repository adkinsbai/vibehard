// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createComponent } from '@/lib/eda/library';
import type { EditCommand } from '@/lib/eda/types';
import { LED_AGENT_SCENARIO } from '@/lib/eda/evaluation-scenarios';
import { evaluateAgentScenario } from '@/lib/eda/evaluation-runner';

function firstCommands(reverseLed = false): EditCommand[] {
  const input = createComponent('header2');
  const resistor = createComponent('r0603'); resistor.value = '470R';
  const led = createComponent('led0603');
  const ledAnode = reverseLed ? '1' : '2', ledCathode = reverseLed ? '2' : '1';
  return [
    { type: 'addComponent', component: input },
    { type: 'addComponent', component: resistor },
    { type: 'addComponent', component: led },
    { type: 'connectPins', a: { componentId: input.id, pinId: '1' }, b: { componentId: resistor.id, pinId: '1' } },
    { type: 'connectPins', a: { componentId: resistor.id, pinId: '2' }, b: { componentId: led.id, pinId: ledAnode } },
    { type: 'connectPins', a: { componentId: led.id, pinId: ledCathode }, b: { componentId: input.id, pinId: '2' } },
  ];
}

describe('multi-turn evaluation orchestration (offline task double)', () => {
  it('checks generation, value revision, and added branch against each stage of the same document', async () => {
    let calls = 0;
    const ercIndices: number[] = [];
    const report = await evaluateAgentScenario(LED_AGENT_SCENARIO, {
      propose: async document => {
        const commands: EditCommand[] = calls === 0 ? firstCommands() : calls === 1
          ? [{ type: 'setComponent', id: 'r0603-1', changes: { value: '1k' } }]
          : [
            { type: 'addComponent', component: { ...createComponent('r0603', 2), value: '1k' } },
            { type: 'addComponent', component: createComponent('led0603', 2) },
            { type: 'connectPins', a: { componentId: 'header2-1', pinId: '1' }, b: { componentId: 'r0603-2', pinId: '1' } },
            { type: 'connectPins', a: { componentId: 'r0603-2', pinId: '2' }, b: { componentId: 'led0603-2', pinId: '2' } },
            { type: 'connectPins', a: { componentId: 'led0603-2', pinId: '1' }, b: { componentId: 'header2-1', pinId: '2' } },
          ];
        calls++;
        return { model: 'offline-double', summary: 'test', batch: { id: `batch-${calls}`, actor: 'agent', baseRevision: document.revision, label: 'test', commands } };
      },
      checkErc: async (_document, index) => { ercIndices.push(index); return { available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }; },
    });
    expect(calls).toBe(3);
    expect(ercIndices).toEqual([0, 1, 2]);
    expect(report.passed).toBe(true);
    expect(report.steps.map(step => step.passed)).toEqual([true, true, true]);
    expect(report.steps[2].revision).toBe(3);
    expect(report.steps[0].summary).toBe('test');
  });

  it('does not call ERC 0 proof of intent when LED polarity is reversed', async () => {
    const report = await evaluateAgentScenario({ ...LED_AGENT_SCENARIO, steps: LED_AGENT_SCENARIO.steps.slice(0, 1) }, {
      propose: async document => ({ model: 'offline-double', summary: 'test', batch: { id: 'reverse-led', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands(true) } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }),
    });
    expect(report.passed).toBe(false);
    expect(report.steps[0].ercClean).toBe(true);
    expect(report.steps[0].intent.findings.some(item => item.code === 'required_connection_missing')).toBe(true);
  });

  it('exposes only a passing document to the artifact recorder', async () => {
    const revisions: number[] = [];
    const scenario = { ...LED_AGENT_SCENARIO, steps: LED_AGENT_SCENARIO.steps.slice(0, 1) };
    await evaluateAgentScenario(scenario, {
      propose: async document => ({ model: 'offline-double', summary: 'test', batch: { id: 'good', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands() } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }),
      recordPassingStep: async (document, index) => { revisions.push(document.revision + index); },
    });
    expect(revisions).toEqual([1]);
    revisions.length = 0;
    await evaluateAgentScenario(scenario, {
      propose: async document => ({ model: 'offline-double', summary: 'test', batch: { id: 'bad', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands(true) } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }),
      recordPassingStep: async document => { revisions.push(document.revision); },
    });
    expect(revisions).toEqual([]);
  });

  it('records the actual proposal before a topology-rejected step', async () => {
    const captured: { baseRevision: number; commandCount: number; summary: string }[] = [];
    const scenario = { ...LED_AGENT_SCENARIO, steps: LED_AGENT_SCENARIO.steps.slice(0, 1) };
    const report = await evaluateAgentScenario(scenario, {
      propose: async document => ({ model: 'offline-double', summary: 'reversed LED', batch: { id: 'bad-proposal', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands(true) } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }),
      recordProposal: async (document, index, proposal) => {
        expect(index).toBe(0);
        captured.push({ baseRevision: document.revision, commandCount: proposal.batch.commands.length, summary: proposal.summary });
      },
    });
    expect(report.passed).toBe(false);
    expect(captured).toEqual([{ baseRevision: 0, commandCount: 6, summary: 'reversed LED' }]);
  });

  it('does not count a malformed native ERC report as clean', async () => {
    const scenario = { ...LED_AGENT_SCENARIO, steps: LED_AGENT_SCENARIO.steps.slice(0, 1) };
    const report = await evaluateAgentScenario(scenario, {
      propose: async document => ({ model: 'offline-double', summary: 'test', batch: { id: 'malformed-erc', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands() } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{}] } }),
    });
    expect(report.passed).toBe(false);
    expect(report.steps[0].ercClean).toBe(false);
  });

  it('rejects a step when native KiCad netlist contradicts an in-memory pass', async () => {
    const scenario = { ...LED_AGENT_SCENARIO, steps: LED_AGENT_SCENARIO.steps.slice(0, 1) };
    const report = await evaluateAgentScenario(scenario, {
      propose: async document => ({ model: 'offline-double', summary: 'test', batch: { id: 'native-mismatch', actor: 'agent', baseRevision: document.revision, label: 'test', commands: firstCommands() } }),
      checkErc: async () => ({ available: true, exitCode: 0, report: { sheets: [{ violations: [] }] } }),
      recordPassingStep: async () => ({ passed: false, findings: [{ code: 'native_required_connection_missing', detail: 'R1.2 ↔ D1.2' }] }),
    });
    expect(report.passed).toBe(false);
    expect(report.steps[0].intent.passed).toBe(true);
    expect(report.steps[0].ercClean).toBe(true);
    expect(report.steps[0].nativeNetlist?.passed).toBe(false);
    expect(report.steps[0].nativeNetlist?.findings[0].code).toBe('native_required_connection_missing');
  });
});
