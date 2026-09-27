// Real current-model tool turn, in a fresh non-root bubblewrap workspace.
// No production task, Runner registration, credentials or workspace is changed.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, chownSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { closeDb } from '@/lib/db';
import { runtimeLlm } from '@/lib/server/llm-settings';
import { CodexSession } from '@/runner/codex-stdio';
import { prepareRetrieval } from '@/lib/server/retrieval-dispatch';
import { searchIndexedKnowledge, closeIndexedKnowledge } from '@/lib/server/oss-knowledge-index';
import { retrieveKnowledge } from '@/lib/agent/knowledge-retrieval';
import { RETRIEVAL_CAPABILITY } from '@/lib/agent/retrieval-payload';
import { envelope } from '@/lib/agent/protocol';
import type { RuntimeLlm } from '@/lib/agent/llm';

async function main() {
  assert.equal(process.env.ALLOW_AGENT_ACCEPTANCE, 'one-isolated-tool-turn');
  if (process.argv[2] !== 'child') {
    assert.equal(process.getuid?.(), 0); assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/vibehard');
    const config = await runtimeLlm('agent'); assert.ok(config); await closeDb();
    const root = '/var/lib/vibehard-runner/workspaces'; const workspace = `${root}/acceptance/${randomUUID()}`;
    const uid = Number(execFileSync('id', ['-u', 'vibehard-runner'], { encoding: 'utf8' }).trim()); const gid = Number(execFileSync('id', ['-g', 'vibehard-runner'], { encoding: 'utf8' }).trim());
    mkdirSync(`${root}/acceptance`, { recursive: true, mode: 0o700 }); chownSync(`${root}/acceptance`, uid, gid);
    mkdirSync(workspace, { mode: 0o700 }); chownSync(workspace, uid, gid);
    const nonce = `verified-${randomUUID()}`; writeFileSync(`${workspace}/read-proof.txt`, nonce, { mode: 0o400 }); chownSync(`${workspace}/read-proof.txt`, uid, gid);
    const sources = await searchIndexedKnowledge('ESP32-S3-Touch-LCD-2.8C 原理图'); closeIndexedKnowledge(); assert.ok(sources.length);
    const result = { ...retrieveKnowledge('ESP32-S3-Touch-LCD-2.8C 原理图', sources), revision: 'a'.repeat(64) };
    const payload = prepareRetrieval(result, null, undefined, { capabilities: [RETRIEVAL_CAPABILITY], status: 'online', lastHeartbeatAt: new Date() }).payload!;
    const child = spawn(process.execPath, [process.argv[1], 'child'], { uid, gid, stdio: ['pipe', 'inherit', 'inherit'], env: {
      PATH: '/opt/vibehard/toolchain/bin:/usr/bin:/bin', HOME: '/var/lib/vibehard-runner', CODEX_HOME: '/var/lib/vibehard-runner/.codex',
      NODE_ENV: 'production', ALLOW_AGENT_ACCEPTANCE: 'one-isolated-tool-turn', CODEX_BIN: '/opt/vibehard/toolchain/bin/codex',
      RUNNER_CODEX_WRAPPER: JSON.stringify(['/opt/vibehard/cloud-runner/codex-sandbox.sh', '{workspace}']),
      RUNNER_ENGINEERING_WORKFLOW: 'true', CODEX_IDLE_TIMEOUT_MS: '120000',
    } });
    child.stdin.end(JSON.stringify({ config, root, workspace, nonce, payload }));
    const code = await new Promise(resolve => child.on('exit', resolve)); assert.equal(code, 0); return;
  }
  assert.notEqual(process.getuid?.(), 0);
  const input: Buffer[] = []; for await (const chunk of process.stdin) input.push(Buffer.from(chunk));
  const data = JSON.parse(Buffer.concat(input).toString()) as { config: RuntimeLlm; root: string; workspace: string; nonce: string; payload: NonNullable<ReturnType<typeof prepareRetrieval>['payload']> };
  let toolCompleted = false; let answer = ''; let terminal = ''; let failure = '';
  let done: () => void = () => {}; const completed = new Promise<void>(resolve => { done = resolve; });
  const start = Date.now();
  const session = new CodexSession(event => {
    const item = event.data.item as { type?: string; exitCode?: number; aggregatedOutput?: string } | undefined;
    if (event.type === 'tool.completed' && item?.type === 'commandExecution' && item.exitCode === 0 && item.aggregatedOutput?.includes(data.nonce)) toolCompleted = true;
    if (event.type === 'agent.message') answer += String(event.data.text ?? '');
    if (event.type === 'approval.requested') { session.resolveApproval(String(event.data.approvalId), 'reject'); failure = 'UNEXPECTED_APPROVAL'; }
    if (event.type === 'task.failed') failure = 'MODEL_OR_TOOL_PROTOCOL';
    if (['task.failed', 'task.completed', 'task.interrupted'].includes(event.type)) { terminal = event.type; done(); }
  }, data.root);
  const timeout = setTimeout(() => { failure = 'TURN_TIMEOUT'; session.dispose(); done(); }, 180000);
  try {
    await session.start({ ...envelope(), type: 'task.start', taskId: randomUUID(), threadId: randomUUID(), projectId: randomUUID(), workspaceKey: data.workspace,
      model: data.config.model, modelProvider: 'vibehard', retrieval: data.payload,
      input: '这是隔离验收。必须实际使用只读 shell 工具 cat read-proof.txt，读取文件中的校验码（不要猜测）。随后用中文简短回答校验码，并列出附带 ESP32-S3 原理图参考资料的标题、来源页和“未人工复核”标识。不修改文件，不执行其他工具命令，不要求提升权限。' }, data.config);
    await completed;
    const passed = terminal === 'task.completed' && toolCompleted && answer.includes(data.nonce) && answer.includes('未人工复核');
    console.log(JSON.stringify({ acceptance: 'agent-retrieval-v1', passed, terminal, toolCompleted, citationLabel: answer.includes('未人工复核'), elapsedMs: Date.now() - start, failure, model: data.config.model, revision: data.config.revision, sourceCount: data.payload.references.length }));
    assert.ok(passed);
  } finally { clearTimeout(timeout); session.dispose(); }
}
void main().catch(() => { console.error('Isolated Agent tool acceptance failed; production unchanged'); process.exitCode = 1; });
