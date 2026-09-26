import { z } from "zod";

export const llmPurpose = z.enum(["design", "agent"]);
export type LlmPurpose = z.infer<typeof llmPurpose>;
export const llmInput = z.object({
  purpose: llmPurpose,
  baseUrl: z.string().trim().url().max(500),
  model: z.string().trim().min(1).max(150).regex(/^[\w./:@+-]+$/),
  protocol: z.enum(["responses", "chat-completions"]),
  apiKey: z.string().trim().max(4096).refine((v) => !/[\r\n]/.test(v)).optional(),
  revision: z.uuid().nullable(),
}).refine((v) => v.purpose !== "agent" || v.protocol === "responses", "Agent 需要 Responses API");
export type LlmInput = z.infer<typeof llmInput>;
export const llmDiscoveryInput = z.object({
  purpose: llmPurpose,
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().max(4096).refine((v) => !/[\r\n]/.test(v)).optional(),
  revision: z.uuid().nullable(),
});
export type LlmDiscoveryInput = z.infer<typeof llmDiscoveryInput>;
export interface RuntimeLlm { baseUrl: string; model: string; protocol: "responses" | "chat-completions"; apiKey: string; revision: string }
export interface PublicLlm { purpose: LlmPurpose; baseUrl: string; model: string; protocol: RuntimeLlm["protocol"]; hasApiKey: boolean; revision: string | null; updatedAt: string | null }

const line = z.string().trim().min(1).max(4000);
const estimatedPrice = line.refine(
  (value) => (/[¥￥]\s*\d/.test(value) && /估算/.test(value) && !/(未核价|待核价|待询价|询价后)/.test(value)) || /^无法估算[：:]\s*\S.{2,}$/.test(value),
  "BOM 需提供人民币估算单价或无法估算的原因",
);
export const designResultSchema = z.object({
  architecture: z.array(line).min(1).max(30),
  bom: z.array(z.object({ item: line, model: line, qty: z.number().int().positive().max(100000), estCost: estimatedPrice })).min(1).max(60),
  interfaces: z.array(line).min(1).max(40),
  risks: z.array(z.object({ level: z.enum(["高", "中", "低"]), desc: line })).min(1).max(30),
  // Added by the server after parsing model output; never trust model-provided citations.
  retrieval: z.object({
    status: z.enum(["matched", "no-match"]),
    method: z.enum(["keyword-chunks-v1", "keyword-chunks-fts5-v1"]),
    references: z.array(z.object({
      scope: z.enum(["platform", "project"]), id: z.uuid(), projectId: z.uuid().optional(),
      reviewStatus: z.literal("auto-indexed").optional(),
      title: z.string(), source: z.string(), version: z.number().int().positive(),
      sha256: z.string(), excerpt: z.string(),
    })).max(5),
  }).optional(),
});
export type DesignResult = z.infer<typeof designResultSchema>;
