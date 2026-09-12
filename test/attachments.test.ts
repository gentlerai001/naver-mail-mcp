import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, linkSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ImapFlow } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import { AttachmentStore, digest, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MESSAGE_BYTES } from '../src/attachments.js';
import { NaverMail } from '../src/mail.js';
import { attachmentMessageSchema, downloadSchema, sendSchema } from '../src/schemas.js';
import { loadConfig } from '../src/config.js';
import { simpleParser } from 'mailparser';

function directory(t: TestContext) {
  const parent = mkdtempSync(join(tmpdir(), 'naver-attachments-'));
  t.after(() => {
    assert.equal(dirname(resolve(parent)), resolve(tmpdir()));
    assert.ok(parent.includes('naver-attachments-'));
    rmSync(parent, { recursive: true, force: true });
  });
  const root = join(parent, 'exchange'); mkdirSync(root);
  return { root, parent, store: new AttachmentStore(root) };
}
const config = { email: 'test@naver.com', password: 'fixture-only', senderName: '', enableSend: true };
const sendInput = (extra = {}) => sendSchema.parse({ to: ['recipient@example.com'], subject: '첨부 테스트', text: '테스트 본문', request_id: 'attachment-test-001', ...extra });
const messageInput = { mailbox: 'INBOX', uid: 9, uid_validity: '123' };

test('exchange folder defaults beside explicit env file and absolute override works', t => {
  const { parent, root } = directory(t);
  const envPath = join(parent, '.env');
  writeFileSync(envPath, 'NAVER_EMAIL=test@naver.com\nNAVER_APP_PASSWORD=fixture-only');
  assert.equal(loadConfig({ NAVER_ENV_FILE: envPath }).attachmentDir, join(parent, 'attachments'));
  assert.equal(loadConfig({ NAVER_ENV_FILE: envPath, NAVER_ATTACHMENT_DIR: root }).attachmentDir, root);
  assert.throws(() => loadConfig({ NAVER_ENV_FILE: envPath, NAVER_ATTACHMENT_DIR: '../outside' }));
});

test('reads Korean file paths and snapshots bytes with a hash; permits zero-byte files', t => {
  const { root, store } = directory(t);
  mkdirSync(join(root, '보낼 파일'));
  const bytes = Buffer.from('한글 첨부\n\x00\xff', 'utf8');
  writeFileSync(join(root, '보낼 파일', '견적서.txt'), bytes);
  const result = store.read('보낼 파일/견적서.txt', '전달 문서.txt');
  assert.equal(result.filename, '전달 문서.txt'); assert.deepEqual(result.content, bytes); assert.equal(result.sha256, digest(bytes));
  writeFileSync(join(root, 'empty.txt'), ''); assert.equal(store.read('empty.txt').size, 0);
});

test('rejects traversal, absolute/UNC paths, ADS, URLs, hidden files and Windows device names', t => {
  const { store, root } = directory(t);
  for (const path of ['../outside.txt', 'sub/../../outside.txt', '..\\outside.txt', '/etc/passwd', 'C:\\secret.txt', '\\\\host\\share\\x', 'https://example.com/x', 'file.txt:secret', '.env', 'sub/.env', 'CON', 'NUL.txt', 'a/../b', 'a//b', 'test.']) {
    assert.throws(() => store.read(path), /relative path/);
  }
  assert.throws(() => store.read(root));
});

test('rejects hard links and linked directories pointing outside the folder', t => {
  const { store, root, parent } = directory(t);
  const outside = join(parent, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'secret.txt'), 'private');
  linkSync(join(outside, 'secret.txt'), join(root, 'hard.txt'));
  assert.throws(() => store.read('hard.txt'), /hard links/);
  symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => store.read('linked/secret.txt'), /links|junctions/);
});

