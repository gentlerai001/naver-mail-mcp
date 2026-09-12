import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { ImapFlow } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import { simpleParser } from 'mailparser';
import { NaverMail, MAX_MESSAGE_BYTES, imapOptions, smtpOptions } from '../src/mail.js';
import { searchSchema, readSchema, sendSchema } from '../src/schemas.js';
import { publicError } from '../src/errors.js';

const config = { email: 'test@naver.com', password: 'test-password-only', senderName: '테스트', enableSend: true };
const input = (extra = {}) => sendSchema.parse({ to: ['recipient@example.com'], subject: '한글 제목', text: '안녕하세요. 본문입니다.', request_id: 'send-test-001', ...extra });

function fakeImap(overrides: Record<string, unknown> = {}) {
  const calls = { connected: 0, closed: 0, released: 0, fetched: [] as unknown[], searches: [] as unknown[] };
  const client = {
    mailbox: { exists: 3, uidValidity: 123n },
    on: () => {}, connect: async () => { calls.connected++; }, close: () => { calls.closed++; },
    getMailboxLock: async (path: string, options: unknown) => {
      assert.equal(path, 'INBOX'); assert.deepEqual(options, { readOnly: true });
      return { release: () => { calls.released++; } };
    },
    list: async () => [{ path: 'INBOX', name: '받은메일함', flags: new Set(), specialUse: '\\Inbox' }],
    search: async (query: unknown, options: unknown) => { calls.searches.push({ query, options }); return [4, 9, 7]; },
    fetch: async function* (uids: number[], query: unknown, options: unknown) {
      calls.fetched.push({ uids, query, options });
      for (const uid of [...uids].reverse()) yield { uid, seq: uid, envelope: { subject: '제목' }, flags: new Set() };
    },
    ...overrides,
  };
  return { client: client as unknown as ImapFlow, calls };
}

test('IMAP uses verified TLS; SMTP requires STARTTLS and blocks external content sources', () => {
  assert.equal(imapOptions(config).secure, true);
  assert.equal(imapOptions(config).tls.rejectUnauthorized, true);
  assert.equal(smtpOptions(config).requireTLS, true);
  assert.equal(smtpOptions(config).disableFileAccess, true);
  assert.equal(smtpOptions(config).disableUrlAccess, true);
});

test('search combines filters, uses UIDs, orders newest first and returns pagination identity', async () => {
  const { client, calls } = fakeImap();
  const service = new NaverMail(config, () => client);
  const data = await service.searchEmails(searchSchema.parse({ subject: '청구서', unread_only: true, since: '2026-09-01', before: '2026-10-01', limit: 2 }));
  assert.deepEqual(data.messages.map(mail => mail.uid), [9, 7]);
  assert.equal(data.next_before_uid, 7);
  assert.equal(data.uid_validity, '123');
  assert.deepEqual(calls.searches[0], { query: { all: true, subject: '청구서', seen: false, since: '2026-09-01', before: '2026-10-01' }, options: { uid: true } });
  assert.equal(calls.released, 1); assert.equal(calls.closed, 1);
});

test('pagination excludes new arrivals and already returned UIDs', async () => {
  const { client, calls } = fakeImap();
  const data = await new NaverMail(config, () => client).searchEmails(searchSchema.parse({ before_uid: 7 }));
  assert.deepEqual(data.messages.map(mail => mail.uid), [4]);
  assert.deepEqual(calls.searches[0], { query: { all: true, uid: '1:6' }, options: { uid: true } });
  assert.equal(data.next_before_uid, null);
});

test('empty mailbox and cursor 1 never fetch a wildcard range', async () => {
  for (const extra of [{ mailbox: { exists: 0, uidValidity: 123n } }, {}]) {
    const { client, calls } = fakeImap(extra);
    const data = await new NaverMail(config, () => client).searchEmails(searchSchema.parse({ before_uid: 1 }));
    assert.deepEqual(data.messages, []); assert.equal(calls.fetched.length, 0); assert.equal(calls.searches.length, 0);
  }
});

