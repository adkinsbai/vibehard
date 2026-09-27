// Local-only configuration inventory. Does not read the old credential document or contact OSS.
// node --import tsx scripts/check-knowledge-oss-readiness.mjs
import { assessOssKnowledgeReadiness } from "../lib/server/oss-knowledge-readiness.ts";

console.log(JSON.stringify(assessOssKnowledgeReadiness(process.env), null, 2));
