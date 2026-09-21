import { z } from "zod";
import { knowledgeSnapshotSchema, type KnowledgeSnapshot } from "./knowledge";

export const RUNNER_PROTOCOL_VERSION = 1 as const;

export type ApprovalDecision = "approve" | "reject";
export type AgentEventType =
  | "task.started"
  | "agent.message.delta"
  | "agent.message"
  | "reasoning"
  | "tool.started"
  | "tool.completed"
  | "command.output"
  | "file.changed"
  | "approval.requested"
  | "artifact.created"
  | "task.completed"
  | "task.failed"
  | "task.interrupted";

export interface AgentEvent {
  eventId: string;
  sequence: number;
  timestamp: string;
  type: AgentEventType;
  data: Record<string, unknown>;
}

export interface Envelope {
  protocolVersion: typeof RUNNER_PROTOCOL_VERSION;
  messageId: string;
  timestamp: string;
}

export interface RunnerHello extends Envelope {
  type: "runner.hello";
  runnerKey: string;
  instanceId: string;
  secret: string;
  capabilities: string[];
  codexVersion?: string;
}

export interface RunnerAccepted extends Envelope {
  type: "runner.accepted";
  runnerKey: string;
}

export interface TaskStart extends Envelope {
  type: "task.start";
  taskId: string;
  projectId: string;
  threadId: string;
  codexThreadId?: string;
  workspaceKey: string;
  input: string;
  model: string;
  modelProvider?: string;
  knowledge?: KnowledgeSnapshot;
}

export interface TaskInterrupt extends Envelope {
  type: "task.interrupt";
  taskId: string;
  threadId: string;
}

export interface ApprovalResolve extends Envelope {
  type: "approval.resolve";
  taskId: string;
  threadId: string;
  approvalId: string;
  decision: ApprovalDecision;
}

export interface RunnerEvent extends Envelope {
  type: "event";
  runnerKey: string;
  taskId: string;
  threadId?: string;
  codexThreadId?: string;
  event: AgentEvent;
}

export interface Heartbeat extends Envelope {
  type: "heartbeat";
  runnerKey: string;
}

export interface CommandAck extends Envelope {
  type: "command.ack";
  runnerKey: string;
  commandId: string;
}

export interface EventAck extends Envelope {
  type: "event.ack";
  runnerKey: string;
  eventId: string;
}

export type PlatformToRunnerMessage = TaskStart | TaskInterrupt | ApprovalResolve;
export type GatewayToRunnerMessage = RunnerAccepted | PlatformToRunnerMessage | EventAck;
export type RunnerToPlatformMessage = RunnerHello | RunnerEvent | Heartbeat | CommandAck;

const envelopeSchema = z.object({
  protocolVersion: z.literal(RUNNER_PROTOCOL_VERSION),
  messageId: z.uuid(),
  timestamp: z.iso.datetime(),
});

const runnerKeySchema = z.string().regex(/^[a-zA-Z0-9._-]{2,80}$/);
const agentEventTypeSchema = z.enum([
  "task.started",
  "agent.message.delta",
  "agent.message",
  "reasoning",
  "tool.started",
  "tool.completed",
  "command.output",
  "file.changed",
  "approval.requested",
  "artifact.created",
  "task.completed",
  "task.failed",
  "task.interrupted",
]);

export const agentEventSchema: z.ZodType<AgentEvent> = z.object({
  eventId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
  type: agentEventTypeSchema,
  data: z.record(z.string(), z.unknown()),
});

const runnerAcceptedSchema = envelopeSchema.extend({
  type: z.literal("runner.accepted"),
  runnerKey: runnerKeySchema,
});

const taskStartSchema = envelopeSchema.extend({
  type: z.literal("task.start"),
  taskId: z.uuid(),
  projectId: z.uuid(),
  threadId: z.uuid(),
  codexThreadId: z.string().min(1).max(200).optional(),
  workspaceKey: z.string().min(1).max(500),
  input: z.string().min(1).max(50_000),
  model: z.string().min(1).max(200),
  modelProvider: z.string().min(1).max(100).optional(),
  knowledge: knowledgeSnapshotSchema.optional(),
});

const taskInterruptSchema = envelopeSchema.extend({
  type: z.literal("task.interrupt"),
  taskId: z.uuid(),
  threadId: z.uuid(),
});

const approvalResolveSchema = envelopeSchema.extend({
  type: z.literal("approval.resolve"),
  taskId: z.uuid(),
  threadId: z.uuid(),
  approvalId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

const eventAckSchema = envelopeSchema.extend({
  type: z.literal("event.ack"),
  runnerKey: runnerKeySchema,
  eventId: z.uuid(),
});

const runnerHelloSchema = envelopeSchema.extend({
  type: z.literal("runner.hello"),
  runnerKey: runnerKeySchema,
  instanceId: z.uuid(),
  secret: z.string().min(32).max(512),
  capabilities: z.array(z.string().min(1).max(100)).max(100),
  codexVersion: z.string().max(200).optional(),
});

const runnerEventSchema = envelopeSchema.extend({
  type: z.literal("event"),
  runnerKey: runnerKeySchema,
  taskId: z.uuid(),
  threadId: z.uuid().optional(),
  codexThreadId: z.string().min(1).max(200).optional(),
  event: agentEventSchema,
});

const heartbeatSchema = envelopeSchema.extend({
  type: z.literal("heartbeat"),
  runnerKey: runnerKeySchema,
});

const commandAckSchema = envelopeSchema.extend({
  type: z.literal("command.ack"),
  runnerKey: runnerKeySchema,
  commandId: z.uuid(),
});

const gatewayToRunnerSchema = z.discriminatedUnion("type", [
  runnerAcceptedSchema,
  taskStartSchema,
  taskInterruptSchema,
  approvalResolveSchema,
  eventAckSchema,
]);

const runnerToPlatformSchema = z.discriminatedUnion("type", [
  runnerHelloSchema,
  runnerEventSchema,
  heartbeatSchema,
  commandAckSchema,
]);

export function parseGatewayToRunnerMessage(input: unknown): GatewayToRunnerMessage {
  return gatewayToRunnerSchema.parse(input) as GatewayToRunnerMessage;
}

export function parseRunnerToPlatformMessage(input: unknown): RunnerToPlatformMessage {
  return runnerToPlatformSchema.parse(input) as RunnerToPlatformMessage;
}

export function assertProtocolVersion(version: unknown): asserts version is typeof RUNNER_PROTOCOL_VERSION {
  if (version !== RUNNER_PROTOCOL_VERSION) throw new Error(`Unsupported runner protocol version: ${String(version)}`);
}

export function envelope() {
  return {
    protocolVersion: RUNNER_PROTOCOL_VERSION,
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}
