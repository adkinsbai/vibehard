import type { PartDefinition } from '@/lib/eda/library';
import type { SExpression } from '@/lib/eda/sexpr';
type Node = SExpression[];
const field = (node: Node, key: string) => node.find((v): v is Node => Array.isArray(v) && v[0] === key) ?? [];
const coord = (node: Node, key: string) => { const p = field(node, key); return { x: Number(p[1]), y: -Number(p[2]) }; };
export function NativeSymbol({ part, stroke }: { part: PartDefinition; stroke: string }) {
  if (!part.native) return null;
  return <g fill="none" stroke={stroke} strokeWidth=".254">
    {part.native.graphics.map((node, index) => {
      if (node[0] === 'rectangle') { const a = coord(node, 'start'); const b = coord(node, 'end'); return <rect key={index} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} fill="#fff" />; }
      if (node[0] === 'circle') { const p = coord(node, 'center'); return <circle key={index} cx={p.x} cy={p.y} r={Number(field(node, 'radius')[1])} />; }
      if (node[0] === 'polyline') { const points = field(node, 'pts').slice(1).filter((v): v is Node => Array.isArray(v)).map(p => `${p[1]},${-Number(p[2])}`).join(' '); return <polyline key={index} points={points} />; }
      if (node[0] === 'arc') {
        const a = coord(node, 'start'); const b = coord(node, 'mid'); const c = coord(node, 'end');
        const cross = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(cross) < 1e-8) return <line key={index} x1={a.x} y1={a.y} x2={c.x} y2={c.y} />;
        const aa = a.x*a.x + a.y*a.y; const bb = b.x*b.x + b.y*b.y; const cc = c.x*c.x + c.y*c.y;
        const cx = (aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/cross;
        const cy = (aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/cross;
        const r = Math.hypot(a.x-cx,a.y-cy); const start = Math.atan2(a.y-cy,a.x-cx); const end = Math.atan2(c.y-cy,c.x-cx);
        const sweep = cross > 0 ? 1 : 0; const delta = ((sweep ? end-start : start-end)+Math.PI*2)%(Math.PI*2);
        return <path key={index} d={`M ${a.x} ${a.y} A ${r} ${r} 0 ${delta > Math.PI ? 1 : 0} ${sweep} ${c.x} ${c.y}`} />;
      }
      return null;
    })}
    {part.pins.map(pin => { const a = (pin.angle ?? 0) * Math.PI / 180; const length = pin.length ?? 0; return <line key={pin.id} x1={pin.x} y1={pin.y} x2={pin.x + Math.cos(a) * length} y2={pin.y - Math.sin(a) * length} />; })}
  </g>;
}
export function NativePads({ part }: { part: PartDefinition }) {
  return <g>{part.native?.pads.map((pad, index) => <g key={index} transform={`translate(${pad.x} ${pad.y}) rotate(${-pad.rotation})`}><rect x={-pad.width / 2} y={-pad.height / 2} width={pad.width} height={pad.height} rx={pad.shape === 'circle' ? Math.min(pad.width, pad.height) / 2 : pad.shape === 'roundrect' ? Math.min(pad.width, pad.height) * .25 : 0} fill="#dfb068" />{pad.drill > 0 && <circle r={pad.drill / 2} fill="#142e29" />}</g>)}</g>;
}
