#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { NaverMail } from './mail.js';
import { createServer } from './server.js';

async function main() {
  const config = loadConfig();
  const server = createServer(new NaverMail(config), config.enableSend);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  // Configuration errors are deliberately value-free. Never print a stack or provider error.
  console.error(error instanceof Error && /^(Missing or invalid configuration:|Cannot read NAVER_ENV_FILE\.)/.test(error.message)
    ? error.message : 'NAVER Mail MCP failed to start. Check the installation and local configuration.');
  process.exitCode = 1;
});