test('enforces individual size and expected hash before any SMTP connection', async t => {
  const { root, store } = directory(t);
  writeFileSync(join(root, 'large.bin'), Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
  assert.throws(() => store.read('large.bin'), /SMTP message limit/);
  writeFileSync(join(root, 'small.txt'), 'original');
  const hash = store.read('small.txt').sha256;
  writeFileSync(join(root, 'small.txt'), 'changed');
  const mail = new NaverMail({ ...config, attachmentDir: root }, undefined, () => assert.fail('must not connect'));
  await assert.rejects(mail.sendEmail(sendInput({ attachments: [{ path: 'small.txt', expected_sha256: hash }] })), /expected_sha256/);
});

test('saves safe generated filenames and refuses overwrites or unsafe save_as', t => {
  const { store, root, parent } = directory(t); const bytes = Buffer.from('downloaded');
  const saved = store.save(bytes, '../../evil.txt');
  assert.equal(dirname(saved.absolute_path), root); assert.ok(!saved.path.includes('..')); assert.deepEqual(readFileSync(saved.absolute_path), bytes);
  store.save(bytes, 'file.txt', 'chosen.txt');
  assert.throws(() => store.save(Buffer.from('overwrite'), 'file.txt', 'chosen.txt'), /already exists/);
  assert.equal(readFileSync(join(root, 'chosen.txt'), 'utf8'), 'downloaded');
  for (const name of ['../outside', '.env', 'CON.txt', 'file.txt:stream', 'sub/file.txt']) assert.throws(() => store.save(bytes, undefined, name));
  const outside = join(parent, 'existing.txt'); writeFileSync(outside, 'original');
  linkSync(outside, join(root, 'existing.txt'));
  assert.throws(() => store.save(bytes, undefined, 'existing.txt'), /already exists/);
  assert.equal(readFileSync(outside, 'utf8'), 'original');
});

test('preview lists metadata without exposing bytes; retries bind to attachment contents', async t => {
  const { root } = directory(t); writeFileSync(join(root, 'file.txt'), 'first');
  let sends = 0;
  const mail = new NaverMail({ ...config, attachmentDir: root }, undefined, () => ({
    sendMail: async (options: { raw: Buffer; envelope: { size: number } }) => {
      sends++; assert.ok(Buffer.isBuffer(options.raw)); assert.equal(options.envelope.size, options.raw.length);
      const parsed = await simpleParser(options.raw); assert.equal(parsed.attachments[0].content.toString(), 'first');
      return { accepted: ['recipient@example.com'], rejected: [] };
    }, close() {},
  }) as unknown as Transporter);
  const input = sendInput({ attachments: [{ path: 'file.txt' }] });
  const preview = await mail.sendEmail({ ...input, dry_run: true }) as { message: { attachments: { sha256: string; size: number }[] } };
  assert.equal(sends, 0); assert.equal(preview.message.attachments[0].sha256, digest(Buffer.from('first')));
  assert.ok(!JSON.stringify(preview).includes('"content"')); assert.ok(!JSON.stringify(preview).includes('"data"'));
  await Promise.all([mail.sendEmail(input), mail.sendEmail(input)]); assert.equal(sends, 1);
  writeFileSync(join(root, 'file.txt'), 'second');
  await assert.rejects(mail.sendEmail(input), /different content/); assert.equal(sends, 1);
});

test('enforces total attachment size and count', async t => {
  const { root } = directory(t); writeFileSync(join(root, 'large.bin'), Buffer.alloc(MAX_ATTACHMENT_BYTES));
  const mail = new NaverMail({ ...config, attachmentDir: root }, undefined, () => assert.fail('must not connect'));
  await assert.rejects(mail.sendEmail(sendInput({ attachments: Array(2).fill({ path: 'large.bin' }) })), /SMTP message limit/);
  assert.equal(sendSchema.safeParse({ ...sendInput(), attachments: Array(11).fill({ path: 'large.bin' }) }).success, false);
  assert.equal(sendSchema.safeParse({ ...sendInput(), attachments: [{ href: 'https://example.com/file' }] }).success, false);
});

async function rawMail() {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const message = await transport.sendMail({ from: config.email, to: config.email, subject: '첨부', text: '본문', attachments: [
    { filename: '한글 문서.txt', content: Buffer.from('안녕하세요\r\n') }, { filename: 'binary.bin', content: bytes },
  ] });
  assert.ok(Buffer.isBuffer(message.message));
  return { raw: message.message, bytes };
}

function imap(raw: Buffer, overrides = {}) {
  const calls = { releases: 0, closed: 0, fetches: 0 };
  const client = {
    mailbox: { uidValidity: 123n }, on() {}, connect: async () => {}, close: () => { calls.closed++; },
    getMailboxLock: async (_path: string, options: unknown) => { assert.deepEqual(options, { readOnly: true }); return { release() { calls.releases++; } }; },
    fetchOne: async (uid: number, query: { source?: { maxLength: number } }, options: unknown) => {
      calls.fetches++; assert.equal(uid, 9); assert.deepEqual(options, { uid: true });
      if (query.source) { assert.equal(query.source.maxLength, MAX_ATTACHMENT_MESSAGE_BYTES + 1); return { uid, source: raw }; }
      return { uid, size: raw.length };
    }, ...overrides,
  } as unknown as ImapFlow;
  return { client, calls };
}

test('lists stable indexes and downloads exact binary attachment without changing mailbox state', async t => {
  const { root } = directory(t); const { raw, bytes } = await rawMail(); const { client, calls } = imap(raw);
  const mail = new NaverMail({ ...config, attachmentDir: root }, () => client);
  const list = await mail.listAttachments(attachmentMessageSchema.parse(messageInput));
  assert.deepEqual(list.attachments.map(file => file.attachment_index), [0, 1]);
  assert.equal(list.attachments[0].filename, '한글 문서.txt'); assert.equal(list.attachments[1].sha256, digest(bytes));
  const result = await mail.downloadAttachment(downloadSchema.parse({ ...messageInput, attachment_index: 1, save_as: 'saved.bin' }));
  assert.deepEqual(readFileSync(result.absolute_path), bytes); assert.equal(result.sha256, digest(bytes));
  assert.equal(calls.releases, 2); assert.equal(calls.closed, 2);
});

test('rejects stale identity, oversized messages and missing indexes without creating files', async t => {
  const { root } = directory(t); const { raw } = await rawMail();
  for (const [overrides, index, pattern] of [
    [{ mailbox: { uidValidity: 999n } }, 0, /identity changed/],
    [{ fetchOne: async () => ({ size: MAX_ATTACHMENT_MESSAGE_BYTES + 1 }) }, 0, /40 MiB/],
    [{}, 99, /index is not present/],
  ] as const) {
    const { client } = imap(raw, overrides);
    await assert.rejects(new NaverMail({ ...config, attachmentDir: root }, () => client).downloadAttachment(downloadSchema.parse({ ...messageInput, attachment_index: index })), pattern);
  }
  assert.deepEqual(readdirSync(root), []);
});