test('search failure releases mailbox lock and closes connection', async () => {
  const { client, calls } = fakeImap({ search: async () => { throw new Error('provider-secret'); } });
  await assert.rejects(new NaverMail(config, () => client).searchEmails(searchSchema.parse({})));
  assert.equal(calls.released, 1); assert.equal(calls.closed, 1);
});

test('connection failure still closes the connection', async () => {
  const { client, calls } = fakeImap({ connect: async () => { throw new Error('auth'); } });
  await assert.rejects(new NaverMail(config, () => client).listMailboxes());
  assert.equal(calls.closed, 1);
});

test('UIDVALIDITY mismatch fails before fetching', async () => {
  const { client, calls } = fakeImap({ fetchOne: async () => assert.fail('must not fetch') });
  await assert.rejects(new NaverMail(config, () => client).getEmail(readSchema.parse({ uid: 9, uid_validity: '999' })), /identity changed/);
  assert.equal(calls.released, 1);
});

test('reads Korean MIME, returns attachment metadata only and truncates body', async () => {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const composed = await composer.sendMail({ from: config.email, to: 'recipient@example.com', subject: '한글 제목', text: '안녕하세요.'.repeat(30), attachments: [{ filename: '문서.txt', content: '첨부 내용' }] });
  assert.ok(Buffer.isBuffer(composed.message));
  const raw = composed.message;
  let fetches = 0;
  const { client, calls } = fakeImap({ fetchOne: async (uid: number, query: { source?: { maxLength: number } }, options: unknown) => {
    assert.equal(uid, 9); assert.deepEqual(options, { uid: true }); fetches++;
    if (query.source) {
      assert.equal(query.source.maxLength, MAX_MESSAGE_BYTES + 1);
      return { uid, source: raw };
    }
    return { uid, seq: 1, size: raw.length, flags: new Set() };
  } });
  const data = await new NaverMail(config, () => client).getEmail(readSchema.parse({ uid: 9, uid_validity: '123', max_chars: 100 }));
  assert.equal(data.subject, '한글 제목'); assert.equal(data.truncated, true); assert.equal(data.text.length, 100);
  assert.equal(data.unread, true); assert.equal(data.attachments[0].filename, '문서.txt');
  assert.ok(!('content' in data.attachments[0])); assert.equal(fetches, 2); assert.equal(calls.closed, 1);
});

test('HTML-only messages are converted to text', async () => {
  const raw = Buffer.from('From: test@example.com\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>안녕하세요</p><img src="https://example.invalid/tracker">');
  const { client } = fakeImap({ fetchOne: async (_uid: number, query: { source?: unknown }) => query.source ? { source: raw } : { uid: 9, seq: 1, size: raw.length, flags: new Set() } });
  const data = await new NaverMail(config, () => client).getEmail(readSchema.parse({ uid: 9, uid_validity: '123' }));
  assert.match(data.text, /안녕하세요/); assert.ok(!data.text.includes('<p>'));
});

test('oversized and missing messages fail before downloading source', async () => {
  for (const result of [false, { uid: 9, seq: 1, size: MAX_MESSAGE_BYTES + 1 }]) {
    let fetches = 0;
    const { client } = fakeImap({ fetchOne: async () => { fetches++; return result; } });
    await assert.rejects(new NaverMail(config, () => client).getEmail(readSchema.parse({ uid: 9, uid_validity: '123' })));
    assert.equal(fetches, 1);
  }
});

test('preview neither connects to SMTP nor consumes request_id', async () => {
  let sends = 0;
  const service = new NaverMail(config, undefined, () => ({ sendMail: async () => { sends++; return { accepted: input().to, rejected: [] }; }, close() {} }) as unknown as Transporter);
  const preview = await service.sendEmail(input({ dry_run: true }));
  assert.equal((preview as { status: string }).status, 'preview'); assert.equal(sends, 0);
  await service.sendEmail(input()); assert.equal(sends, 1);
});

