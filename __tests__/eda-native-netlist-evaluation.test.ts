// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/eda/document';
import { createComponent } from '@/lib/eda/library';
import type { EdaDocument } from '@/lib/eda/types';
import { LED_AGENT_SCENARIO } from '@/lib/eda/evaluation-scenarios';
import { assessNativeNetlist } from '@/lib/eda/native-netlist-evaluation';

function document(): EdaDocument {
  const doc = createEmptyDocument();
  const j = createComponent('header2');
  const r = createComponent('r0603'); r.value = '470R';
  const d = createComponent('led0603');
  doc.components = [j, r, d];
  doc.nets = [
    { id: 'a', name: 'VCC', nodes: [{ componentId: j.id, pinId: '1' }, { componentId: r.id, pinId: '1' }] },
    { id: 'b', name: 'LED_A', nodes: [{ componentId: r.id, pinId: '2' }, { componentId: d.id, pinId: '2' }] },
    { id: 'c', name: 'GND', nodes: [{ componentId: j.id, pinId: '2' }, { componentId: d.id, pinId: '1' }] },
  ];
  return doc;
}

function netlist(options: { reverseLed?: boolean; short?: boolean; omit?: boolean; value?: string; symbol?: string; footprint?: string } = {}): string {
  const a = options.reverseLed ? '1' : '2';
  const k = options.reverseLed ? '2' : '1';
  const ledNode = options.omit ? '' : `(node (ref "D1") (pin "${a}"))`;
  const ledNet = options.short ? `(node (ref "J1") (pin "2")) (node (ref "D1") (pin "${k}"))` : '';
  const gndNet = options.short ? '' : `(net (code "3") (name "GND") (node (ref "J1") (pin "2")) (node (ref "D1") (pin "${k}")))`;
  return `(export (version "E") (components
    (comp (ref "J1") (value "Conn_01x02") (footprint "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical") (libsource (lib "Connector_Generic") (part "Conn_01x02")))
    (comp (ref "R1") (value "${options.value || '470R'}") (footprint "Resistor_SMD:R_0603_1608Metric") (libsource (lib "Device") (part "R")))
    (comp (ref "D1") (value "LED") (footprint "${options.footprint || 'LED_SMD:LED_0603_1608Metric'}") (libsource (lib "Device") (part "${options.symbol || 'LED'}"))))
    (nets
      (net (code "1") (name "VCC") (node (ref "J1") (pin "1")) (node (ref "R1") (pin "1")) ${ledNet})
      (net (code "2") (name "LED_A") (node (ref "R1") (pin "2")) ${ledNode})
      ${gndNet}))`;
}

describe('native KiCad netlist oracle', () => {
  const intent = LED_AGENT_SCENARIO.steps[0].intent;
  it('accepts the intended graph independent of KiCad net names and codes', () => {
    expect(assessNativeNetlist(netlist(), document(), intent).passed).toBe(true);
  });
  it('rejects a missing native connection despite a correct in-memory document', () => {
    const result = assessNativeNetlist(netlist({ omit: true }), document(), intent);
    expect(result.passed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'native_required_connection_missing')).toBe(true);
  });
  it('rejects reversed native LED pins', () => {
    expect(assessNativeNetlist(netlist({ reverseLed: true }), document(), intent).findings.some(finding => finding.code === 'native_required_connection_missing')).toBe(true);
  });
  it('rejects a native VCC-to-GND short', () => {
    expect(assessNativeNetlist(netlist({ short: true }), document(), intent).findings.some(finding => finding.code === 'native_forbidden_connection_present')).toBe(true);
  });
  it('rejects a native value that differs from the validated draft', () => {
    expect(assessNativeNetlist(netlist({ value: '10k' }), document(), intent).findings.some(finding => finding.code === 'native_component_value_mismatch')).toBe(true);
  });
  it('rejects a different native symbol or footprint with the same reference and value', () => {
    expect(assessNativeNetlist(netlist({ symbol: 'D' }), document(), intent).findings.some(finding => finding.code === 'native_component_identity_mismatch')).toBe(true);
    expect(assessNativeNetlist(netlist({ footprint: 'LED_SMD:Other' }), document(), intent).findings.some(finding => finding.code === 'native_component_identity_mismatch')).toBe(true);
  });
  it('rejects a modeled single-pin net missing from KiCad export', () => {
    const isolated = document();
    const extra = createComponent('header4', 2);
    isolated.components.push(extra);
    isolated.nets.push({ id: 'single', name: 'TEST', nodes: [{ componentId: extra.id, pinId: '3' }] });
    const native = netlist().replace('(components', '(components (comp (ref "J2") (value "Conn_01x04") (footprint "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical") (libsource (lib "Connector_Generic") (part "Conn_01x04")))');
    expect(assessNativeNetlist(native, isolated, intent).findings.some(finding => finding.code === 'native_topology_mismatch')).toBe(true);
  });
  it('rejects duplicate pin assignments and malformed input', () => {
    const duplicate = netlist().replace('(node (ref "R1") (pin "2"))', '(node (ref "R1") (pin "2")) (node (ref "J1") (pin "1"))');
    expect(assessNativeNetlist(duplicate, document(), intent).findings.some(finding => finding.code === 'invalid_native_netlist')).toBe(true);
    expect(assessNativeNetlist('(export', document(), intent).findings.some(finding => finding.code === 'invalid_native_netlist')).toBe(true);
  });
});
