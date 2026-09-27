import type { KnowledgeVersion } from "./knowledge";

export type RetrievalSource = {
  scope: "platform" | "project";
  id: string;
  projectId?: string;
  reviewStatus?: "auto-indexed";
  version: KnowledgeVersion;
};
export type KnowledgeReference = {
  scope: RetrievalSource["scope"];
  id: string;
  projectId?: string;
  title: string;
  source: string;
  version: number;
  sha256: string;
  excerpt: string;
  reviewStatus?: "auto-indexed";
};
export type RetrievalResult = {
  status: "matched" | "no-match" | "partial";
  warnings?: ("INDEX_UNAVAILABLE" | "LEGACY_RUNNER")[];
  revision?: string;
  method: "keyword-chunks-v1" | "keyword-chunks-fts5-v1";
  references: KnowledgeReference[];
  context: string;
};

const MAX_REFERENCES = 5;
const MAX_CONTEXT = 3_200;
const MAX_CHUNK = 650;
const ignored = new Set(["方案", "设计", "生成", "开发", "功能", "支持", "使用", "一个", "需要", "系统", "设备", "项目", "资料", "根据", "进行", "以及", "可以", "要求", "硬件", "软件"]);

function tokens(input: string) {
  const normalized = input.toLocaleLowerCase();
  const words = normalized.match(/[a-z0-9][a-z0-9._+-]{1,}/g) ?? [];
  const han = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const pairs = han.flatMap(run => { const characters = [...run]; return characters.slice(0, -1).map((character, index) => character + characters[index + 1]); });
  return [...new Set([...words, ...pairs].filter(token => !ignored.has(token)))].slice(0, 120);
}

function chunks(content: string) {
  const sections = content.split(/\n\s*\n/).map(section => section.trim()).filter(Boolean);
  const output: string[] = [];
  for (const section of sections) {
    for (let start = 0; start < section.length; start += MAX_CHUNK) output.push(section.slice(start, start + MAX_CHUNK));
  }
  return output;
}

export function retrieveKnowledge(requirement: string, sources: RetrievalSource[], projectSnapshotIncluded = false): RetrievalResult {
  const query = tokens(requirement);
  if (!query.length) return { status: "no-match", method: "keyword-chunks-v1", references: [], context: "" };
  const requestedEsp = /\besp32[- ]?s3\b/i.test(requirement) && !/\brv1106\b|\brv1126b\b/i.test(requirement);
  const requestedBoard = /\brv1106\b/i.test(requirement) && !/\brv1126b\b/i.test(requirement) ? "RV1106"
    : /\brv1126b\b/i.test(requirement) && !/\brv1106\b/i.test(requirement) ? "RV1126B" : null;
  const candidates = sources.filter(source => !(requestedEsp && source.scope === "platform" && /^(?:RV1106|RV1126B)\//.test(source.version.source)))
    .filter(source => !requestedBoard || source.scope !== "platform" ||
    !/^(?:RV1106|RV1126B)\//.test(source.version.source) || source.version.source.startsWith(`${requestedBoard}/`))
    .flatMap(source => chunks(source.version.content).map((content, index) => {
    const title = source.version.title.toLocaleLowerCase();
    const provenance = source.version.source.toLocaleLowerCase();
    const body = content.toLocaleLowerCase();
    const score = query.reduce((sum, token) => sum + (title.includes(token) ? 5 : 0) + (provenance.includes(token) ? 2 : 0) + (body.includes(token) ? 1 : 0), 0);
    return { source, content, index, score };
  })).filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id) || a.index - b.index);
  const selected: typeof candidates = [];
  const contextBlocks: string[] = [];
  const seen = new Set<string>();
  const importedFileCounts = new Map<string, number>();
  let used = 0;
  for (const candidate of candidates) {
    const key = `${candidate.source.scope}:${candidate.source.id}`;
    // A PDF page is stored as a separate small entry in the proof batch. Do
    // not let five pages of the same datasheet crowd out board-level evidence.
    const importedFile = candidate.source.scope === "platform" && (/^(?:RV1106|RV1126B)\//.test(candidate.source.version.source) || candidate.source.reviewStatus === "auto-indexed")
      ? candidate.source.version.source.split("#", 1)[0] : undefined;
    const label = candidate.source.reviewStatus === "auto-indexed" ? "平台自动入库，未人工复核" : candidate.source.scope === "platform" ? "平台已发布" : "本项目已发布";
    const block = `[资料 ${selected.length + 1}] ${candidate.source.version.title}（${label}，v${candidate.source.version.version}）\n来源：${candidate.source.version.source.split(" (file SHA256", 1)[0]}\n文件 SHA256：${candidate.source.version.sha256}\n${candidate.content}`;
    if (seen.has(key) || (importedFile && (importedFileCounts.get(importedFile) ?? 0) >= 2) || used + block.length + (selected.length ? 2 : 0) > MAX_CONTEXT) continue;
    selected.push(candidate);
    // Agent already receives the complete reviewed project snapshot. Keep its
    // citations, but do not send the same body twice in the bounded RAG context.
    if (!(projectSnapshotIncluded && candidate.source.scope === "project")) contextBlocks.push(block);
    seen.add(key); used += block.length + (selected.length > 1 ? 2 : 0);
    if (importedFile) importedFileCounts.set(importedFile, (importedFileCounts.get(importedFile) ?? 0) + 1);
    if (selected.length >= MAX_REFERENCES) break;
  }
  const references = selected.map(({ source, content }) => ({
    scope: source.scope, id: source.id, ...(source.projectId ? { projectId: source.projectId } : {}),
    ...(source.reviewStatus ? { reviewStatus: source.reviewStatus } : {}),
    title: source.version.title, source: source.version.source, version: source.version.version,
    sha256: source.version.sha256, excerpt: content.slice(0, 240),
  }));
  return { status: references.length ? "matched" : "no-match", method: selected.some(candidate => candidate.source.reviewStatus === "auto-indexed") ? "keyword-chunks-fts5-v1" : "keyword-chunks-v1", references,
    context: contextBlocks.join("\n\n"),
  };
}
