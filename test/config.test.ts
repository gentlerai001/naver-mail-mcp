import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { publicError } from '../src/errors.js';
import { readSchema, searchSchema, sendSchema } from '../src/schemas.js';

test('missing and invalid credentials are rejected without revealing values', () => {
  assert.throws(() => loadConfig({}), /NAVER_EMAIL/);
  assert.throws(() => loadConfig({ NAVER_EMAIL: 'test@naver.com', NAVER_APP_PASSWORD: 'secret password' }), error => {
    assert.ok(error instanceof Error); assert.ok(!error.message.includes('secret password')); return true;
  });
  assert.throws(() => loadConfig({ NAVER_EMAIL: 'test@example.com', NAVER_APP_PASSWORD: 'test-only' }));
});

test('explicit env file works with spaces and Korean paths; environment overrides it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'naver 테스트 '));
  try {
    const path = join(directory, '.env');
    writeFileSync(path, 'NAVER_EMAIL=test@naver.com\nNAVER_APP_PASSWORD="fixture-only"\nNAVER_ENABLE_SEND=true\nNAVER_SENDER_NAME="한글 # 이름"\n');
    const config = loadConfig({ NAVER_ENV_FILE: path, NAVER_ENABLE_SEND: 'false', NAVER_EMAIL: '', NAVER_APP_PASSWORD: '' });
    assert.equal(config.senderName, '한글 # 이름'); assert.equal(config.enableSend, false); assert.equal(config.password, 'fixture-only');
    assert.throws(() => loadConfig({ NAVER_ENV_FILE: join(directory, 'missing') }), /Cannot read/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('input rejects header injection, bad dates, reversed dates, UID misuse and recipient overflow', () => {
  const send = { to: ['recipient@example.com'], subject: '제목', text: '본문', request_id: 'test-001' };
  assert.equal(sendSchema.safeParse({ ...send, subject: 'hello\r\nBcc: leak@example.com' }).success, false);
  assert.equal(sendSchema.safeParse({ ...send, cc: Array(20).fill('copy@example.com') }).success, false);
  assert.equal(sendSchema.safeParse({ ...send, html: { path: '/private/file' } }).success, false);
  assert.equal(sendSchema.safeParse({ ...send, html: 'a'.repeat(200001) }).success, false);
  assert.equal(searchSchema.safeParse({ since: '2026-02-30' }).success, false);
  assert.equal(searchSchema.safeParse({ since: '2026-10-01', before: '2026-09-01' }).success, false);
  assert.equal(readSchema.safeParse({ uid: 0, uid_validity: '123' }).success, false);
  assert.equal(readSchema.safeParse({ uid: 9 }).success, false);
});

test('provider error redaction omits credentials and mail content', () => {
  const error = Object.assign(new Error('AUTH secret-password mail body'), { code: 'EAUTH', response: 'secret-password' });
  assert.equal(publicError(error).code, 'AUTHENTICATION_FAILED');
  assert.ok(!JSON.stringify(publicError(error)).includes('secret-password'));
  assert.ok(!JSON.stringify(publicError(new Error('mail body'))).includes('mail body'));
});
