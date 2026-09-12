import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import nodemailer from 'nodemailer';
import { SMTP_MESSAGE_LIMIT_BYTES, RECEIVE_MESSAGE_LIMIT_BYTES } from '../src/limits.js';
import { compileMessage } from '../src/mime.js';
import { AttachmentStore } from '../src/attachments.js';
import { NaverMail } from '../src/mail.js';
import { sendSchema } from '../src/schemas.js';

const config = { email: 'test@naver.com', password: 'fixture', senderName: '', enableSend: true };
const input = (extra = {}) => sendSchema.parse({ to: ['recipient@example.com'], subject: 'size test', text: '본문', request_id: 'size-test-001', ...extra });
function folder(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'naver-limits-'));
  t.after(() => { assert.equal(dirname(resolve(root)), resolve(tmpdir())); rmSync(root, { recursive: true, force: true }); });
  return root;
}

test('MIME boundary check includes headers, base64 line wrapping and Unicode content', async () => {
  const options = {
    from: config.email, to: ['recipient@example.com'], bcc: ['hidden@example.com'],
    subject: '한글 제목', text: '본문'.repeat(100), html: '<p>본문</p>',
    messageId: '<fixed@example.com>', date: new Date('2026-09-12T00:00:00Z'), baseBoundary: 'fixed-boundary',
    attachments: [{ filename: '한글.txt', content: Buffer.alloc(4096) }],
  };
  const prepared = await compileMessage(options);
  assert.ok(prepared.size > 4096 * 4 / 3);
  assert.equal(prepared.envelope.size, prepared.raw.length);
  assert.deepEqual(prepared.envelope.to, ['recipient@example.com', 'hidden@example.com']);
  assert.ok(!prepared.raw.toString().includes('Bcc:'));
  assert.equal((await compileMessage(options, prepared.size)).size, prepared.size);
  await assert.rejects(compileMessage(options, prepared.size - 1), /Encoded message exceeds/);
});

test('25 MiB file exceeds old per-file and total caps but fits actual NAVER MIME limit', async t => {
  const root = folder(t); writeFileSync(join(root, 'large.bin'), Buffer.alloc(25 * 1024 * 1024));
  const service = new NaverMail({ ...config, attachmentDir: root }, undefined, () => assert.fail('preview must not connect'));
  const preview = await service.sendEmail(input({ attachments: [{ path: 'large.bin' }], dry_run: true })) as { encoded_message_bytes: number; smtp_limit_bytes: number };
  assert.ok(preview.encoded_message_bytes > 25 * 1024 * 1024);
  assert.ok(preview.encoded_message_bytes < SMTP_MESSAGE_LIMIT_BYTES);
  assert.equal(preview.smtp_limit_bytes, 39845888);
});

test('28 MiB raw file is rejected before SMTP because its encoded message exceeds SIZE', async t => {
  const root = folder(t); writeFileSync(join(root, 'large.bin'), Buffer.alloc(28 * 1024 * 1024));
  const service = new NaverMail({ ...config, attachmentDir: root }, undefined, () => assert.fail('oversize must not connect'));
  for (const dry_run of [true, false]) await assert.rejects(service.sendEmail(input({ attachments: [{ path: 'large.bin' }], dry_run })), /Encoded message exceeds/);
});

test('downloads larger than 10 MiB are accepted within receive ceiling', t => {
  const root = folder(t); const bytes = Buffer.alloc(12 * 1024 * 1024, 7);
  const saved = new AttachmentStore(root).save(bytes, 'large.bin');
  assert.equal(readFileSync(saved.absolute_path).length, bytes.length);
  assert.throws(() => new AttachmentStore(root).save(Buffer.alloc(RECEIVE_MESSAGE_LIMIT_BYTES + 1), 'too-large.bin'), /40 MiB/);
});

test('live SMTP SIZE lower than configured ceiling rejects before MAIL FROM or DATA', async t => {
  const commands: string[] = [];
  const smtp = createServer(socket => {
    socket.setEncoding('utf8'); socket.write('220 localhost ESMTP\r\n');
    let pending = '';
    socket.on('data', chunk => {
      pending += chunk;
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n'); const line = pending.slice(0, end); pending = pending.slice(end + 2); commands.push(line);
        if (line.startsWith('EHLO')) socket.write('250-localhost\r\n250 SIZE 100\r\n');
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => smtp.close(error => error ? reject(error) : resolve())));
  const address = smtp.address(); assert.ok(address && typeof address !== 'string');
  const service = new NaverMail(config, undefined, () => nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true }));
  await assert.rejects(service.sendEmail(input()), /currently advertises a lower limit/);
  assert.ok(commands.some(command => command.startsWith('EHLO')));
  assert.ok(!commands.some(command => command.startsWith('MAIL FROM') || command === 'DATA'));
});
