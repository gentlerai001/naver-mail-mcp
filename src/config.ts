import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { z } from 'zod';

const configSchema = z.object({
  NAVER_EMAIL: z.email().refine(value => /^[^@]+@naver\.com$/i.test(value)),
  NAVER_APP_PASSWORD: z.string().min(1).refine(value => !/\s/.test(value) && value !== 'replace-with-application-password'),
  NAVER_SENDER_NAME: z.string().max(100).regex(/^[^\r\n\x00]*$/).default(''),
  NAVER_ENABLE_SEND: z.enum(['true', 'false']).default('true'),
});

export interface Config {
  email: string;
  password: string;
  senderName: string;
  enableSend: boolean;
}

// No implicit cwd-based .env lookup: hosts can launch from arbitrary directories.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  let values: Record<string, string | undefined> = {};
  if (env.NAVER_ENV_FILE) {
    try { values = parse(readFileSync(env.NAVER_ENV_FILE)); }
    catch { throw new Error('Cannot read NAVER_ENV_FILE. Check the absolute path and file permissions.'); }
  }
  for (const key of ['NAVER_EMAIL', 'NAVER_APP_PASSWORD', 'NAVER_SENDER_NAME', 'NAVER_ENABLE_SEND']) {
    if (env[key] !== undefined) values[key] = env[key];
  }
  const result = configSchema.safeParse(values);
  if (!result.success) {
    // Zod issues or provider errors may contain supplied values; only report field names.
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Missing or invalid configuration: ${fields.join(', ')}. See .env.example; use a NAVER application password.`);
  }
  const data = result.data;
  return { email: data.NAVER_EMAIL, password: data.NAVER_APP_PASSWORD, senderName: data.NAVER_SENDER_NAME, enableSend: data.NAVER_ENABLE_SEND === 'true' };
}
