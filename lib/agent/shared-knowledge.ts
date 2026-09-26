import { z } from "zod";
import { knowledgeActionSchema } from "./knowledge";

export const sharedCategory = z.enum(["boards", "manuals", "schematics", "pcb", "firmware", "experience"]);
export type SharedCategory = z.infer<typeof sharedCategory>;
export const sharedKnowledgeInput = z.object({ category: sharedCategory, mutation: knowledgeActionSchema }).strict();
