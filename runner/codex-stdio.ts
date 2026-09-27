import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ProjectWorkflow } from "./project-workflow";
import { KNOWLEDGE_BOUNDARY, knowledgeInput } from "./project-knowledge";
import { knowledgeManifest, type KnowledgeSnapshot } from "@/lib/agent/knowledge";
import type { AgentEvent, TaskStart } from "@/lib/agent/protocol";
import type { RuntimeLlm } from "@/lib/agent/llm";
import type { AgentMessageDeltaNotification } from "./generated/codex/v2/AgentMessageDeltaNotification";
import type { CommandExecutionOutputDeltaNotification } from "./generated/codex/v2/CommandExecutionOutputDeltaNotification";
import type { FileChangeOutputDeltaNotification } from "./generated/codex/v2/FileChangeOutputDeltaNotification";
import type { ReasoningSummaryTextDeltaNotification } from "./generated/codex/v2/ReasoningSummaryTextDeltaNotification";
import type { ReasoningTextDeltaNotification } from "./generated/codex/v2/ReasoningTextDeltaNotification";
import type { TurnDiffUpdatedNotification } from "./generated/codex/v2/TurnDiffUpdatedNotification";
import type { TurnInterruptParams } from "./generated/codex/v2/TurnInterruptParams";

type Emit = (event: AgentEvent, codexThreadId?: string) => void;
type CodexMessage = { id?: string | number; result?: Record<string, unknown>; error?: unknown; method?: string; params?: Record<string, unknown> };

const SAFE_ENVIRONMENT_KEYS = new Set([
  "APPDATA", "CODEX_HOME", "COLORTERM", "COMSPEC", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "LOCALAPPDATA",
  "LOGNAME", "NODE_EXTRA_CA_CERTS", "NO_COLOR", "NO_PROXY", "PATH", "PATHEXT", "SHELL", "SSL_CERT_DIR",
  "SSL_CERT_FILE", "SYSTEMROOT", "TEMP", "TERM", "TMP", "TMPDIR", "USER", "USERPROFILE", "WINDIR", "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "HTTPS_PROXY", "HTTP_PROXY",
]);
const BLOCKED_ENVIRONMENT_KEY = /(^RUNNER_|DATABASE_URL|SESSION_SECRET|INVITE_CODES|PASSWORD|REGISTRATION_TOKEN|SHARED_SECRET)/i;
const SENSITIVE_ENVIRONMENT_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|AUTHORIZATION|DATABASE_URL|INVITE_CODES)/i;

export function codexEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const providerKeys = (source.CODEX_PROVIDER_ENV_ALLOWLIST ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  const allowedKeys = new Set([...SAFE_ENVIRONMENT_KEYS, ...providerKeys]);
  const result: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV };
  for (const key of allowedKeys) {
    if (BLOCKED_ENVIRONMENT_KEY.test(key)) continue;
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

export function redactSensitiveText(text: string, source: Record<string, string | undefined> = process.env) {
  let redacted = text.replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]");
  for (const [key, value] of Object.entries(source)) {
    if (!value || value.length < 6 || !SENSITIVE_ENVIRONMENT_KEY.test(key)) continue;
    redacted = redacted.split(value).join("[REDACTED]");
  }
  return redacted;
}

function redactData(value: unknown, secrets: Record<string, string | undefined>): unknown {
  if (typeof value === "string") return redactSensitiveText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactData(item, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactData(item, secrets)]));
  return value;
}

