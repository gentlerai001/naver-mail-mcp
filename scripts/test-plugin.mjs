import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(process.argv[2] || join(homedir(), 'plugins', 'naver-mail-mcp'));
const config = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8')).mcpServers['naver-mail'];
const client = new Client({ name: 'plugin-smoke-test', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: config.args,
  cwd: resolve(root, config.cwd),
  env: { NAVER_EMAIL: 'fixture@naver.com', NAVER_APP_PASSWORD: 'fixture-only', NAVER_ENABLE_SEND: 'true' },
  stderr: 'pipe',
});
let stderr = '';
transport.stderr.on('data', chunk => { stderr += chunk.toString(); });
try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(names, ['download_attachment', 'get_email', 'list_attachments', 'list_mailboxes', 'search_emails', 'send_email', 'verify_connection']);
  const preview = await client.callTool({ name: 'send_email', arguments: {
    to: ['nobody@example.com'], subject: '플러그인 테스트', text: '미리보기만 확인',
    html: '<h1>플러그인 테스트</h1>', dry_run: true, request_id: 'plugin-smoke-test',
  } });
  assert.notEqual(preview.isError, true);
  assert.match(JSON.stringify(preview), /encoded_message_bytes/);
  assert.equal(stderr, '');
  console.log('PASS: packaged plugin initializes, exposes 7 tools, and previews HTML with fixture credentials. No mail sent.');
} finally { await client.close(); }
