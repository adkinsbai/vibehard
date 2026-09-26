import { describe, expect, it } from "vitest";
import { exportBomCsv, exportNetCsv, exportKicadPcb, exportKicadSchematic } from "@/lib/eda/kicad";
import { parseSExpression, quoteSExpression, type SExpression } from "@/lib/eda/sexpr";
import { PARTS, pinPosition, equivalentPinIds } from "@/lib/eda/library";
import type { EdaDocument, PartKind } from "@/lib/eda/types";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const list = (value: SExpression): SExpression[] => { if (!Array.isArray(value)) throw new Error("Expected list"); return value; };
const children = (value: SExpression, key: string) => list(value).filter((v): v is SExpression[] => Array.isArray(v) && v[0] === key);
const child = (value: SExpression, key: string) => { const found = children(value, key)[0]; if (!found) throw new Error(`Missing ${key}`); return found; };
function example(): EdaDocument {
  return { schemaVersion: 1, id: "test-circuit", name: "旋转 LED", revision: 1, board: { width: 80, height: 55 }, appliedBatchIds: [],
    components: [
      { id: "r1", ref: "R1", kind: "resistor", value: "1k", locked: false, schematic: { x: 30, y: 40, rotation: 90 }, pcb: { x: 20, y: 20, rotation: 90, side: "top" } },
      { id: "r2", ref: "R2", kind: "resistor", value: "2k", locked: false, schematic: { x: 60, y: 40, rotation: 270 }, pcb: { x: 50, y: 30, rotation: 270, side: "bottom" } },
    ], nets: [{ id: "n1", name: "signal", nodes: [{ componentId: "r1", pinId: "1" }, { componentId: "r2", pinId: "2" }] }],
    tracks: [{ id: "t1", netId: "n1", layer: "top", width: 0.25, points: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }] }],
  };
}

