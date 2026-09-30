import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LazyMail } from '../src/lazy.js';
import { createServer } from '../src/server.js';
import { startSetupPage } from '../src/setup.js';

test('unconfigured server exposes setup tool and reports NOT_CONFIGURED without crashing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'naver-setup-'));
  const mail = new LazyMail({ NAVER_ENV_FILE: join(directory, 'missing.env') });
  const server = createServer(mail, true, { setup: async () => ({ status: 'setup_page_opened', url: 'http://127.0.0.1:1/x' }) });
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.ok(names.includes('setup_naver_mail')); assert.equal(names.length, 8);
    const result = await client.callTool({ name: 'list_mailboxes', arguments: {} });
    assert.equal(result.isError, true); assert.match(JSON.stringify(result), /NOT_CONFIGURED/);
    const setup = await client.callTool({ name: 'setup_naver_mail', arguments: {} });
    assert.match(JSON.stringify(setup), /setup_page_opened/);
  } finally { await client.close(); await server.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('setup page validates input, verifies the account and writes the env file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'naver 설정 '));
  const envFile = join(directory, '.env');
  const verified: string[] = [];
  let saved = false;
  const pageInfo = await startSetupPage({
    envFile, openBrowser: false, ttlMs: 30_000,
    verify: async config => { verified.push(config.email); if (config.password === 'wrong-pass') throw new Error('EAUTH'); return { imap: 'ok' }; },
    onSaved: () => { saved = true; },
  });
  try {
    const form = await fetch(pageInfo.url);
    assert.equal(form.status, 200); assert.match(await form.text(), /애플리케이션 비밀번호/);
    assert.equal((await fetch(`${pageInfo.url}-other`)).status, 404);
    const post = (body: Record<string, string>) => fetch(`${pageInfo.url}/save`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
    });
    const badEmail = await post({ email: 'me@gmail.com', password: 'abc', send: '1' });
    assert.match(await badEmail.text(), /@naver\.com/); assert.equal(verified.length, 0);
    const badPassword = await post({ email: 'me@naver.com', password: 'wrong-pass', send: '1' });
    assert.match(await badPassword.text(), /로그인하지 못했습니다/); assert.equal(saved, false);
    const good = await post({ email: 'me@naver.com', password: 'app-pass-123', sender: '홍길동' });
    assert.match(await good.text(), /연결 완료/);
    assert.equal(saved, true); assert.deepEqual(verified, ['me@naver.com', 'me@naver.com']);
    const contents = readFileSync(envFile, 'utf8');
    assert.match(contents, /NAVER_EMAIL=me@naver\.com/); assert.match(contents, /NAVER_APP_PASSWORD=app-pass-123/);
    assert.match(contents, /NAVER_SENDER_NAME="홍길동"/); assert.match(contents, /NAVER_ENABLE_SEND=false/);
    const lazy = new LazyMail({ NAVER_ENV_FILE: envFile });
    await assert.rejects(() => lazy.sendEmail({} as never), (error: unknown) => (error as { code?: string }).code === 'SEND_DISABLED');
  } finally { pageInfo.close(); rmSync(directory, { recursive: true, force: true }); }
});
