/** Small bounded S-expression reader for inspection, not a native EDA importer. */
export type SExpression = string | SExpression[];

export function quoteSExpression(text: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("Unsupported control character in KiCad text");
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
}

export function parseSExpression(source: string): SExpression {
  if (source.length > 20_000_000) throw new Error("S-expression exceeds 20 MB limit");
  let index = 0; let count = 0;
  const space = () => { while (index < source.length) { if (/\s/.test(source[index])) index++; else if (source[index] === ";") { while (index < source.length && source[index] !== "\n") index++; } else break; } };
  const read = (depth: number): SExpression => {
    if (depth > 128 || ++count > 1_000_000) throw new Error("S-expression nesting or item limit exceeded");
    space(); const char = source[index++];
    if (char === "(") {
      const result: SExpression[] = []; space();
      while (index < source.length && source[index] !== ")") { result.push(read(depth + 1)); space(); }
      if (source[index++] !== ")") throw new Error("Unclosed S-expression");
      return result;
    }
    if (char === '"') {
      let result = "";
      while (index < source.length) {
        const current = source[index++]; if (current === '"') return result;
        if (current === "\\") { const next = source[index++]; if (next === undefined) break; result += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[next] ?? next; }
        else result += current;
      }
      throw new Error("Unterminated S-expression string");
    }
    if (char === undefined || char === ")") throw new Error("Unexpected end or closing parenthesis");
    let atom = char;
    while (index < source.length && !/[\s();]/.test(source[index])) atom += source[index++];
    return atom;
  };
  const result = read(0); space(); if (index !== source.length) throw new Error("Trailing S-expression content"); return result;
}