describe("KiCad deterministic exports", () => {
  it("places native schematic pins and labels on KiCad's 1.27 mm connection grid without changing the draft", () => {
    const doc = example();
    doc.components = [{ ...doc.components[0], kind: "r0603", schematic: { x: 10, y: 20, rotation: 0 } }];
    doc.nets = [{ id: "n1", name: "VCC", nodes: [{ componentId: "r1", pinId: "1" }] }];
    doc.tracks = [];
    const ast = parseSExpression(exportKicadSchematic(doc));
    const instance = children(ast, "symbol")[0];
    const label = children(ast, "global_label")[0];
    const onGrid = (value: SExpression) => {
      const units = Number(value) / 1.27;
      expect(Math.abs(units - Math.round(units))).toBeLessThan(1e-6);
    };
    for (const position of [child(instance, "at"), child(label, "at")]) {
      onGrid(position[1]); onGrid(position[2]);
    }
    expect(doc.components[0].schematic).toEqual({ x: 10, y: 20, rotation: 0 });
  });

  it("emits self contained library pins, placed instances, transformed net labels and deterministic unique UUIDs", () => {
    const doc = example(); const exported = exportKicadSchematic(doc); const ast = parseSExpression(exported);
    expect(exported).toBe(exportKicadSchematic(doc)); expect(list(ast)[0]).toBe("kicad_sch");
    const libraries = children(child(ast, "lib_symbols"), "symbol"); expect(libraries).toHaveLength(1);
    const libraryPins = children(child(libraries[0], "symbol"), "pin");
    // Pins can live in the unit sub-symbol; inspect each nested symbol.
    const allPins = children(libraries[0], "symbol").flatMap(v => children(v, "pin"));
    expect(allPins.length || libraryPins.length).toBe(PARTS.resistor.pins.length);
    const instances = children(ast, "symbol"); expect(instances).toHaveLength(2);
    for (const component of doc.components) {
      const instance = instances.find(v => children(v, "property").some(p => p[1] === "Reference" && p[2] === component.ref))!;
      expect(child(instance, "lib_id")[1]).toBe("VibeHard:resistor");
      expect(children(instance, "pin")).toHaveLength(PARTS.resistor.pins.length);
      expect(child(child(child(instance, "instances"), "project"), "path")[1]).toBe(`/${child(ast, "uuid")[1]}`);
    }
    const labels = children(ast, "global_label"); expect(labels).toHaveLength(2);
    for (const node of doc.nets[0].nodes) {
      const point = pinPosition(doc.components.find(v => v.id === node.componentId)!, node.pinId, "schematic");
      expect(labels.some(label => Number(child(label, "at")[1]) === point.x && Number(child(label, "at")[2]) === point.y)).toBe(true);
    }
    const ids = [...exported.matchAll(/\(uuid "?([a-f0-9-]+)"?\)/g)].map(v => v[1]);
    expect(ids.length).toBeGreaterThan(6); expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });

  it("writes PCB pads with matching pin numbers/net mapping, side, absolute angle, tracks and closed edge", () => {
    const doc = example(); const ast = parseSExpression(exportKicadPcb(doc));
    expect(list(ast)[0]).toBe("kicad_pcb");
    const footprints = children(ast, "footprint"); expect(footprints).toHaveLength(2);
    for (let i = 0; i < footprints.length; i++) {
      const fp = footprints[i]; const component = doc.components[i];
      expect(child(fp, "at").slice(1).map(Number)).toEqual([component.pcb.x, component.pcb.y, (360 - component.pcb.rotation) % 360]);
      expect(child(fp, "layer")[1]).toBe(i ? "B.Cu" : "F.Cu");
      const pads = children(fp, "pad"); expect(pads).toHaveLength(PARTS.resistor.pins.length);
      for (const pin of PARTS.resistor.pins) {
        const pad = pads.find(p => p[1] === pin.id)!;
        expect(child(pad, "at").slice(1).map(Number)).toEqual([pin.pcbX, pin.pcbY, (360 - component.pcb.rotation) % 360]);
        expect(child(pad, "layers").slice(1)).toEqual(i ? ["B.Cu", "B.Paste", "B.Mask"] : ["F.Cu", "F.Paste", "F.Mask"]);
        const connected = doc.nets[0].nodes.some(n => n.componentId === component.id && n.pinId === pin.id);
        expect(child(pad, "net").slice(1)).toEqual(connected ? ["1", "signal"] : ["0", ""]);
      }
    }
    expect(children(ast, "segment")).toHaveLength(2);
    for (const segment of children(ast, "segment")) { expect(child(segment, "net")[1]).toBe("1"); expect(child(segment, "layer")[1]).toBe("F.Cu"); }
    const edge = child(ast, "gr_rect"); expect(child(edge, "start").slice(1)).toEqual(["0", "0"]); expect(child(edge, "end").slice(1)).toEqual(["80", "55"]); expect(child(edge, "layer")[1]).toBe("Edge.Cuts");
  });

  it("exports every generic library kind without claiming manufacturer verified pinouts", () => {
    const doc = example(); doc.nets = []; doc.tracks = []; doc.components = (Object.keys(PARTS) as PartKind[]).map((kind, i) => ({ ...doc.components[0], id: `c${i}`, ref: `X${i + 1}`, kind, schematic: { x: 20 + i * 20, y: 30, rotation: 0 } }));
    const ast = parseSExpression(exportKicadSchematic(doc));
    expect(children(child(ast, "lib_symbols"), "symbol")).toHaveLength(Object.keys(PARTS).length);
    expect(exportKicadPcb(doc)).toContain("UNVERIFIED");
  });

  it("escapes KiCad quoted text and protects all spreadsheet formula cells", () => {
    const doc = example(); doc.components[0].value = '=HYPERLINK("https://example.com","click")';
    const ast = parseSExpression(exportKicadSchematic(doc));
    expect(children(children(ast, "symbol")[0], "property").find(p => p[1] === "Value")?.[2]).toBe(doc.components[0].value);
    expect(exportBomCsv(doc)).toContain('"\'=HYPERLINK(""https://example.com"",""click"")"');
    expect(exportBomCsv(doc).split("\r\n")[0]).toBe('"Ref","Value","Kind","Footprint","Quantity"');
    doc.nets[0].name = '=1+1';
    expect(exportNetCsv(doc)).toContain('"\'=1+1"');
    for (const value of ["+1", "-1", "@sum(1)", "\t=1", "  =1", "\r=1"]) { doc.components[0].value = value; expect(exportBomCsv(doc)).toContain(`"'${value}"`); }
    expect(parseSExpression(`(test ${quoteSExpression('a"b\\c\n中文')})`)).toEqual(["test", 'a"b\\c\n中文']);
  });

  it("rejects invalid graphs instead of exporting silently disconnected native files", () => {
    const doc = example(); doc.nets[0].nodes[0].pinId = "999";
    expect(() => exportKicadSchematic(doc)).toThrow(); expect(() => exportKicadPcb(doc)).toThrow();
  });
  it("rejects duplicate net names and coincident differently-connected schematic pins", () => {
    const duplicate = example(); duplicate.nets.push({ id: "n2", name: "signal", nodes: [{ componentId: "r1", pinId: "2" }] });
    expect(() => exportKicadSchematic(duplicate)).toThrow(/net|网络/i);
    const overlap = example(); overlap.components[1].schematic = { ...overlap.components[0].schematic };
    expect(() => exportKicadSchematic(overlap)).toThrow(/coincid|overlap|重叠/i);
  });
  it("strictly rejects malformed or excessively nested S-expressions", () => {
    for (const source of ['(a "unterminated)', "(a))", "(a) (b)", "(".repeat(200) + ")".repeat(200)]) expect(() => parseSExpression(source)).toThrow();
  });
  it.skipIf(!process.env.KICAD_CLI)("native KiCad preserves catalog and legacy pins under four rotations and reads bottom-pad geometry", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "vibehard-export-test-"));
    try {
      const doc = example(); doc.components = []; doc.nets = []; doc.tracks = [];
      let index = 0;
      for (const rotation of [0, 90, 180, 270]) for (const kind of Object.keys(PARTS) as PartKind[]) {
        const component = { ...example().components[0], id: `part-${index}`, ref: `X${index + 1}`, kind, schematic: { x: 80 + (index % 7) * 150, y: 80 + Math.floor(index / 7) * 150, rotation } };
        doc.components.push(component);
        const seen = new Set<string>();
        for (const pin of PARTS[kind].pins) {
          if (pin.electrical === 'no_connect') continue;
          if (seen.has(pin.id)) continue;
          const ids = equivalentPinIds(component, pin.id); ids.forEach(id => seen.add(id));
          doc.nets.push({ id: `net-${index}-${pin.id}`, name: `N_${index}_${pin.id}`, nodes: ids.map(id => ({ componentId: component.id, pinId: id })) });
        }
        index++;
      }
      const schematic = path.join(directory, "test.kicad_sch"); const netlist = path.join(directory, "test.net");
      writeFileSync(schematic, exportKicadSchematic(doc));
      execFileSync(process.env.KICAD_CLI!, ["sch", "export", "netlist", "-o", netlist, schematic], { timeout: 60_000, windowsHide: true });
      const nativeNets = children(child(parseSExpression(readFileSync(netlist, "utf8")), "nets"), "net");
      const observed = nativeNets.filter(net => !String(child(net, 'name')[1]).startsWith('unconnected-')).map(net => ({ name: child(net, "name")[1], nodes: children(net, "node").map(node => `${child(node, "ref")[1]}.${child(node, "pin")[1]}`).sort() }));
      const expected = doc.nets.map(net => ({ name: net.name, nodes: net.nodes.map(node => `${doc.components.find(c => c.id === node.componentId)!.ref}.${node.pinId}`).sort() }));
      expect(observed.sort((a, b) => String(a.name).localeCompare(String(b.name)))).toEqual(expected.sort((a, b) => a.name.localeCompare(b.name)));

      const pcbDoc = example(); pcbDoc.tracks = [];
      const pcb = path.join(directory, "test.kicad_pcb"); const report = path.join(directory, "drc.json");
      const content = exportKicadPcb(pcbDoc); writeFileSync(pcb, content);
      execFileSync(process.env.KICAD_CLI!, ["pcb", "drc", "--format", "json", "-o", report, pcb], { timeout: 60_000, windowsHide: true });
      const result = JSON.parse(readFileSync(report, "utf8")) as { unconnected_items: { items: { uuid: string; pos: { x: number; y: number } }[] }[] };
      const reported = result.unconnected_items.flatMap(item => item.items);
      expect(result.unconnected_items.length).toBeGreaterThan(0); // Unrouted is accurately reported, never claimed DRC-clean.
      const fps = children(parseSExpression(content), "footprint");
      for (const node of pcbDoc.nets[0].nodes) {
        const componentIndex = pcbDoc.components.findIndex(c => c.id === node.componentId);
        const pad = children(fps[componentIndex], "pad").find(p => p[1] === node.pinId)!;
        const actual = reported.find(item => item.uuid === child(pad, "uuid")[1]);
        const expected = pinPosition(pcbDoc.components[componentIndex], node.pinId, "pcb");
        expect(actual).toBeDefined(); expect(actual!.pos.x).toBeCloseTo(expected.x, 5); expect(actual!.pos.y).toBeCloseTo(expected.y, 5);
      }
      // Exercise the actual native footprint forms (courtyards, drills, pad shapes and keepouts).
      const nativeBoard = example(); nativeBoard.nets = []; nativeBoard.tracks = []; nativeBoard.board = { width: 300, height: 100 };
      nativeBoard.components = (Object.keys(PARTS) as PartKind[]).filter(kind => PARTS[kind].native).map((kind, i) => ({ ...example().components[0], id: `native-${i}`, ref: `X${i + 1}`, kind, pcb: { x: 25 + i * 35, y: 40, rotation: i % 2 ? 90 : 0, side: i % 2 ? 'bottom' as const : 'top' as const } }));
      writeFileSync(pcb, exportKicadPcb(nativeBoard));
      execFileSync(process.env.KICAD_CLI!, ['pcb', 'drc', '--format', 'json', '-o', report, pcb], { timeout: 60_000, windowsHide: true });
      expect(JSON.parse(readFileSync(report, 'utf8'))).toHaveProperty('violations');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 180_000);
});
