import { createHash, randomUUID } from 'node:crypto';
import { ImapFlow, type FetchMessageObject, type SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer, { type Transporter } from 'nodemailer';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AttachmentStore, digest, MAX_ATTACHMENT_MESSAGE_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from './attachments.js';
import { RECEIVE_MESSAGE_LIMIT_BYTES, SMTP_MESSAGE_LIMIT_BYTES } from './limits.js';
import { compileMessage } from './mime.js';
import type { Config } from './config.js';
import { MailError } from './errors.js';
import type { AttachmentMessageInput, DownloadInput, ReadInput, SearchInput, SendInput } from './schemas.js';

export const MAX_MESSAGE_BYTES = RECEIVE_MESSAGE_LIMIT_BYTES;
export interface MailBackend {
  listMailboxes(): Promise<unknown>;
  searchEmails(input: SearchInput): Promise<unknown>;
  getEmail(input: ReadInput): Promise<unknown>;
  sendEmail(input: SendInput): Promise<unknown>;
  verifyConnection(): Promise<unknown>;
  listAttachments(input: AttachmentMessageInput): Promise<unknown>;
  downloadAttachment(input: DownloadInput): Promise<unknown>;
}

function attachmentMetadata(file: Awaited<ReturnType<typeof simpleParser>>['attachments'][number], index: number) {
  return { attachment_index: index, filename: file.filename ?? null, content_type: file.contentType, size: file.size, sha256: digest(file.content) };
}

export function imapOptions(config: Config) {
  return {
    host: 'imap.naver.com', port: 993, secure: true,
    auth: { user: config.email, pass: config.password },
    logger: false as const, disableAutoIdle: true,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
  };
}

export function smtpOptions(config: Config) {
  return {
    host: 'smtp.naver.com', port: 587, secure: false, requireTLS: true,
    auth: { user: config.email, pass: config.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  };
}

export function buildSearch(input: SearchInput): SearchObject {
  const query: SearchObject = { all: true };
  for (const key of ['from', 'to', 'subject', 'text', 'since', 'before'] as const) {
    if (input[key] !== undefined) query[key] = input[key];
  }
  if (input.unread_only) query.seen = false;
  if (input.before_uid !== undefined && input.before_uid > 1) query.uid = `1:${input.before_uid - 1}`;
  return query;
}

function summary(message: FetchMessageObject) {
  const envelope = message.envelope;
  return {
    uid: message.uid, subject: envelope?.subject ?? '',
    from: envelope?.from ?? [], to: envelope?.to ?? [],
    date: envelope?.date instanceof Date ? envelope.date.toISOString() : envelope?.date ?? null,
    received_at: message.internalDate instanceof Date ? message.internalDate.toISOString() : message.internalDate ?? null,
    message_id: envelope?.messageId ?? null,
    unread: !message.flags?.has('\\Seen'), size: message.size ?? null,
  };
}

export class NaverMail implements MailBackend {
  private activeReads = 0;
  // Retain every attempted send for the process lifetime, including uncertain failures.
  private sends = new Map<string, { hash: string; result: Promise<unknown> }>();

  private attachmentStore() {
    return new AttachmentStore(this.config.attachmentDir ?? join(homedir(), '.naver-mail-mcp', 'attachments'));
  }

  constructor(
    private readonly config: Config,
    private readonly makeImap: () => ImapFlow = () => new ImapFlow(imapOptions(config)),
    private readonly makeSmtp: () => Transporter = () => nodemailer.createTransport(smtpOptions(config)),
  ) {}

  private async withImap<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
    if (this.activeReads >= 4) throw new MailError('BUSY', 'Too many concurrent mail operations. Retry shortly.');
    this.activeReads++;
    let client: ImapFlow | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      client = this.makeImap();
      const connection = client;
      connection.on('error', () => { /* Commands reject; never log provider data. */ });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new MailError('TIMEOUT', 'IMAP operation timed out. Narrow the search and try again.'));
          connection.close();
        }, 45000);
      });
      return await Promise.race([(async () => { await connection.connect(); return operation(connection); })(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      // Each request owns its connection. Closing also cancels pending work on timeout.
      client?.close();
      this.activeReads--;
    }
  }

  async listMailboxes() {
    return this.withImap(async client => ({
      mailboxes: (await client.list()).map(box => ({
        path: box.path, name: box.name, special_use: box.specialUse ?? null,
        selectable: !box.flags.has('\\Noselect'),
      })),
    }));
  }

  async searchEmails(input: SearchInput) {
    return this.withImap(async client => {
      const lock = await client.getMailboxLock(input.mailbox, { readOnly: true });
      try {
        if (!client.mailbox) throw new MailError('MAILBOX_UNAVAILABLE', 'Mailbox could not be opened.');
        const uidValidity = client.mailbox.uidValidity.toString();
        const result = input.before_uid === 1 || client.mailbox.exists === 0 ? [] : await client.search(buildSearch(input), { uid: true });
        if (!Array.isArray(result)) throw new MailError('SEARCH_FAILED', 'IMAP search did not return a result. Try a narrower search.');
        const uids = result.filter(uid => input.before_uid === undefined || uid < input.before_uid).sort((a, b) => b - a);
        const page = uids.slice(0, input.limit);
        const messages: ReturnType<typeof summary>[] = [];
        if (page.length) {
          for await (const message of client.fetch(page, { uid: true, envelope: true, flags: true, size: true, internalDate: true }, { uid: true })) {
            messages.push(summary(message));
          }
        }
        return {
          mailbox: input.mailbox, uid_validity: uidValidity,
          matched_remaining: uids.length,
          messages: messages.sort((a, b) => b.uid - a.uid),
          next_before_uid: uids.length > page.length ? page.at(-1) : null,
        };
      } finally { lock.release(); }
    });
  }

  async getEmail(input: ReadInput) {
    return this.withImap(async client => {
      const lock = await client.getMailboxLock(input.mailbox, { readOnly: true });
      try {
        if (!client.mailbox || client.mailbox.uidValidity.toString() !== input.uid_validity) {
          throw new MailError('STALE_UID', 'Mailbox identity changed. Search again before reading.');
        }
        const meta = await client.fetchOne(input.uid, { uid: true, size: true, envelope: true, flags: true, internalDate: true }, { uid: true });
        if (!meta) throw new MailError('NOT_FOUND', 'Message no longer exists in this mailbox. Search again.');
        if (meta.size === undefined || meta.size > MAX_MESSAGE_BYTES) {
          throw new MailError('MESSAGE_TOO_LARGE', 'Reading requires a known message size of at most 40 MiB, including attachments.');
        }
        const message = await client.fetchOne(input.uid, { source: { maxLength: MAX_MESSAGE_BYTES + 1 } }, { uid: true });
        if (!message || !message.source) throw new MailError('NOT_FOUND', 'Message content is unavailable.');
        if (message.source.length > MAX_MESSAGE_BYTES) throw new MailError('MESSAGE_TOO_LARGE', 'Message exceeds the 40 MiB incoming message parsing ceiling.');
        const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
        const body = parsed.text ?? '';
        return {
          ...summary(meta), mailbox: input.mailbox, uid_validity: input.uid_validity,
          from: parsed.from?.value ?? [], to: parsed.to ? [parsed.to].flat().flatMap(value => value.value) : [],
          cc: parsed.cc ? [parsed.cc].flat().flatMap(value => value.value) : [],
          reply_to: parsed.replyTo?.value ?? [],
          subject: parsed.subject ?? '', message_id: parsed.messageId ?? null,
          references: parsed.references ?? [],
          text: body.slice(0, input.max_chars), truncated: body.length > input.max_chars, total_chars: body.length,
          attachments: parsed.attachments.map(attachmentMetadata),
        };
      } finally { lock.release(); }
    });
  }

  async verifyConnection() {
    await this.withImap(async () => undefined);
    if (!this.config.enableSend) return { imap: 'ok', smtp: 'disabled' };
    const transport = this.makeSmtp();
    try { await transport.verify(); return { imap: 'ok', smtp: 'ok' }; }
    finally { transport.close(); }
  }

  private async attachmentMessage(input: AttachmentMessageInput) {
    return this.withImap(async client => {
      const lock = await client.getMailboxLock(input.mailbox, { readOnly: true });
      try {
        if (!client.mailbox || client.mailbox.uidValidity.toString() !== input.uid_validity) {
          throw new MailError('STALE_UID', 'Mailbox identity changed. Search again before downloading.');
        }
        const meta = await client.fetchOne(input.uid, { size: true }, { uid: true });
        if (!meta) throw new MailError('NOT_FOUND', 'Message no longer exists. Search again.');
        if (meta.size === undefined || meta.size > MAX_ATTACHMENT_MESSAGE_BYTES) {
          throw new MailError('MESSAGE_TOO_LARGE', 'Attachment operations support messages up to 40 MiB including MIME encoding.');
        }
        const message = await client.fetchOne(input.uid, { source: { maxLength: MAX_ATTACHMENT_MESSAGE_BYTES + 1 } }, { uid: true });
        if (!message || !message.source) throw new MailError('NOT_FOUND', 'Message content is unavailable.');
        if (message.source.length > MAX_ATTACHMENT_MESSAGE_BYTES) throw new MailError('MESSAGE_TOO_LARGE', 'Message exceeds the 40 MiB incoming message parsing ceiling.');
        return await simpleParser(message.source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
      } finally { lock.release(); }
    });
  }

  async listAttachments(input: AttachmentMessageInput) {
    const parsed = await this.attachmentMessage(input);
    return { ...input, message_id: parsed.messageId ?? null, attachments: parsed.attachments.map(attachmentMetadata) };
  }

  async downloadAttachment(input: DownloadInput) {
    const parsed = await this.attachmentMessage(input);
    const file = parsed.attachments[input.attachment_index];
    if (!file) throw new MailError('ATTACHMENT_NOT_FOUND', 'Attachment index is not present. Call list_attachments first.');
    const saved = this.attachmentStore().save(file.content, file.filename, input.save_as);
    return { ...saved, attachment_index: input.attachment_index, original_filename: file.filename ?? null, content_type: file.contentType };
  }

  async sendEmail(input: SendInput): Promise<unknown> {
    if (!this.config.enableSend) throw new MailError('SEND_DISABLED', 'Set NAVER_ENABLE_SEND=true to enable sending.');
    let totalSize = 0;
    const files = input.attachments.map(file => {
      const loaded = this.attachmentStore().read(file.path, file.filename, file.expected_sha256);
      totalSize += loaded.size;
      if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) throw new MailError('ATTACHMENT_TOTAL_TOO_LARGE', `Raw attachments alone exceed the ${SMTP_MESSAGE_LIMIT_BYTES}-byte SMTP message limit.`);
      return loaded;
    });
    const content = {
      from: { name: this.config.senderName, address: this.config.email },
      to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text, html: input.html,
      inReplyTo: input.in_reply_to, references: input.references,
      attachments: files.map(({ content: _bytes, ...metadata }) => metadata),
    };
    const messageId = `<${randomUUID()}@naver.com>`;
    const prepare = () => compileMessage({
      ...content, messageId,
      attachments: files.map(file => ({ filename: file.filename, content: file.content, contentDisposition: 'attachment' })),
    });
    if (input.dry_run) {
      const prepared = await prepare();
      return { status: 'preview', request_id: input.request_id, message: content, encoded_message_bytes: prepared.size, smtp_limit_bytes: SMTP_MESSAGE_LIMIT_BYTES };
    }
    const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    const previous = this.sends.get(input.request_id);
    if (previous) {
      if (previous.hash !== hash) throw new MailError('REQUEST_ID_CONFLICT', 'This request_id was already used with different content.');
      return previous.result;
    }
    if (this.sends.size >= 1000) throw new MailError('SEND_LIMIT', 'This process reached 1000 send attempts. Review prior deliveries before restarting.');
    // Defer SMTP until the deduplication entry exists, including concurrent retries.
    const result = Promise.resolve().then(async () => {
      const prepared = await prepare();
      const transport = this.makeSmtp();
      try {
        const info = await transport.sendMail({
          raw: prepared.raw, envelope: prepared.envelope, messageId,
          disableFileAccess: true, disableUrlAccess: true,
        });
        return {
          status: info.rejected?.length ? 'partially_accepted' : 'accepted',
          request_id: input.request_id, message_id: info.messageId ?? messageId,
          encoded_message_bytes: prepared.size, smtp_limit_bytes: SMTP_MESSAGE_LIMIT_BYTES,
          accepted: info.accepted ?? [], rejected: info.rejected ?? [],
          note: 'SMTP acceptance is not proof of inbox delivery. Do not resend to already accepted recipients.',
        };
      } catch (error) {
        // Nodemailer checks envelope.size against this connection's advertised
        // SIZE before MAIL FROM. A lower live limit is a definite no-send result.
        if (error instanceof Error && /^Message size larger than allowed \d+$/.test(error.message)) {
          throw new MailError('MESSAGE_TOO_LARGE', 'The SMTP server currently advertises a lower limit than this message size. No message was sent.');
        }
        throw new MailError('SEND_FAILED_OR_UNKNOWN', 'SMTP send failed or its outcome is uncertain. This request_id will not be retried in this process. Check NAVER sent mail and delivery status before starting another send.');
      } finally { transport.close(); }
    });
    this.sends.set(input.request_id, { hash, result });
    return result;
  }
}
