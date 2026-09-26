const required = [
  "OSS_KNOWLEDGE_BUCKET",
  "OSS_KNOWLEDGE_REGION",
  "OSS_KNOWLEDGE_STS_ROLE_ARN",
  "OSS_KNOWLEDGE_ALLOWED_ORIGIN",
] as const;

// Deliberately reports names/status only; never echoes credential or Bucket values.
export function assessOssKnowledgeReadiness(env: Record<string, string | undefined>) {
  const missing = required.filter(name => !env[name]?.trim());
  const issues: string[] = [];
  if (env.OSS_KNOWLEDGE_REGION && !/^oss-[a-z0-9-]+$/.test(env.OSS_KNOWLEDGE_REGION)) issues.push("OSS_KNOWLEDGE_REGION 应使用 oss-cn-... 形式，并与 Bucket 所在地域一致");
  if (env.OSS_KNOWLEDGE_ALLOWED_ORIGIN && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(env.OSS_KNOWLEDGE_ALLOWED_ORIGIN)) issues.push("OSS_KNOWLEDGE_ALLOWED_ORIGIN 应是明确的 HTTPS 站点源");
  if (env.OSS_KNOWLEDGE_ACCESS_KEY_ID || env.OSS_KNOWLEDGE_ACCESS_KEY_SECRET) issues.push("发现长期密钥变量：只能放服务端受限环境；优先使用实例角色，不得写入前端或仓库");
  return { configurationComplete: missing.length === 0 && !issues.some(issue => issue.includes("应")), missing, issues,
    liveBucketChecked: false, iamPolicyChecked: false, corsChecked: false, uploadPerformed: false };
}
