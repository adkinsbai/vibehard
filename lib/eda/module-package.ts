import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseSExpression, type SExpression } from './sexpr';

const safePath = (path: string) => path.length <= 180 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)
  && path.split('/').every(part => part !== '.' && part !== '..' && part.length > 0 && !/[. ]$/.test(part))
  && !path.split('/').some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
const pathSchema = z.string().refine(safePath, 'Unsafe package path');
const nameSchema = z.string().trim().min(1).max(120);
const portSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: nameSchema,
  label: z.string().regex(/^[A-Za-z][A-Za-z0-9_/-]{0,63}$/),
  direction: z.enum(['input', 'output', 'bidirectional', 'tri_state', 'passive']),
  signal: z.enum(['power', 'ground', 'digital', 'analog', 'rf', 'other']),
  required: z.boolean(),
  voltage: z.strictObject({ min: z.number().finite(), max: z.number().finite() })
    .refine(range => range.min <= range.max, 'Invalid voltage range').optional(),
});
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  moduleId: z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/).max(120),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  review: z.strictObject({ reviewer: nameSchema, reviewedAt: z.iso.date(), source: nameSchema }),
  entrySchematic: pathSchema,
  files: z.array(z.strictObject({
    path: pathSchema,
    role: z.enum(['schematic', 'symbol_library', 'footprint_library', 'project', 'datasheet', 'pcb_design_block']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).min(1).max(64),
  ports: z.array(portSchema).min(1).max(128),
});

export type ModuleManifest = z.infer<typeof manifestSchema>;

function unique(values: string[], what: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${what}`);
}

/** Structural intake only. KiCad CLI/ERC, library provenance, and engineer approval remain separate release gates. */
export function validateModulePackage(input: unknown, payloads: Record<string, Uint8Array>): {
  manifest: ModuleManifest; packageSha256: string; totalBytes: number; nativeCheckRequired: true;
} {
  const manifest = manifestSchema.parse(input);
  unique(manifest.files.map(file => file.path.toLowerCase()), 'file path');
  unique(manifest.ports.map(port => port.id), 'port ID');
  unique(manifest.ports.map(port => port.label), 'port label mapping');
  const entry = manifest.files.find(file => file.path === manifest.entrySchematic && file.role === 'schematic');
  if (!entry || !manifest.entrySchematic.endsWith('.kicad_sch')) throw new Error('Entry schematic must be a declared .kicad_sch file');
  const expected = new Set(manifest.files.map(file => file.path));
  const provided = Object.keys(payloads);
  for (const path of provided) if (!safePath(path) || !expected.has(path)) throw new Error(`Unsafe or undeclared package path: ${path}`);
  if (provided.length !== expected.size) throw new Error('Package is missing declared files');
  let totalBytes = 0;
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
  const forms = root.filter((item): item is SExpression[] => Array.isArray(item));
  if (forms.some(form => form[0] === 'sheet')) throw new Error('Nested module sheets require a separate native dependency check');
  if (forms.some(form => form[0] === 'global_label')) throw new Error('Global labels may connect outside declared module ports');
  const labels = forms.filter(form => form[0] === 'hierarchical_label');
  const byLabel = new Map<string, string>();
  for (const label of labels) {
    const name = String(label[1] ?? '');
    const shape = label.find((item): item is SExpression[] => Array.isArray(item) && item[0] === 'shape');
    if (byLabel.has(name)) throw new Error(`Duplicate hierarchical label: ${name}`);
    byLabel.set(name, String(shape?.[1] ?? ''));
  }
  for (const port of manifest.ports) {
    if (!byLabel.has(port.label)) throw new Error(`Missing hierarchical label: ${port.label}`);
    if (byLabel.get(port.label) !== port.direction) throw new Error(`Hierarchical label direction/shape mismatch: ${port.label}`);
  }
  for (const label of byLabel.keys()) if (!manifest.ports.some(port => port.label === label)) throw new Error(`Undeclared hierarchical label: ${label}`);
  // The manifest binds all verified file hashes. Hashing its normalized parsed form
  // gives the project a stable logical package identity independent of ZIP metadata.
  const packageSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  return { manifest, packageSha256, totalBytes, nativeCheckRequired: true };
}
