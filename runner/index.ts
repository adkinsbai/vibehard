import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { envelope, parseGatewayToRunnerMessage, type AgentEvent, type GatewayToRunnerMessage, type RunnerEvent, type TaskStart } from "@/lib/agent/protocol";
import { CodexSession, redactSensitiveText } from "./codex-stdio";
import { RunnerJournal } from "./state";
import type { RuntimeLlm } from "@/lib/agent/llm";
import { KNOWLEDGE_CAPABILITY } from "@/lib/agent/knowledge";

const runnerKey = process.env.RUNNER_ID ?? "local-runner";
const runnerInstanceId = randomUUID();
const runnerCapabilities = [...new Set([KNOWLEDGE_CAPABILITY, ...(process.env.RUNNER_CAPABILITIES ?? "codex,workspace-read,workspace-write-approval")
  .split(",").map((item) => item.trim()).filter(Boolean)])].slice(0, 50);
let gatewayUrl = process.env.RUNNER_GATEWAY_URL ?? "ws://127.0.0.1:8787/runner";
let secret = process.env.RUNNER_SHARED_SECRET ?? "";
let codexVersion: string | undefined;
const configuredWorkspaceRoot = path.resolve(process.env.RUNNER_WORKSPACE_ROOT ?? "/tmp/vibehard-workspaces");
let workspaceRoot = configuredWorkspaceRoot;
let journal: RunnerJournal;
const sessions = new Map<string, CodexSession>();
const activeThreads = new Map<string, string>();
let activeSocket: WebSocket | null = null;
let accepted = false;

interface StoredCredential { runnerKey: string; secret: string; gatewayUrl: string }

async function workspaceFor(key: string) {
  const requested = path.resolve(workspaceRoot, key);
  if (requested === workspaceRoot || !requested.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("Workspace key escapes runner root");
  await mkdir(requested, { recursive: true, mode: 0o700 });
  if ((await lstat(requested)).isSymbolicLink()) throw new Error("Workspace cannot be a symbolic link");
  const workspace = await realpath(requested);
  if (!workspace.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("Workspace resolves outside runner root");
  await chmod(workspace, 0o700);
  return workspace;
}

function sendEvent(outgoing: RunnerEvent) {
  journal.enqueueEvent(outgoing);
  if (activeSocket?.readyState === WebSocket.OPEN && accepted) activeSocket.send(JSON.stringify(outgoing));
}

function taskEvent(task: Pick<TaskStart, "taskId" | "threadId" | "codexThreadId">, type: AgentEvent["type"], data: Record<string, unknown>): RunnerEvent {
  return {
    ...envelope(),
    type: "event",
    runnerKey,
    taskId: task.taskId,
    threadId: task.threadId,
    codexThreadId: task.codexThreadId,
    event: { eventId: randomUUID(), sequence: 0, timestamp: new Date().toISOString(), type, data },
  };
}

function acknowledgeCommand(socket: WebSocket, commandId: string) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...envelope(), type: "command.ack", runnerKey, commandId }));
}

async function handleCommand(socket: WebSocket, message: GatewayToRunnerMessage) {
  if (message.type === "runner.accepted") {
    if (message.runnerKey !== runnerKey) throw new Error("Gateway accepted a different runner identity");
    accepted = true;
    for (const outgoing of journal.outboundEvents()) {
      if (socket.readyState !== WebSocket.OPEN) break;
      socket.send(JSON.stringify(outgoing));
    }
    return;
  }
  if (message.type === "event.ack") {
    if (message.runnerKey !== runnerKey) throw new Error("Gateway acknowledged an event for a different runner");
    journal.acknowledgeEvent(message.eventId);
    return;
  }

  const commandId = message.messageId;
  if (journal.hasSeen(commandId)) {
    acknowledgeCommand(socket, commandId);
    return;
  }

  if (message.type === "task.start") {
    const maxConcurrent = Math.max(1, Number(process.env.RUNNER_MAX_CONCURRENT_TASKS ?? 1) || 1);
    if (sessions.size >= maxConcurrent) {
      journal.markSeen(commandId);
      sendEvent(taskEvent(message, "task.failed", { message: "云端执行器正忙，请稍后重新发送任务" }));
      acknowledgeCommand(socket, commandId);
      return;
    }
    const currentTaskId = activeThreads.get(message.threadId);
    if (currentTaskId && currentTaskId !== message.taskId) {
      journal.markSeen(commandId);
      sendEvent(taskEvent(message, "task.failed", { message: "This thread already has an active task" }));
      acknowledgeCommand(socket, commandId);
      return;
    }
    let session: CodexSession | undefined;
    try {
      const workspace = await workspaceFor(message.workspaceKey);
      const task = { ...message, workspaceKey: workspace };
      journal.markSeen(commandId);
      journal.setActiveTask(task);
      session = new CodexSession((event: AgentEvent, codexThreadId) => {
        sendEvent({ ...envelope(), type: "event", runnerKey, taskId: message.taskId, threadId: message.threadId, codexThreadId, event });
        if (["task.completed", "task.failed", "task.interrupted"].includes(event.type)) {
          sessions.delete(message.taskId);
          activeThreads.delete(message.threadId);
          journal.removeActiveTask(message.taskId);
          queueMicrotask(() => session?.dispose());
        }
      }, workspaceRoot);
      sessions.set(message.taskId, session);
      activeThreads.set(message.threadId, message.taskId);
      let config: RuntimeLlm | undefined;
      if (task.modelProvider === "vibehard") {
        const platformUrl = process.env.RUNNER_PLATFORM_URL;
        if (!platformUrl) throw new Error("执行器未配置平台地址，请管理员检查 RUNNER_PLATFORM_URL");
        const response = await fetch(`${platformUrl}/api/runners/model-config?taskId=${encodeURIComponent(task.taskId)}`, {
          headers: { Authorization: `Bearer ${secret}`, "X-Runner-Key": runnerKey }, signal: AbortSignal.timeout(10_000), redirect: "error",
        });
        if (!response.ok) throw new Error(`无法读取云端模型配置（HTTP ${response.status}）`);
        config = (await response.json() as { config: RuntimeLlm }).config;
        if (config.model !== task.model) throw new Error("模型配置已变更，请刷新页面并重新发送任务");
      }
      await session.start(task, config);
    } catch (error) {
      if (session) session.fail(error);
      else {
        journal.markSeen(commandId);
        journal.removeActiveTask(message.taskId);
        activeThreads.delete(message.threadId);
        sendEvent(taskEvent(message, "task.failed", { message: redactSensitiveText(error instanceof Error ? error.message : String(error)) }));
      }
    }
  } else if (message.type === "task.interrupt") {
    const session = sessions.get(message.taskId);
    try {
      if (!session) throw new Error("Task is not active on this Runner");
      await session.interrupt();
    } catch (error) {
      if (session) session.fail(error);
      else sendEvent(taskEvent(message, "task.failed", { message: error instanceof Error ? error.message : String(error) }));
    }
    journal.markSeen(commandId);
  } else if (message.type === "approval.resolve") {
    const session = sessions.get(message.taskId);
    if (session) session.resolveApproval(message.approvalId, message.decision);
    else sendEvent(taskEvent(message, "task.failed", { message: "Approval target is no longer active on this Runner" }));
    journal.markSeen(commandId);
  }
  acknowledgeCommand(socket, commandId);
}