function schemeString(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function darwinSandboxProfile(workspaceRoot: string, workspace: string) {
  const relative = path.relative(workspaceRoot, workspace);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Workspace must be a child of the Runner workspace root");
  return [
    "(version 1)",
    "(allow default)",
    `(deny file-read* file-write* (subpath ${schemeString(workspaceRoot)}))`,
    `(allow file-read* file-write* (subpath ${schemeString(workspace)}))`,
  ].join(" ");
}

function codexCommand(command: string, args: string[], workspaceRoot: string, workspace: string) {
  const wrapper = process.env.RUNNER_CODEX_WRAPPER;
  if (wrapper) {
    const wrapperArgs = JSON.parse(wrapper) as unknown;
    if (!Array.isArray(wrapperArgs) || !wrapperArgs.every((item) => typeof item === "string") || wrapperArgs.length === 0) {
      throw new Error("RUNNER_CODEX_WRAPPER must be a JSON array of command arguments");
    }
    const expanded = wrapperArgs.map((item) => item.replaceAll("{workspaceRoot}", workspaceRoot).replaceAll("{workspace}", workspace).replaceAll("{codex}", command));
    return { command: expanded[0], args: [...expanded.slice(1), ...args] };
  }
  if (process.env.NODE_ENV === "test") return { command, args };
  if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
    return { command: "/usr/bin/sandbox-exec", args: ["-p", darwinSandboxProfile(workspaceRoot, workspace), command, ...args] };
  }
  if (process.env.RUNNER_ALLOW_WEAK_ISOLATION === "true") return { command, args };
  throw new Error("No strong Runner isolation is configured. Set RUNNER_CODEX_WRAPPER or explicitly allow weak isolation.");
}

export class CodexSession {
  private process: ChildProcessWithoutNullStreams | null = null;
  private sequence = 0;
  private threadId: string | undefined;
  private turnId: string | undefined;
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private approvals = new Map<string, { requestId: string | number; method: string }>();
  private terminalEmitted = false;
  private providerSecrets: Record<string, string> = {};
  private watchdog: NodeJS.Timeout | undefined;
  private workflow: ProjectWorkflow | undefined;
  private knowledge: KnowledgeSnapshot | undefined;

  private resetWatchdog() {
    clearTimeout(this.watchdog);
    if (this.terminalEmitted || this.approvals.size) return;
    this.watchdog = setTimeout(() => {
      this.fail(new Error("模型连续 120 秒没有返回有效内容，可能额度不足或上游网络不可用。请在管理页测试模型配置后重试。"));
      this.dispose();
    }, Number(process.env.CODEX_IDLE_TIMEOUT_MS ?? 120_000));
    this.watchdog.unref?.();
  }

  constructor(private readonly emit: Emit, private readonly workspaceRoot = process.cwd()) {}