test('concurrent retries send once, return same result and reject changed content', async () => {
  let sends = 0;
  const service = new NaverMail(config, undefined, () => ({ sendMail: async () => { sends++; await new Promise(resolve => setTimeout(resolve, 10)); return { messageId: '<test@naver.com>', accepted: input().to, rejected: [] }; }, close() {} }) as unknown as Transporter);
  const results = await Promise.all([service.sendEmail(input()), service.sendEmail(input())]);
  assert.equal(sends, 1); assert.deepEqual(results[0], results[1]);
  await assert.rejects(service.sendEmail(input({ text: '다른 본문' })), /different content/);
});

test('uncertain failure is not retried or exposed with provider details', async () => {
  let sends = 0;
  const service = new NaverMail(config, undefined, () => ({ sendMail: async () => { sends++; throw new Error('secret-password and body'); }, close() {} }) as unknown as Transporter);
  for (let i = 0; i < 2; i++) await assert.rejects(service.sendEmail(input()), error => {
    const message = publicError(error); assert.equal(message.code, 'SEND_FAILED_OR_UNKNOWN'); assert.ok(!message.message.includes('secret-password')); return true;
  });
  assert.equal(sends, 1);
});

test('actual SMTP exchange preserves Korean/reply headers, hides Bcc and reports partial rejection', async t => {
  let raw = '';
  const recipients: string[] = [];
  // Loopback-only test fixture. Production always requires verified TLS at NAVER.
  const smtp = createServer(socket => {
    socket.setEncoding('utf8'); socket.write('220 localhost ESMTP\r\n');
    let pending = ''; let inData = false;
    socket.on('data', chunk => {
      pending += chunk;
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n'); const line = pending.slice(0, end); pending = pending.slice(end + 2);
        if (inData) {
          if (line === '.') { inData = false; socket.write('250 queued\r\n'); }
          else raw += line.replace(/^\.\./, '.') + '\r\n';
        } else if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (/^MAIL FROM:/.test(line)) socket.write('250 ok\r\n');
        else if (/^RCPT TO:/.test(line)) {
          recipients.push(line);
          socket.write(line.includes('hidden@example.com') ? '550 rejected for fixture\r\n' : '250 ok\r\n');
        } else if (line === 'DATA') { inData = true; socket.write('354 send message\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => smtp.close(error => error ? reject(error) : resolve())));
  const address = smtp.address(); assert.ok(address && typeof address !== 'string');
  const service = new NaverMail(config, undefined, () => nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true }));
  const result = await service.sendEmail(input({ cc: ['copy@example.com'], bcc: ['hidden@example.com'], in_reply_to: '<original@example.com>' })) as { status: string; accepted: string[]; rejected: string[] };
  assert.equal(result.status, 'partially_accepted'); assert.ok(raw);
  assert.deepEqual(result.rejected, ['hidden@example.com']); assert.equal(result.accepted.length, 2); assert.equal(recipients.length, 3);
  const parsed = await simpleParser(raw);
  assert.equal(parsed.subject, '한글 제목'); assert.match(parsed.text ?? '', /안녕하세요/);
  assert.equal(parsed.from?.value[0].address, config.email); assert.equal(parsed.inReplyTo, '<original@example.com>');
  assert.equal(parsed.bcc, undefined); // Bcc recipients must not leak into delivered headers.
});

test('disabled sending never creates SMTP transport', async () => {
  const service = new NaverMail({ ...config, enableSend: false }, undefined, () => assert.fail('SMTP must not be created'));
  await assert.rejects(service.sendEmail(input()), /enable sending/);
});

test('verify_connection authenticates without sending mail', async () => {
  const { client } = fakeImap(); let verified = 0;
  const service = new NaverMail(config, () => client, () => ({ verify: async () => { verified++; }, sendMail: () => assert.fail('must not send'), close() {} }) as unknown as Transporter);
  assert.deepEqual(await service.verifyConnection(), { imap: 'ok', smtp: 'ok' }); assert.equal(verified, 1);
});
