import MailComposer from 'nodemailer/lib/mail-composer';
import { MailError } from './errors.js';
import { SMTP_MESSAGE_LIMIT_BYTES } from './limits.js';

export async function compileMessage(options: ConstructorParameters<typeof MailComposer>[0], limit = SMTP_MESSAGE_LIMIT_BYTES) {
  const compiled = new MailComposer({ ...options, disableFileAccess: true, disableUrlAccess: true, newline: '\r\n' }).compile();
  const stream = compiled.createReadStream();
  const chunks: Buffer[] = [];
  let size = 0;
  // Count actual MIME bytes (headers, boundaries, base64 wrapping and bodies),
  // stopping immediately at the limit instead of building an oversized buffer.
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new MailError('MESSAGE_TOO_LARGE', `Encoded message exceeds the SMTP limit of ${limit} bytes. Reduce attachments or use NAVER webmail large-file links.`);
    chunks.push(buffer);
  }
  const envelope = compiled.getEnvelope();
  if (!envelope.from) throw new MailError('INVALID_SENDER', 'Message requires a sender.');
  return { raw: Buffer.concat(chunks, size), size, envelope: { from: envelope.from, to: envelope.to, size } };
}