  private send(message: Record<string, unknown>) {
    if (!this.process) throw new Error("Codex app-server is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: Record<string, unknown>) {
    const id = randomUUID();
    const timeoutMs = Number(process.env.CODEX_REQUEST_TIMEOUT_MS ?? 30_000);
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ method, params, id });
    });
  }

  private event(type: AgentEvent["type"], data: Record<string, unknown>) {
    if (this.terminalEmitted && ["task.completed", "task.failed", "task.interrupted"].includes(type)) return;
    if (["task.completed", "task.failed", "task.interrupted"].includes(type)) { this.terminalEmitted = true; clearTimeout(this.watchdog); }
    else if (type !== "command.output" || (data.stream !== "stderr" && data.stream !== "system")) this.resetWatchdog();
    const secrets = { ...process.env, ...this.providerSecrets };
    const safeData = redactData(data, secrets) as Record<string, unknown>;
    this.workflow?.observe(type, safeData);
    if (this.workflow && ["task.completed", "task.failed", "task.interrupted"].includes(type)) {
      safeData.workflowReport = redactSensitiveText(this.workflow.finish(type), secrets);
    }
    if (this.knowledge && ["task.started", "task.completed", "task.failed", "task.interrupted"].includes(type)) {
      const manifest = knowledgeManifest(this.knowledge);
      safeData.knowledge = redactData(manifest, secrets);
      if (typeof safeData.workflowReport === "string") safeData.workflowReport += `\n\n## 项目知识快照\n${redactSensitiveText(JSON.stringify(manifest, null, 2), secrets)}\n`;
    }
    this.emit({ eventId: randomUUID(), sequence: this.sequence++, timestamp: new Date().toISOString(), type, data: safeData }, this.threadId);
  }

  fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.event("task.failed", { message });
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleMessage(message: CodexMessage) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (pending) {
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`Codex request failed: ${JSON.stringify(message.error)}`));
        else pending.resolve(message.result);
      }
      this.pending.delete(String(message.id));
      return;
    }
    const params = message.params ?? {};
    const method = message.method ?? "";
    if (message.id !== undefined && (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval")) {
      const approvalId = randomUUID();
      this.approvals.set(approvalId, { requestId: message.id, method });
      const command = typeof params.command === "string" ? params.command : undefined;
      const targetPath = typeof params.grantRoot === "string" ? params.grantRoot : undefined;
      const reason = typeof params.reason === "string" ? params.reason : undefined;
      const description = [reason, command && `命令: ${command}`, targetPath && `路径: ${targetPath}`].filter(Boolean).join("\n") || "Agent 请求执行受限操作";
      this.event("approval.requested", { approvalId, tool: method, risk: method.includes("fileChange") ? "write" : "command", description, command, cwd: params.cwd, targetPath, reason });
    } else if (method === "item/agentMessage/delta") {
      const delta = params as AgentMessageDeltaNotification;
      this.event("agent.message.delta", { text: delta.delta, itemId: delta.itemId });
    }
    else if (method === "item/commandExecution/outputDelta") {
      const delta = params as CommandExecutionOutputDeltaNotification;
      this.event("command.output", { text: delta.delta, itemId: delta.itemId });
    }
    else if (method === "item/fileChange/outputDelta") {
      const delta = params as FileChangeOutputDeltaNotification;
      this.event("file.changed", { diff: delta.delta, itemId: delta.itemId });
    }
    else if (method === "turn/diff/updated") {
      const diff = params as TurnDiffUpdatedNotification;
      this.event("file.changed", { diff: diff.diff });
    }
    else if (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") {
      const delta = params as ReasoningSummaryTextDeltaNotification | ReasoningTextDeltaNotification;
      this.event("reasoning", { text: delta.delta, itemId: delta.itemId });
    }
    else if (method === "item/started") this.event("tool.started", params);
    else if (method === "item/completed") {
      const item = params.item as { id?: string; type?: string; text?: string; changes?: Array<{ path?: string; kind?: string; diff?: string }> } | undefined;
      this.event("tool.completed", params);
      if (item?.type === "agentMessage" && item.text) this.event("agent.message", { text: item.text, itemId: item.id });
      if (item?.type === "fileChange") {
        this.event("file.changed", { changes: item.changes ?? [] });
        for (const change of item.changes ?? []) {
          if (!change.path) continue;
          this.event("artifact.created", { name: path.basename(change.path), kind: change.kind ?? "file", path: change.path });
        }
      }
    }
    else if (method === "turn/started") {
      this.turnId = (params.turn as { id?: string } | undefined)?.id ?? this.turnId;
    }
    else if (method === "error") {
      const error = params.error as { message?: string } | undefined;
      this.event("command.output", { stream: "system", text: redactSensitiveText(error?.message ?? "Codex turn error"), willRetry: params.willRetry === true });
    }
    else if (method === "turn/completed") {
      const turn = params.turn as { id?: string; status?: string; error?: { message?: string } | null } | undefined;
      this.turnId = turn?.id ?? this.turnId;
      const data = turn?.status === "failed" ? { ...params, message: redactSensitiveText(turn.error?.message ?? "Codex turn failed") } : params;
      this.event(turn?.status === "interrupted" ? "task.interrupted" : turn?.status === "failed" ? "task.failed" : "task.completed", data);
    }
  }

  async start(task: TaskStart, provider?: RuntimeLlm) {
    const referenceInput = knowledgeInput(task.knowledge);
    this.knowledge = task.knowledge;
    this.workflow = process.env.RUNNER_ENGINEERING_WORKFLOW === "true" ? new ProjectWorkflow() : undefined;
    // Explicitly clear an older workflow override when the rollout flag is disabled on resume.
    const developerInstructions = [this.workflow?.instructions, task.knowledge ? KNOWLEDGE_BOUNDARY : undefined].filter(Boolean).join("\n\n");
    const parsedArgs = process.env.CODEX_APP_SERVER_ARGS ? JSON.parse(process.env.CODEX_APP_SERVER_ARGS) as unknown : ["app-server", "--listen", "stdio://"];
    if (!Array.isArray(parsedArgs) || !parsedArgs.every((item) => typeof item === "string")) throw new Error("CODEX_APP_SERVER_ARGS must be a JSON string array");
    const command = codexCommand(process.env.CODEX_BIN ?? "codex", parsedArgs, this.workspaceRoot, task.workspaceKey);
    const env = codexEnvironment();
    this.providerSecrets = provider ? { VIBEHARD_MODEL_API_KEY: provider.apiKey } : {};
    Object.assign(env, this.providerSecrets);
    // Configuration travels over stdin, with the secret only in the child's environment.
    // It is never stored in the Runner task journal, command queue or user workspace.
    const config = provider ? {
      "model_providers.vibehard": { name: "VibeHard managed provider", base_url: provider.baseUrl, env_key: "VIBEHARD_MODEL_API_KEY", wire_api: "responses", request_max_retries: 1, stream_max_retries: 1, stream_idle_timeout_ms: 60_000 },
      "shell_environment_policy.exclude": ["*KEY*", "*TOKEN*", "*SECRET*", "*PASSWORD*"],
    } : undefined;
    try {
      this.resetWatchdog();
      this.process = spawn(command.command, command.args, { cwd: task.workspaceKey, env, stdio: ["pipe", "pipe", "pipe"] });
      createInterface({ input: this.process.stdout }).on("line", (line) => { try { this.handleMessage(JSON.parse(line)); } catch (error) { console.error("codex protocol parse error", error); } });
      this.process.stderr.on("data", (chunk) => this.event("command.output", { stream: "stderr", text: redactSensitiveText(chunk.toString()) }));
      this.process.on("error", (error) => {
        this.rejectPending(error);
        this.fail(error);
      });
      this.process.on("exit", (code, signal) => {
        const error = new Error(`Codex app-server exited (code=${String(code)}, signal=${String(signal)})`);
        this.rejectPending(error);
        if (!this.terminalEmitted) this.fail(error);
        this.process = null;
      });
      await this.request("initialize", {
        clientInfo: { name: "vibehard_runner", title: "VibeHard Runner", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      this.send({ method: "initialized", params: {} });
      if (task.codexThreadId && !task.knowledge?.contextReset) {
        this.threadId = task.codexThreadId;
        await this.request("thread/resume", { threadId: this.threadId, model: task.model, modelProvider: task.modelProvider, config, developerInstructions, cwd: task.workspaceKey, runtimeWorkspaceRoots: [task.workspaceKey], sandbox: "read-only", approvalPolicy: "on-request" });
      } else {
        const result = await this.request("thread/start", { model: task.model, modelProvider: task.modelProvider, config, developerInstructions, cwd: task.workspaceKey, runtimeWorkspaceRoots: [task.workspaceKey], sandbox: "read-only", approvalPolicy: "on-request" }) as { thread?: { id?: string } } | undefined;
        this.threadId = result?.thread?.id;
      }
      if (!this.threadId) throw new Error("Codex did not return a thread id");
      this.event("task.started", { input: task.input, model: task.model, ...(this.workflow ? { workflow: this.workflow.metadata } : {}) });
      const turn = await this.request("turn/start", { threadId: this.threadId, input: [...referenceInput, { type: "text", text: task.input }], cwd: task.workspaceKey, runtimeWorkspaceRoots: [task.workspaceKey], model: task.model, approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly", networkAccess: false } }) as { turn?: { id?: string } } | undefined;
      this.turnId = turn?.turn?.id;
      if (!this.turnId) throw new Error("Codex did not return a turn id");
    } catch (error) {
      this.fail(error);
      this.dispose();
      throw error;
    }
  }

  async interrupt() {
    if (!this.threadId || !this.turnId) throw new Error("Codex thread or turn is not active");
    const params: TurnInterruptParams = { threadId: this.threadId, turnId: this.turnId };
    await this.request("turn/interrupt", params);
  }

  dispose() {
    clearTimeout(this.watchdog);
    this.rejectPending(new Error("Codex session disposed"));
    this.process?.kill();
    this.process = null;
  }

  resolveApproval(approvalId: string, decision: "approve" | "reject") {
    const approval = this.approvals.get(approvalId);
    if (!approval) return;
    this.send({ id: approval.requestId, result: { decision: decision === "approve" ? "accept" : "decline" } });
    this.workflow?.decide(approvalId, decision);
    this.approvals.delete(approvalId);
    this.resetWatchdog();
  }
}
