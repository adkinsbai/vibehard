import type { SchematicIntent } from '@/lib/eda/evaluation';

export type EdaAgentScenario = {
  id: string;
  version: number;
  steps: { prompt: string; intent: SchematicIntent; preserveExisting?: boolean; allowedValueChangeRoles?: string[] }[];
};

/** These are task specifications, not precomputed model answers or acceptance evidence. */
export const LED_AGENT_SCENARIO: EdaAgentScenario = {
  id: 'led-series-and-revisions',
  version: 1,
  steps: [
    {
      prompt: '用官方 KiCad 库里的 2 针接口 J1、0603 电阻 R1 和 0603 LED D1 画一个 5V 指示灯原理图。J1 的 1 脚接 470Ω 电阻 R1，R1 另一端接 D1 阳极，D1 阴极回 J1 的 2 脚。不要增加其他器件。请说明实际 LED 料号和电流仍需人工核实。',
      intent: {
        roles: {
          input: { kind: 'header2', ref: 'J1' },
          resistor: { kind: 'r0603', ref: 'R1', value: '470R' },
          led: { kind: 'led0603', ref: 'D1' },
        },
        connections: [
          [{ role: 'input', pin: '1' }, { role: 'resistor', pin: '1' }],
          [{ role: 'resistor', pin: '2' }, { role: 'led', pin: '2' }],
          [{ role: 'led', pin: '1' }, { role: 'input', pin: '2' }],
        ],
        separations: [[{ role: 'input', pin: '1' }, { role: 'input', pin: '2' }]],
        allowExtraComponents: false,
      },
    },
    {
      prompt: '把现有限流电阻改为 1kΩ。保留接口、LED 和所有连接关系，其他器件不要动。',
      preserveExisting: true,
      allowedValueChangeRoles: ['resistor'],
      intent: {
        roles: {
          input: { kind: 'header2', ref: 'J1' },
          resistor: { kind: 'r0603', ref: 'R1', value: '1k' },
          led: { kind: 'led0603', ref: 'D1' },
        },
        connections: [
          [{ role: 'input', pin: '1' }, { role: 'resistor', pin: '1' }],
          [{ role: 'resistor', pin: '2' }, { role: 'led', pin: '2' }],
          [{ role: 'led', pin: '1' }, { role: 'input', pin: '2' }],
        ],
        separations: [[{ role: 'input', pin: '1' }, { role: 'input', pin: '2' }]],
        allowExtraComponents: false,
      },
    },
    {
      prompt: '保留现有 R1-D1 指示灯支路，再并联新增一条独立的 1kΩ 电阻 R2 与 LED D2 串联支路：接口 1→R2→D2 阳极，D2 阴极→接口 2。两支路不得短接 5V 和地。',
      preserveExisting: true,
      intent: {
        roles: {
          input: { kind: 'header2', ref: 'J1' },
          r1: { kind: 'r0603', ref: 'R1', value: '1k' },
          d1: { kind: 'led0603', ref: 'D1' },
          r2: { kind: 'r0603', ref: 'R2', value: '1k' },
          d2: { kind: 'led0603', ref: 'D2' },
        },
        connections: [
          [{ role: 'input', pin: '1' }, { role: 'r1', pin: '1' }, { role: 'r2', pin: '1' }],
          [{ role: 'r1', pin: '2' }, { role: 'd1', pin: '2' }],
          [{ role: 'r2', pin: '2' }, { role: 'd2', pin: '2' }],
          [{ role: 'input', pin: '2' }, { role: 'd1', pin: '1' }, { role: 'd2', pin: '1' }],
        ],
        separations: [
          [{ role: 'input', pin: '1' }, { role: 'input', pin: '2' }],
          [{ role: 'r1', pin: '2' }, { role: 'r2', pin: '2' }],
        ],
        allowExtraComponents: false,
      },
    },
  ],
};
