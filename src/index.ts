#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { LazyMail } from './lazy.js';
import { createServer } from './server.js';
import { startSetupPage } from './setup.js';

async function main() {
  // Without an explicit file or inline credentials, use the per-user default so the
  // browser setup page and a later restart agree on where the account lives.
  const env: NodeJS.ProcessEnv = { ...process.env };
  const defaultEnvFile = join(homedir(), '.naver-mail-mcp', '.env');
  if (!env.NAVER_ENV_FILE && !(env.NAVER_EMAIL && env.NAVER_APP_PASSWORD)) env.NAVER_ENV_FILE = defaultEnvFile;
  const envFile = env.NAVER_ENV_FILE ?? defaultEnvFile;

  // If the account is already configured, honour NAVER_ENABLE_SEND for tool discovery;
  // otherwise expose everything and let the lazy backend report NOT_CONFIGURED.
  let enableSend = true;
  let currentEmail = '';
  try { const config = loadConfig(env); enableSend = config.enableSend; currentEmail = config.email; } catch { /* setup mode */ }

  // Credentials injected by the host (desktop extension settings, plugin options)
  // take precedence over the env file, so the browser page could never change the
  // active account. Hide it and let the host's own settings UI manage the account.
  const hostManaged = !!(process.env.NAVER_EMAIL && process.env.NAVER_APP_PASSWORD);

  const mail = new LazyMail(env);
  const setup = async () => {
    const page = await startSetupPage({ envFile, currentEmail, onSaved: config => { currentEmail = config.email; mail.reset(); } });
    return {
      status: 'setup_page_opened',
      url: page.url,
      expires_in_seconds: Math.round((page.expiresAt - Date.now()) / 1000),
      instructions: 'A setup page opened in the user\'s browser on this computer. Tell the user to enter their NAVER address and application password there. If no window appeared, give them the URL to paste into a browser. Do not ask for the password in chat. Once they report success, tools work immediately without restarting.',
    };
  };
  const server = createServer(mail, enableSend, hostManaged ? {} : { setup });
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  // Never print stacks or provider details.
  console.error('NAVER Mail MCP failed to start. Check the installation.');
  process.exitCode = 1;
});
