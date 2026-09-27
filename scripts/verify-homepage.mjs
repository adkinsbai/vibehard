// Public, read-only checks: no cookies, model calls or account writes.
import assert from "node:assert/strict";
const base = process.argv[2];
assert.match(base ?? "", /^https?:\/\/(?:127\.0\.0\.1:(?:3210|3211|3212)|ldcx\.tech)\/vibehard$/);
const request = path => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
const home = await request(""); assert.equal(home.status, 200);
const html = await home.text();
for (const marker of ["即将开放注册使用，查看开放说明", "当前为邀请码内测", "text-xl font-bold", "sm:text-2xl", "云端 Agent 项目", "硬件方案与 BOM", "项目知识与审核", "原理图识别与申请", "知识库与开发板选型", "研发工具与流程演示", "原始文件下载尚未接入", "可能超时", "工作流示意 · 非实时任务", "演示不代表已完成真实硬件闭环", "使用已有邀请码注册"]) assert.ok(html.includes(marker), `Missing homepage content: ${marker}`);
for (const anchor of ["capabilities", "workflow", "access"]) { assert.ok(html.includes(`id="${anchor}"`)); assert.ok(html.includes(`href="#${anchor}"`)); }
assert.equal((html.match(/<article\b/g) ?? []).length, 6);
assert.ok(!html.includes("850+")); assert.ok(!html.includes("ESP32-S3-Touch"));
for (const path of ["/demo", "/login", "/register"]) { assert.ok(html.includes(`href="/vibehard${path}"`)); assert.equal((await request(path)).status, 200, path); }
const session = await request("/api/auth/session"); assert.equal(session.status, 200); assert.equal((await session.json()).authenticated, false);
const assets = new Set([...html.matchAll(/(?:src|href)="(\/vibehard\/_next\/[^\"]+\.(?:js|css))"/g)].map(match => match[1]));
assert.ok(assets.size > 0);
for (const path of assets) assert.equal((await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) })).status, 200, path);
console.log(JSON.stringify({ base, homepage: 200, featureCards: 6, prominentAnnouncement: true, anchors: 3, loginRegisterDemo: true, anonymousSession: true, assets: assets.size, noDataWritesOrModelCalls: true }));