function connect() {
  const socket = new WebSocket(gatewayUrl, { maxPayload: 1024 * 1024 });
  activeSocket = socket;
  accepted = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let messageQueue = Promise.resolve();
  socket.on("open", () => {
    socket.send(JSON.stringify({ ...envelope(), type: "runner.hello", runnerKey, instanceId: runnerInstanceId, capabilities: runnerCapabilities, codexVersion, secret }));
    heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...envelope(), type: "heartbeat", runnerKey }));
    }, 15_000);
  });
  socket.on("message", (raw) => {
    messageQueue = messageQueue.then(async () => {
      try {
        await handleCommand(socket, parseGatewayToRunnerMessage(JSON.parse(raw.toString())));
      } catch (error) {
        console.error("runner message error", redactSensitiveText(error instanceof Error ? error.message : String(error)));
        socket.close(1003, "invalid gateway message");
      }
    });
  });
  socket.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    if (activeSocket === socket) { activeSocket = null; accepted = false; }
    setTimeout(connect, 2_000);
  });
  socket.on("error", () => socket.close());
}

async function loadStoredCredential(filePath: string) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as StoredCredential;
    if (parsed.runnerKey === runnerKey && typeof parsed.secret === "string" && parsed.secret.length >= 32) return parsed;
  } catch { /* register below */ }
  return null;
}

async function saveStoredCredential(filePath: string, credential: StoredCredential) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(credential)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, filePath);
}

async function bootstrap() {
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  workspaceRoot = await realpath(workspaceRoot);
  await chmod(workspaceRoot, 0o700);
  journal = new RunnerJournal(process.env.RUNNER_STATE_FILE ?? path.join(workspaceRoot, `.runner-state-${runnerKey}.json`));
  for (const task of journal.activeTasks()) {
    sendEvent(taskEvent(task, "task.failed", { message: "Runner restarted while this task was active; retry the turn" }));
    journal.removeActiveTask(task.taskId);
  }
  try {
    const result = await promisify(execFile)(process.env.CODEX_BIN ?? "codex", ["--version"], { timeout: 5_000, env: process.env });
    codexVersion = result.stdout.trim();
  } catch {
    codexVersion = undefined;
  }
  const credentialPath = process.env.RUNNER_CREDENTIAL_FILE ?? path.join(workspaceRoot, `.runner-credential-${runnerKey}.json`);
  if (!secret) {
    const stored = await loadStoredCredential(credentialPath);
    if (stored) {
      secret = stored.secret;
      gatewayUrl = stored.gatewayUrl;
    }
  }
  if (!secret) {
    const platformUrl = process.env.RUNNER_PLATFORM_URL ?? "http://127.0.0.1:3000";
    const registrationToken = process.env.RUNNER_REGISTRATION_TOKEN;
    if (!registrationToken) throw new Error("RUNNER_SHARED_SECRET, stored credentials, or RUNNER_REGISTRATION_TOKEN must be configured");
    const response = await fetch(`${platformUrl}/api/runners/register`, { method: "POST", headers: { Authorization: `Bearer ${registrationToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ runnerKey, name: process.env.RUNNER_NAME ?? "VibeHard Codex Runner", capabilities: runnerCapabilities }) });
    if (!response.ok) throw new Error(`Runner registration failed: ${response.status}`);
    const registered = await response.json() as { secret: string; gatewayUrl?: string };
    secret = registered.secret;
    gatewayUrl = registered.gatewayUrl ?? gatewayUrl;
    await saveStoredCredential(credentialPath, { runnerKey, secret, gatewayUrl });
  }
  connect();
}

void bootstrap().catch((error) => { console.error(redactSensitiveText(error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
