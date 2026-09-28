import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { isKnowledgeReviewer } from '@/lib/agent/knowledge';
import { db } from '@/lib/db';
import { auditLogs, edaModuleVersions, users } from '@/lib/db/schema';
import { compileNativeModule, publicModuleDefinitions, publishModuleVersion, type ModuleVersionRecord } from '@/lib/eda/module-catalog';
import { validateModulePackage, type ModuleManifest } from '@/lib/eda/module-package';
import { catalogFromDefinitions, type ModuleCatalog } from '@/lib/eda/modules';
import { z } from 'zod';

const execute = promisify(execFile);
export class EdaModuleCatalogError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export function moduleMutationSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const target = new URL(request.url);
    const source = new URL(origin);
    return source.host === (request.headers.get('host') ?? target.host) && source.protocol === target.protocol;
  } catch { return false; }
}

function requireCatalogDb() {
  if (!db) throw new EdaModuleCatalogError('模块目录数据库尚未配置', 503);
  return db;
}

export function configuredHardwareReviewerIds(value = process.env.EDA_HARDWARE_REVIEWER_IDS): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  const ids = value.split(',').map(id => id.trim());
  if (ids.some(id => !z.uuid().safeParse(id).success)) return new Set();
  return new Set(ids);
}

function decodePayloads(filesBase64: unknown): Record<string, Uint8Array> {
  if (!filesBase64 || typeof filesBase64 !== 'object' || Array.isArray(filesBase64)) throw new EdaModuleCatalogError('缺少模块原生文件');
  const entries = Object.entries(filesBase64);
  if (!entries.length || entries.length > 64) throw new EdaModuleCatalogError('模块文件数量超限');
  let bytes = 0;
  const payloads: Record<string, Uint8Array> = Object.create(null);
  for (const [path, encoded] of entries) {
    if (typeof encoded !== 'string' || encoded.length > 2_800_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new EdaModuleCatalogError('模块文件编码无效');
    const data = Buffer.from(encoded, 'base64');
    bytes += data.byteLength;
    if (bytes > 2_000_000) throw new EdaModuleCatalogError('当前受控导入最多支持 2 MB 原生文件');
    payloads[path] = data;
  }
  return payloads;
}

/** KiCad is executed on a private temporary copy; output is never taken from a caller-supplied path. */
async function exportNativeNetlist(manifest: ModuleManifest, payloads: Record<string, Uint8Array>, signal?: AbortSignal): Promise<{ netlist: string; kicadVersion: string }> {
  const managerUrl = process.env.NODE_ENV === 'production' ? process.env.EDA_MANAGER_URL : process.env.EDA_DESKTOP_URL;
  const tokenFile = process.env.NODE_ENV === 'production' ? process.env.EDA_MANAGER_TOKEN_FILE : process.env.EDA_DESKTOP_TOKEN_FILE;
  if (managerUrl || tokenFile || process.env.NODE_ENV === 'production') {
    if (!managerUrl || !tokenFile) throw new EdaModuleCatalogError('私有 KiCad 校验服务尚未配置', 503);
    let endpoint: URL;
    try { endpoint = new URL(managerUrl); }
    catch { throw new EdaModuleCatalogError('私有 KiCad 校验服务配置无效', 503); }
    if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new EdaModuleCatalogError('私有 KiCad 校验服务只能使用本机回环地址', 503);
    let token: string;
    try { token = (await readFile(tokenFile, 'utf8')).trim(); }
    catch { throw new EdaModuleCatalogError('私有 KiCad 校验令牌不可用', 503); }
    if (!token) throw new EdaModuleCatalogError('私有 KiCad 校验令牌为空', 503);
    const filesBase64 = Object.fromEntries(Object.entries(payloads).map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]));
    let response: Response;
    try {
      response = await fetch(new URL('/v1/modules/verify', endpoint), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, filesBase64 }), cache: 'no-store', redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70_000)]) : AbortSignal.timeout(70_000),
      });
    } catch { throw new EdaModuleCatalogError('私有 KiCad 校验服务暂时不可用', 503); }
    if (!response.ok) throw new EdaModuleCatalogError('私有 KiCad 校验服务未通过原生网表检查', 422);
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new EdaModuleCatalogError('私有 KiCad 校验结果无效', 503); }
    if (!result || typeof result !== 'object' || !('netlist' in result) || typeof result.netlist !== 'string' || result.netlist.length > 2_000_000
      || !('kicadVersion' in result) || typeof result.kicadVersion !== 'string' || !/^9\./.test(result.kicadVersion)) throw new EdaModuleCatalogError('KiCad 校验结果无效或与当前受控库版本不兼容', 503);
    return { netlist: result.netlist, kicadVersion: result.kicadVersion };
  }
  // Developer-only fallback. Production must use the isolated manager and never run uploaded KiCad files in Next's host process.
  const directory = await mkdtemp(join(tmpdir(), 'vibehard-module-intake-'));
  try {
    let kicadVersion: string;
    try { kicadVersion = (await execute(process.env.KICAD_CLI_PATH || 'kicad-cli', ['--version'], { timeout: 5_000, maxBuffer: 64_000, windowsHide: true, signal })).stdout.trim(); }
    catch { throw new EdaModuleCatalogError('本地 KiCad CLI 不可用', 503); }
    if (!/^9\./.test(kicadVersion)) throw new EdaModuleCatalogError('模块原生校验仅支持 KiCad 9', 503);
    for (const [path, bytes] of Object.entries(payloads)) {
      const file = join(directory, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes, { flag: 'wx' });
    }
    const output = join(directory, `${randomUUID()}.net`);
    try {
      await execute(process.env.KICAD_CLI_PATH || 'kicad-cli', ['sch', 'export', 'netlist', '--output', output, join(directory, manifest.entrySchematic)], {
        cwd: directory, timeout: 60_000, maxBuffer: 250_000, windowsHide: true, signal,
      });
    } catch { throw new EdaModuleCatalogError('KiCad 未能导出模块网表；原生校验未通过'); }
    const data = await readFile(output, 'utf8');
    if (data.length > 2_000_000) throw new EdaModuleCatalogError('KiCad 网表超出允许大小');
    return { netlist: data, kicadVersion };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function submitNativeModule(actorId: string, input: { manifest: unknown; filesBase64: unknown }, signal?: AbortSignal) {
  const database = requireCatalogDb();
  const [actor] = await database.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
  if (!actor || !isKnowledgeReviewer(actor.role)) throw new EdaModuleCatalogError('仅管理员或开发者可以提交模块', 403);
  const payloads = decodePayloads(input.filesBase64);
  let structural;
  try { structural = validateModulePackage(input.manifest, payloads); }
  catch { throw new EdaModuleCatalogError('模块清单、端口、路径或文件哈希校验失败'); }
  if (structural.manifest.verification === 'software-fixture' || structural.manifest.moduleId.startsWith('sample.')) throw new EdaModuleCatalogError('软件测试样板不能提交为正式模块候选');
  const native = await exportNativeNetlist(structural.manifest, payloads, signal);
  let compiled;
  try { compiled = compileNativeModule(structural.manifest, payloads, native.netlist); }
  catch { throw new EdaModuleCatalogError('模块网表、器件、封装或 PCB 设计块校验失败'); }
  const encoded = Object.fromEntries(Object.entries(payloads).map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]));
  return database.transaction(async tx => {
    const [currentActor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).for('share');
    if (!currentActor || !isKnowledgeReviewer(currentActor.role)) throw new EdaModuleCatalogError('仅管理员或开发者可以提交模块', 403);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`eda-module:${compiled.manifest.moduleId}@${compiled.manifest.version}`}))`);
    const [existing] = await tx.select({ id: edaModuleVersions.id }).from(edaModuleVersions).where(and(eq(edaModuleVersions.moduleId, compiled.manifest.moduleId), eq(edaModuleVersions.version, compiled.manifest.version))).limit(1);
    if (existing) throw new EdaModuleCatalogError('该模块版本已存在；版本不可覆盖', 409);
    const [row] = await tx.insert(edaModuleVersions).values({
      moduleId: compiled.manifest.moduleId, version: compiled.manifest.version, packageSha256: compiled.packageSha256,
      manifest: compiled.manifest, payloadsBase64: encoded, definition: compiled.definition, submittedBy: actorId,
    }).returning({ id: edaModuleVersions.id, moduleId: edaModuleVersions.moduleId, version: edaModuleVersions.version, packageSha256: edaModuleVersions.packageSha256, status: edaModuleVersions.status });
    await tx.insert(auditLogs).values({ userId: actorId, action: 'eda.module.submitted', metadata: { moduleId: row.moduleId, version: row.version, packageSha256: row.packageSha256, kicadVersion: native.kicadVersion } });
    return row;
  });
}

export async function reviewNativeModule(actorId: string, id: string, reviewReference: string) {
  const database = requireCatalogDb();
  const hardwareReviewers = configuredHardwareReviewerIds();
  if (!hardwareReviewers.has(actorId)) throw new EdaModuleCatalogError('未配置硬件工程师审核身份，或当前账号不在授权名单', 403);
  const [candidate] = await database.select().from(edaModuleVersions).where(eq(edaModuleVersions.id, id)).limit(1);
  if (!candidate) throw new EdaModuleCatalogError('模块版本不存在', 404);
  const source = decodePayloads(candidate.payloadsBase64);
  let fresh;
  let reviewKicadVersion = '';
  try {
    const check = validateModulePackage(candidate.manifest, source);
    if (check.packageSha256 !== candidate.packageSha256) throw new Error('hash');
    const native = await exportNativeNetlist(candidate.manifest, source);
    reviewKicadVersion = native.kicadVersion;
    fresh = compileNativeModule(candidate.manifest, source, native.netlist);
    if (JSON.stringify(fresh.definition) !== JSON.stringify(candidate.definition)) throw new Error('definition');
  } catch { throw new EdaModuleCatalogError('模块原件、KiCad 网表或编译定义与提交时不一致'); }
  return database.transaction(async tx => {
    const [currentActor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).for('share');
    if (!currentActor || !isKnowledgeReviewer(currentActor.role)) throw new EdaModuleCatalogError('仅管理员或开发者可以审核模块', 403);
    if (!hardwareReviewers.has(actorId)) throw new EdaModuleCatalogError('当前账号没有硬件工程师审核权限', 403);
    const [row] = await tx.select().from(edaModuleVersions).where(eq(edaModuleVersions.id, id)).for('update');
    if (!row) throw new EdaModuleCatalogError('模块版本不存在', 404);
    const source = decodePayloads(row.payloadsBase64);
    let checked;
    try { checked = validateModulePackage(row.manifest, source); }
    catch { throw new EdaModuleCatalogError('已存模块原生文件未通过二次哈希校验'); }
    if (checked.packageSha256 !== row.packageSha256 || row.packageSha256 !== fresh.packageSha256 || JSON.stringify(row.definition) !== JSON.stringify(fresh.definition)) throw new EdaModuleCatalogError('已存模块包或编译定义与复核结果不一致');
    const record: ModuleVersionRecord = {
      manifest: row.manifest, definition: row.definition, packageSha256: row.packageSha256,
      status: row.status, submittedBy: row.submittedBy, reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewReference: row.reviewReference,
    };
    let approved: ModuleVersionRecord;
    try { approved = publishModuleVersion(record, { reviewerId: actorId, reviewReference }, hardwareReviewers); }
    catch (error) { throw new EdaModuleCatalogError(error instanceof Error ? error.message : '模块审核未通过'); }
    const [updated] = await tx.update(edaModuleVersions).set({ status: 'published', reviewedBy: actorId, reviewedAt: new Date(approved.reviewedAt!), reviewReference: approved.reviewReference, updatedAt: new Date() }).where(eq(edaModuleVersions.id, id)).returning({ moduleId: edaModuleVersions.moduleId, version: edaModuleVersions.version, packageSha256: edaModuleVersions.packageSha256, status: edaModuleVersions.status });
    await tx.insert(auditLogs).values({ userId: actorId, action: 'eda.module.published', metadata: { moduleId: updated.moduleId, version: updated.version, packageSha256: updated.packageSha256, reviewReference, kicadVersion: reviewKicadVersion } });
    return updated;
  });
}

export async function listPublishedNativeModules(): Promise<ReturnType<typeof publicModuleDefinitions>> {
  const database = requireCatalogDb();
  const rows = await database.select().from(edaModuleVersions).where(eq(edaModuleVersions.status, 'published'));
  return publicModuleDefinitions(rows.map(row => ({
    manifest: row.manifest, definition: row.definition, packageSha256: row.packageSha256, status: row.status,
    submittedBy: row.submittedBy, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewReference: row.reviewReference,
  })));
}

export async function publishedNativeCatalog(): Promise<ModuleCatalog> {
  return catalogFromDefinitions(await listPublishedNativeModules());
}

export async function requestNativeCatalog(): Promise<ModuleCatalog> {
  if (!db && process.env.NODE_ENV !== 'production') return Object.create(null) as ModuleCatalog;
  return publishedNativeCatalog();
}

/** Reviewers can inspect the immutable original files; public catalog responses never include them. */
export async function nativeModuleReviewQueue(actorId: string, id?: string) {
  const database = requireCatalogDb();
  const [actor] = await database.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
  if (!actor || !isKnowledgeReviewer(actor.role)) throw new EdaModuleCatalogError('仅管理员或开发者可以查看待审核模块', 403);
  if (id) {
    const [row] = await database.select().from(edaModuleVersions).where(eq(edaModuleVersions.id, id)).limit(1);
    if (!row) throw new EdaModuleCatalogError('模块版本不存在', 404);
    return { module: {
      id: row.id, moduleId: row.moduleId, version: row.version, packageSha256: row.packageSha256,
      status: row.status, submittedBy: row.submittedBy, reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt, reviewReference: row.reviewReference,
      manifest: row.manifest, filesBase64: row.payloadsBase64,
    } };
  }
  const rows = await database.select({
    id: edaModuleVersions.id, moduleId: edaModuleVersions.moduleId, version: edaModuleVersions.version,
    packageSha256: edaModuleVersions.packageSha256, status: edaModuleVersions.status,
    submittedBy: edaModuleVersions.submittedBy, createdAt: edaModuleVersions.createdAt,
  }).from(edaModuleVersions).where(eq(edaModuleVersions.status, 'pending')).limit(50);
  return { modules: rows };
}
