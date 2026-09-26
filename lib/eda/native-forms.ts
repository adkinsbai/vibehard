/** Lossless child forms: retains KiCad atoms/quoted strings without guessing token kinds. */
export function childForms(source: string): string[] {
  const forms: string[] = []; let depth = 0; let start = 0; let quoted = false; let escape = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') quoted = false; continue; }
    if (ch === '"') { quoted = true; continue; }
    if (ch === '(') { depth++; if (depth === 2) start = i; }
    if (ch === ')') { if (depth === 2) forms.push(source.slice(start, i + 1)); depth--; if (depth < 0) throw new Error('Unbalanced native form'); }
  }
  if (quoted || depth) throw new Error('Unbalanced native form');
  return forms;
}
export const formTag = (source: string) => /^\(\s*([^\s()]+)/.exec(source)?.[1] ?? '';
export function replaceChild(source: string, tag: string, replacement: string) {
  const prior = childForms(source).find(form => formTag(form) === tag);
  return prior ? source.replace(prior, replacement) : source.slice(0, -1) + ` ${replacement})`;
}
