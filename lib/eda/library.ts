import type { EdaComponent, PartKind, ViewMode } from './types';
import catalog from './catalog/parts.json';
import type { SExpression } from './sexpr';

export type PartDefinition = { kind: PartKind; name: string; prefix: string; defaultValue: string; description: string; symbol: { width: number; height: number }; footprint: { name: string; width: number; height: number; padWidth: number; padHeight: number }; pins: { id: string; name: string; x: number; y: number; pcbX: number; pcbY: number; electrical: string; angle?: number; length?: number }[]; native?: { libraryId: string; symbol: string; footprint: string; sourceVersion: string; sha256: string; graphics: SExpression[][]; pads: { id: string; type: string; shape: string; x: number; y: number; rotation: number; width: number; height: number; drill: number }[] } };

const twoPin = (names: [string, string], half = 8, pcbHalf = 2.5, electrical = 'passive') => [
  { id: names[0], name: names[0], x: -half, y: 0, pcbX: -pcbHalf, pcbY: 0, electrical },
  { id: names[1], name: names[1], x: half, y: 0, pcbX: pcbHalf, pcbY: 0, electrical },
];

export const PARTS: Record<PartKind, PartDefinition> = {
  ...catalog as unknown as Record<'r0603'|'c0603'|'led0603'|'header2'|'header4'|'esp32wroom32'|'tmp102', PartDefinition>,
  resistor: { kind: 'resistor', name: 'Resistor', prefix: 'R', defaultValue: '1 kΩ', description: 'Generic 2-pin resistor symbol and illustrative axial pad geometry; verify real package.', symbol: { width: 10, height: 4 }, footprint: { name: 'Generic:R_Axial', width: 8, height: 3, padWidth: 1.6, padHeight: 1.6 }, pins: twoPin(['1', '2']) },
  capacitor: { kind: 'capacitor', name: 'Capacitor', prefix: 'C', defaultValue: '100 nF', description: 'Generic non-polarized capacitor; illustrative pads, package unverified.', symbol: { width: 6, height: 6 }, footprint: { name: 'Generic:C_2Pad', width: 6, height: 3, padWidth: 1.5, padHeight: 1.5 }, pins: twoPin(['1', '2'], 8, 2) },
  led: { kind: 'led', name: 'LED', prefix: 'D', defaultValue: 'LED', description: 'Generic LED anode/cathode; polarity and device footprint must be verified.', symbol: { width: 8, height: 6 }, footprint: { name: 'Generic:LED_2Pad', width: 6, height: 3, padWidth: 1.7, padHeight: 1.7 }, pins: twoPin(['A', 'K'], 8, 2.5) },
  connector2: { kind: 'connector2', name: '2-pin connector', prefix: 'J', defaultValue: '2-pin', description: 'Generic 2-pin connector, pin numbering and mechanical footprint unverified.', symbol: { width: 8, height: 12 }, footprint: { name: 'Generic:Conn_2', width: 5, height: 8, padWidth: 1.8, padHeight: 1.8 }, pins: [1, 2].map((n) => ({ id: String(n), name: String(n), x: 8, y: (n - 1) * 5 - 2.5, pcbX: 0, pcbY: (n - 1) * 2.54 - 1.27, electrical: 'passive' })) },
  connector4: { kind: 'connector4', name: '4-pin connector', prefix: 'J', defaultValue: '4-pin', description: 'Generic 4-pin connector, pin numbering and mechanical footprint unverified.', symbol: { width: 8, height: 20 }, footprint: { name: 'Generic:Conn_4', width: 5, height: 13, padWidth: 1.8, padHeight: 1.8 }, pins: [1, 2, 3, 4].map((n) => ({ id: String(n), name: String(n), x: 8, y: (n - 1.5) * 5, pcbX: 0, pcbY: (n - 2.5) * 2.54, electrical: 'passive' })) },
  mcu: { kind: 'mcu', name: 'Generic controller block', prefix: 'U', defaultValue: 'GENERIC MCU — UNVERIFIED', description: 'Illustrative 4-pin controller block only. It is not a real MCU pinout, symbol or package.', symbol: { width: 18, height: 18 }, footprint: { name: 'Generic:IC_4Pad_UNVERIFIED', width: 10, height: 10, padWidth: 1.5, padHeight: 1.5 }, pins: [
    { id: 'VCC', name: 'VCC', x: -12, y: -5, pcbX: -5, pcbY: -2.5, electrical: 'power_in' },
    { id: 'GND', name: 'GND', x: -12, y: 5, pcbX: -5, pcbY: 2.5, electrical: 'power_in' },
    { id: 'IO1', name: 'IO1', x: 12, y: -5, pcbX: 5, pcbY: -2.5, electrical: 'bidirectional' },
    { id: 'IO2', name: 'IO2', x: 12, y: 5, pcbX: 5, pcbY: 2.5, electrical: 'bidirectional' },
  ] },
  sensor: { kind: 'sensor', name: 'Generic sensor block', prefix: 'U', defaultValue: 'GENERIC SENSOR — UNVERIFIED', description: 'Illustrative 4-pin sensor block only. Electrical pinout and footprint are unverified.', symbol: { width: 18, height: 18 }, footprint: { name: 'Generic:Sensor_4Pad_UNVERIFIED', width: 10, height: 10, padWidth: 1.5, padHeight: 1.5 }, pins: [
    { id: 'VCC', name: 'VCC', x: -12, y: -5, pcbX: -5, pcbY: -2.5, electrical: 'power_in' },
    { id: 'GND', name: 'GND', x: -12, y: 5, pcbX: -5, pcbY: 2.5, electrical: 'power_in' },
    { id: 'SDA', name: 'SDA', x: 12, y: -5, pcbX: 5, pcbY: -2.5, electrical: 'bidirectional' },
    { id: 'SCL', name: 'SCL', x: 12, y: 5, pcbX: 5, pcbY: 2.5, electrical: 'input' },
  ] },
};

export function createComponent(kind: PartKind, index = 1): EdaComponent {
  const part = PARTS[kind];
  if (!part || !Number.isSafeInteger(index) || index < 1 || index > 99999) throw new Error('Invalid part kind or index');
  return { id: `${kind}-${index}`, ref: `${part.prefix}${index}`, kind, value: part.defaultValue, schematic: { x: 40, y: 40, rotation: 0 }, pcb: { x: 20, y: 20, rotation: 0, side: 'top' }, locked: false };
}

export function pinPosition(component: EdaComponent, pinId: string, view: ViewMode): { x: number; y: number } {
  const pin = PARTS[component.kind]?.pins.find((item) => item.id === pinId);
  if (!pin) throw new Error(`Unknown pin ${component.ref}.${pinId}`);
  const position = component[view];
  const x = view === 'pcb' ? pin.pcbX : pin.x;
  const y = view === 'pcb' ? pin.pcbY : pin.y;
  const angle = position.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: position.x + x * cos - y * sin, y: position.y + x * sin + y * cos };
}

/** KiCad intentionally stacks physically equivalent pins, e.g. ESP32 module grounds. */
export function equivalentPinIds(component: EdaComponent, pinId: string): string[] {
  const part = PARTS[component.kind]; const pin = part.pins.find(p => p.id === pinId);
  if (!part.native || !pin) return [pinId];
  return part.pins.filter(p => p.x === pin.x && p.y === pin.y).map(p => p.id);
}
