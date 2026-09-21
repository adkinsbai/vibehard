// Read-only provider compatibility check. Never creates users/projects or changes settings.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { callLlm } from "@/lib/server/llm-client";
import { runtimeLlm } from "@/lib/server/llm-settings";
import { closeDb } from "@/lib/db";
import { SCHEMATIC_SYSTEM, schematicModelResultSchema } from "@/lib/agent/schematic";

function fixturePdf(marker: string) {
  const drawing = `BT /F1 14 Tf 50 760 Td (SYNTHETIC SCHEMATIC - ${marker}) Tj ET
BT /F1 12 Tf 50 720 Td (VIN 3.3V -> R7 1000 ohm -> D2 LED -> GND) Tj ET
BT /F1 12 Tf 50 700 Td (No MCU. No hardware validation. One page only.) Tj ET
50 600 m 150 600 l S 150 590 70 20 re S 220 600 m 300 600 l S
BT /F1 12 Tf 150 625 Td (R7 1k) Tj ET
BT /F1 12 Tf 50 625 Td (3.3V) Tj ET
BT /F1 12 Tf 300 625 Td (D2 LED) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf).toString("base64");
}

async function main() {
  assert.equal(process.env.ALLOW_SCHEMATIC_MODEL_TEST, "synthetic-only");
  const config = await runtimeLlm("design"); assert.ok(config, "No configured model");
  const marker = `SCHEMATIC-${randomUUID()}`;
  const started = Date.now();
  const text = await callLlm(config, SCHEMATIC_SYSTEM, "请分析附件原理图，在正文保留图纸标题中的唯一标识，按要求返回 JSON。", undefined, 90_000, { filename: "synthetic-schematic.pdf", mimeType: "application/pdf", base64: fixturePdf(marker) });
  const result = schematicModelResultSchema.parse(JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
  assert.ok(result.markdown.includes(marker), "Model did not read unique PDF content");
  assert.ok(/R7/.test(result.markdown) && /D2/.test(result.markdown), "Expected component references missing");
  console.log(JSON.stringify({ model: config.model, protocol: config.protocol, pdfInputRead: true, uniqueMarker: true, componentsRead: ["R7", "D2"], elapsedSeconds: (Date.now() - started) / 1000, result }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; }).finally(closeDb);
