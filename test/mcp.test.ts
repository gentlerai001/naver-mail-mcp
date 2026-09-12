import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { NaverMail, type MailBackend } from '../src/mail.js';

function backend(): MailBackend {
  return {
    listMailboxes: async () => ({ mailboxes: [{ path: 'INBOX' }] }),
    searchEmails: async input => ({ messages: [{ uid: 1, subject: input.subject }] }),
    getEmail: async () => ({ text: '한글 메일' }),
    sendEmail: async () => ({ status: 'preview' }),
    verifyConnection: async () => ({ imap: 'ok', smtp: 'ok' }),
  };
}

test('MCP handshake discovers tools and dispatches validated requests', async () => {
  const server = createServer(backend(), true);
  const client = new Client({ name: 'test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport); await client.connect(clientTransport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 5);
    assert.equal(tools.tools.find(tool => tool.name === 'send_email')?.annotations?.readOnlyHint, false);
    const result = await client.callTool({ name: 'search_emails', arguments: { subject: '견적서' } });
    assert.match(JSON.stringify(result), /견적서/);
    const invalid = await client.callTool({ name: 'get_email', arguments: { uid: 0 } });
    assert.equal(invalid.isError, true);
    const invalidRange = await client.callTool({ name: 'search_emails', arguments: { since: '2026-10-01', before: '2026-09-01' } });
    assert.equal(invalidRange.isError, true);
  } finally { await client.close(); await server.close(); }
});

test('read-only mode omits send_email and provider errors are redacted over MCP', async () => {
  const mail = backend(); mail.listMailboxes = async () => { throw new Error('secret-password and private mail'); };
  const server = createServer(mail, false);
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    assert.ok(!(await client.listTools()).tools.some(tool => tool.name === 'send_email'));
    const result = await client.callTool({ name: 'list_mailboxes', arguments: {} });
    assert.equal(result.isError, true); assert.ok(!JSON.stringify(result).includes('secret-password'));
  } finally { await client.close(); await server.close(); }
});

test('MCP send preview uses production service without touching network', async () => {
  const config = { email: 'test@naver.com', password: 'fixture-only', senderName: '', enableSend: true };
  const mail = new NaverMail(config, () => assert.fail('unexpected IMAP'), () => assert.fail('unexpected SMTP'));
  const server = createServer(mail, true);
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    const result = await client.callTool({ name: 'send_email', arguments: { to: ['recipient@example.com'], subject: '테스트', text: '본문', request_id: 'preview-001', dry_run: true } });
    assert.notEqual(result.isError, true); assert.match(JSON.stringify(result), /preview/);
  } finally { await client.close(); await server.close(); }
});

test('real stdio subprocess initializes and previews without stdout contamination', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
    cwd: tmpdir(),
    env: { NAVER_EMAIL: 'test@naver.com', NAVER_APP_PASSWORD: 'fixture-only', NAVER_ENABLE_SEND: 'true' },
    stderr: 'pipe',
  });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'stdio-test', version: '1' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 5);
    const result = await client.callTool({ name: 'send_email', arguments: { to: ['recipient@example.com'], subject: '한글', text: '본문', request_id: 'stdio-001', dry_run: true } });
    assert.notEqual(result.isError, true); assert.match(JSON.stringify(result), /preview/);
    assert.equal(stderr, '');
  } finally { await client.close(); }
});
