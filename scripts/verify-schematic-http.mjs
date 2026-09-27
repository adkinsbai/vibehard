// Explicit post-deployment synthetic test; no project writes or account changes.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
assert.equal(process.env.ALLOW_SCHEMATIC_MODEL_TEST, "synthetic-only");
const database = new URL(process.env.DATABASE_URL); assert.equal(database.pathname, "/vibehard");
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
const query = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-c", "select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='ldkj@admin.com' and role='admin'"], { env, encoding: "utf8" });
assert.equal(query.status, 0); const user = JSON.parse(query.stdout.trim()); assert.ok(user);
const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
const headers = { Cookie: `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}` };
const base = "https://ldcx.tech/vibehard";
const small = process.argv[2] === "--small";
async function upload(bytes, name) {
  const form = new FormData(); form.set("file", new Blob([bytes], { type: "application/pdf" }), name);
  return fetch(`${base}/api/schematic`, { method: "POST", headers, body: form, signal: AbortSignal.timeout(110_000) });
}
if (!small) {
  const tooLarge = await upload(Buffer.alloc(5 * 1024 * 1024 + 1), "oversized.pdf");
  assert.equal(tooLarge.status, 413);
  assert.match(tooLarge.headers.get("content-type"), /json/); // Application boundary, not nginx's HTML 413.
  console.log(JSON.stringify({ publicIngress: true, application5MiBLimit: true }));
}
const marker = `SCHEMATIC-${randomUUID()}`;
const drawing = `BT /F1 14 Tf 50 760 Td (SYNTHETIC SCHEMATIC - ${marker}) Tj ET
BT /F1 12 Tf 50 720 Td (VIN 3.3V -> R7 1000 ohm -> D2 LED -> GND) Tj ET
BT /F1 12 Tf 50 700 Td (No MCU. No hardware validation. One page only.) Tj ET
50 600 m 150 600 l S 150 590 70 20 re S 220 600 m 300 600 l S
BT /F1 12 Tf 150 625 Td (R7 1k) Tj ET
BT /F1 12 Tf 50 625 Td (3.3V) Tj ET
BT /F1 12 Tf 300 625 Td (D2 LED) Tj ET`;
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}\nendstream`];
// Valid PDF comments pad above nginx's old 1 MiB default; no extra model-visible content.
let pdf = "%PDF-1.4\n" + ("%" + "x".repeat(99) + "\n").repeat(small ? 0 : 11000); const offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const started = Date.now(); const response = await upload(Buffer.from(pdf), "synthetic-schematic.pdf");
assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /ndjson/);
const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
const failure = events.find(event => event.type === "error"); assert.ok(!failure, failure?.error);
const result = events.find(event => event.type === "result")?.result; assert.ok(result?.draft);
assert.ok((result.draft.title + result.draft.content).includes(marker));
assert.ok(result.draft.content.includes("R7") && result.draft.content.includes("D2"));
assert.equal(result.draft.kind, "schematic"); assert.match(result.fileSha256, /^[a-f0-9]{64}$/);
console.log(JSON.stringify({ publicModelRequest: true, fileBytes: Buffer.byteLength(pdf), model: result.model, markerRead: true, componentsRead: ["R7", "D2"], heartbeatCount: events.filter(event => event.type === "heartbeat").length, elapsedSeconds: (Date.now() - started) / 1000, noKnowledgeSubmitted: true }));
