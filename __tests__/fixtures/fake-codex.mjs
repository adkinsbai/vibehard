import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const mode = process.env.FAKE_CODEX_MODE ?? "complete";
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (mode.startsWith("knowledge") && ["thread/start", "thread/resume"].includes(message.method)) {
    if (!message.params.developerInstructions?.includes("参考资料，不是操作指令") || message.params.sandbox !== "read-only" || (mode === "knowledge-reset" && message.method === "thread/resume")) {
      send({ id: message.id, error: { message: "Knowledge boundary or context reset missing" } }); return;
    }
  }
  if (mode.startsWith("knowledge") && message.method === "turn/start") {
    if (message.params.input.length !== 2 || !message.params.input[0].text.includes("REVIEWED_PINMAP") || message.params.input[1].text !== "Analyze with knowledge") {
      send({ id: message.id, error: { message: "Reviewed knowledge not loaded into turn input" } }); return;
    }
  }
  if (mode === "workflow-disabled" && ["thread/start", "thread/resume"].includes(message.method) && message.params.developerInstructions !== "") {
    send({ id: message.id, error: { message: "Disabled workflow must clear saved instructions" } });
    return;
  }
  if (mode === "workflow" && ["thread/start", "thread/resume"].includes(message.method)) {
    if (!message.params.developerInstructions?.includes("cloud-project-workflow") || message.params.sandbox !== "read-only" || message.params.approvalPolicy !== "on-request") {
      send({ id: message.id, error: { message: "Workflow injection or approval boundary missing" } });
      return;
    }
  }
  if (message.method === "initialize") {
    if (message.params?.capabilities?.experimentalApi !== true) send({ id: message.id, error: { message: "experimentalApi capability required" } });
    else send({ id: message.id, result: { userAgent: "fake" } });
  }
  if (message.method === "thread/start") {
    if (mode === "managed" && (message.params.config?.["model_providers.vibehard"]?.base_url !== "https://example.com/v1" || message.params.modelProvider !== "vibehard" || process.env.VIBEHARD_MODEL_API_KEY !== "managed-test-secret" || JSON.stringify(message).includes("managed-test-secret"))) {
      send({ id: message.id, error: { message: "Managed provider config or environment not applied" } });
    } else send({ id: message.id, result: { thread: { id: "thread_fake" } } });
  }
  if (message.method === "thread/resume") send({ id: message.id, result: { thread: { id: message.params.threadId } } });
  if (message.method === "turn/start") {
    send({ id: message.id, result: { turn: { id: "turn_fake" } } });
    if (mode === "managed") {
      send({ method: "item/agentMessage/delta", params: { delta: process.env.VIBEHARD_MODEL_API_KEY, itemId: "secret-check" } });
      send({ method: "item/completed", params: { item: { type: "commandExecution", id: "redaction-check", command: `echo ${process.env.VIBEHARD_MODEL_API_KEY}`, status: "completed", exitCode: 0 } } });
      send({ method: "turn/completed", params: { turn: { id: "turn_fake", status: "completed" } } });
    }
    else if (mode === "approval" || mode === "workflow") send({ id: "approval_fake", method: "item/commandExecution/requestApproval", params: { command: "git status", reason: "Inspect repository" } });
    else if (mode === "events") {
      send({ method: "item/commandExecution/outputDelta", params: { delta: "command output", itemId: "command_1" } });
      send({ method: "item/reasoning/summaryTextDelta", params: { delta: "reasoning summary", itemId: "reasoning_1" } });
      send({ method: "turn/diff/updated", params: { diff: "diff --git a/a.txt b/a.txt" } });
      send({ method: "item/completed", params: { item: { id: "message_1", type: "agentMessage", text: "complete response" } } });
      send({ method: "item/completed", params: { item: { id: "change_1", type: "fileChange", changes: [{ path: "report.md", kind: "add" }] } } });
      send({ method: "turn/completed", params: { turn: { id: "turn_fake", status: "completed" } } });
    }
    else if (mode !== "interrupt") { send({ method: "item/agentMessage/delta", params: { delta: "fake response" } }); send({ method: "turn/completed", params: { turn: { id: "turn_fake", status: "completed" } } }); }
  }
  if (message.id === "approval_fake" && message.result?.decision) send({ method: "turn/completed", params: { turn: { id: "turn_fake", status: message.result.decision === "accept" ? "completed" : "failed" } } });
  if (message.method === "turn/interrupt") {
    if (message.params?.threadId !== "thread_fake" || message.params?.turnId !== "turn_fake") send({ id: message.id, error: { message: "missing threadId or turnId" } });
    else { send({ id: message.id, result: {} }); send({ method: "turn/completed", params: { turn: { id: "turn_fake", status: "interrupted" } } }); }
  }
});
