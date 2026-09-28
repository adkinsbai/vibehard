import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PARTS, pinPosition } from './library';
import { parseSExpression, type SExpression } from './sexpr';
import type { EdaComponent } from './types';

type Form = SExpression[];
const forms = (node: Form, tag: string): Form[] => node.filter((item): item is Form => Array.isArray(item) && item[0] === tag);
const one = (node: Form, tag: string): Form => forms(node, tag)[0] ?? [];
const safePath = (path: string) => path.length <= 180 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)
  && path.split('/').every(part => part !== '.' && part !== '..' && part.length > 0 && !/[. ]$/.test(part))
  && !path.split('/').some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
const pathSchema = z.string().refine(safePath, 'Unsafe package path');
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  moduleId: z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/).max(120),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  verification: z.enum(['software-fixture', 'pending-review', 'reviewed']),
  description: z.string().trim().min(1).max(400),
  review: z.strictObject({ reviewer: z.string().trim().min(1).max(120), reviewedAt: z.iso.date(), source: z.string().trim().min(1).max(120) }).optional(),
  entrySchematic: pathSchema,
  files: z.array(z.strictObject({ path: pathSchema, role: z.enum(['schematic', 'symbol_library', 'footprint_library', 'project', 'datasheet', 'pcb_design_block']), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(64),
  ports: z.array(z.strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), name: z.string().trim().min(1).max(120), label: z.string().regex(/^[A-Za-z][A-Za-z0-9_/-]{0,63}$/),
    direction: z.enum(['input', 'output', 'bidirectional', 'tri_state', 'passive']), signal: z.enum(['power', 'ground', 'digital', 'analog', 'rf', 'other']), required: z.boolean(),
    voltage: z.strictObject({ min: z.number().finite(), max: z.number().finite() }).refine(value => value.min <= value.max).optional(),
    terminal: z.strictObject({ reference: z.string().regex(/^[A-Za-z]+[1-9][0-9]*$/), pin: z.string().min(1).max(32) }),
  })).min(1).max(128),
}).refine(value => value.verification !== 'reviewed' || Boolean(value.review), 'Reviewed modules require review metadata');
export type ModuleManifest = z.infer<typeof manifestSchema>;

function unique(values: string[], what: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${what}`);
}

/** Intake checks do not certify the electrical circuit or release it to production. */
export function validateModulePackage(input: unknown, payloads: Record<string, Uint8Array>) {
  const manifest = manifestSchema.parse(input);
  unique(manifest.files.map(file => file.path.toLowerCase()), 'file path');
  unique(manifest.ports.map(port => port.id), 'port ID');
  unique(manifest.ports.map(port => port.label), 'port label');
  unique(manifest.ports.map(port => `${port.terminal.reference}.${port.terminal.pin}`), 'port terminal');
  const entry = manifest.files.find(file => file.path === manifest.entrySchematic && file.role === 'schematic');
  if (!entry || !entry.path.endsWith('.kicad_sch')) throw new Error('Entry schematic must be a declared .kicad_sch file');
  if (Object.keys(payloads).length !== manifest.files.length) throw new Error('Package is missing declared files or has undeclared files');
  let totalBytes = 0;
  for (const path of Object.keys(payloads)) if (!safePath(path) || !manifest.files.some(file => file.path === path)) throw new Error(`Unsafe or undeclared package path: ${path}`);
  for (const file of manifest.files) {
    const bytes = payloads[file.path];
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 20_000_000) throw new Error(`Invalid file size: ${file.path}`);
    totalBytes += bytes.byteLength;
    if (totalBytes > 100_000_000) throw new Error('Module package exceeds 100 MB');
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`SHA256 mismatch: ${file.path}`);
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(payloads[entry.path]);
  const root = parseSExpression(source);
  if (!Array.isArray(root) || root[0] !== 'kicad_sch') throw new Error('Entry is not a KiCad schematic');
  if (forms(root, 'sheet').length) throw new Error('Nested module sheets require a separate native dependency check');
  if (forms(root, 'global_label').length) throw new Error('Global labels may connect outside declared module ports');
  const labels = forms(root, 'hierarchical_label');
  unique(labels.map(label => String(label[1])), 'hierarchical label');
  const instances = forms(root, 'symbol');
  for (const port of manifest.ports) {
    const label = labels.find(item => item[1] === port.label);
    if (!label) throw new Error(`Missing hierarchical label: ${port.label}`);
    if (String(one(label, 'shape')[1]) !== port.direction) throw new Error(`Hierarchical label direction mismatch: ${port.label}`);
    const symbol = instances.find(item => forms(item, 'property').some(property => property[1] === 'Reference' && property[2] === port.terminal.reference));
    if (!symbol) throw new Error(`Missing terminal reference: ${port.terminal.reference}`);
    const libraryId = String(one(symbol, 'lib_id')[1]);
    const part = Object.values(PARTS).find(item => item.native?.libraryId === libraryId);
    if (!part || !part.pins.some(pin => pin.id === port.terminal.pin)) throw new Error(`Unknown native terminal pin: ${port.terminal.reference}.${port.terminal.pin}`);
    const at = one(symbol, 'at'); const location = one(label, 'at');
    const component = { kind: part.kind, ref: port.terminal.reference, schematic: { x: Number(at[1]), y: Number(at[2]), rotation: (360 - Number(at[3] || 0)) % 360 } } as EdaComponent;
    const terminal = pinPosition(component, port.terminal.pin, 'schematic');
    if (Math.abs(terminal.x - Number(location[1])) > 0.01 || Math.abs(terminal.y - Number(location[2])) > 0.01) throw new Error(`Port label is not on terminal pin: ${port.label}`);
  }
  for (const label of labels) if (!manifest.ports.some(port => port.label === label[1])) throw new Error(`Undeclared hierarchical label: ${label[1]}`);
  const packageSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  return { manifest, packageSha256, totalBytes, nativeCheckRequired: true as const };
}

/** Compare KiCad CLI's exported netlist with the manifest; never infer nets from artwork alone. */
export function verifyModuleNetlist(input: unknown, source: string) {
  const manifest = manifestSchema.parse(input);
  const root = parseSExpression(source);
  if (!Array.isArray(root) || root[0] !== 'export') throw new Error('KiCad did not return a valid native netlist');
  const nets = forms(one(root, 'nets'), 'net').map(net => ({
    name: String(one(net, 'name')[1]).replace(/^\//, ''),
    terminals: forms(net, 'node').map(node => `${one(node, 'ref')[1]}.${one(node, 'pin')[1]}`),
  }));
  unique(nets.map(net => net.name.toUpperCase()), 'native network name');
  const portNets: Record<string, string> = {};
  for (const port of manifest.ports) {
    const matching = nets.filter(net => net.terminals.includes(`${port.terminal.reference}.${port.terminal.pin}`));
    if (matching.length !== 1 || matching[0].name !== port.label) throw new Error(`Native network mismatch for module port ${port.id}`);
    portNets[port.id] = matching[0].name;
  }
  if (new Set(Object.values(portNets)).size !== manifest.ports.length) throw new Error('Module ports are shorted onto the same native network');
  return { portNets, internalNetCount: nets.length - manifest.ports.length };
}
