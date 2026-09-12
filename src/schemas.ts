import { z } from 'zod';

const header = z.string().regex(/^[^\r\n\x00]*$/, 'Header must not contain line breaks or NUL');
const mailbox = header.min(1).max(500).default('INBOX');
const date = z.iso.date();
const email = z.email().max(254);

export const searchSchema = z.object({
  mailbox,
  from: header.min(1).max(320).optional(),
  to: header.min(1).max(320).optional(),
  subject: header.min(1).max(500).optional(),
  text: z.string().min(1).max(1000).regex(/^[^\x00]*$/).optional(),
  since: date.optional().describe('Inclusive internal received date, YYYY-MM-DD; IMAP calendar-day semantics.'),
  before: date.optional().describe('Exclusive internal received date, YYYY-MM-DD.'),
  unread_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
  before_uid: z.number().int().min(1).max(4294967295).optional().describe('Pagination: only UIDs lower than this value.'),
}).refine(value => !value.since || !value.before || value.since < value.before, 'since must be earlier than before');

export const readSchema = z.object({
  mailbox,
  uid: z.number().int().min(1).max(4294967295),
  uid_validity: z.string().regex(/^\d+$/).describe('Mailbox UIDVALIDITY returned by search_emails. Prevents reading a different message after a mailbox reset.'),
  max_chars: z.number().int().min(100).max(100000).default(20000),
});

export const sendSchema = z.object({
  to: z.array(email).min(1).max(20),
  cc: z.array(email).max(20).default([]),
  bcc: z.array(email).max(20).default([]),
  subject: header.min(1).max(500),
  text: z.string().min(1).max(100000),
  in_reply_to: header.max(998).regex(/^<[^<>\s]+>$/).optional().describe('Original Message-ID when replying.'),
  references: z.array(header.max(998).regex(/^<[^<>\s]+>$/)).max(20).optional(),
  dry_run: z.boolean().default(false).describe('If true, return the exact message preview without contacting SMTP.'),
  request_id: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/).describe('Unique per intended send. Reuse for retries of identical content. Deduplication lasts for this server process only.'),
}).refine(value => value.to.length + value.cc.length + value.bcc.length <= 20, 'At most 20 total recipients');

export type SearchInput = z.infer<typeof searchSchema>;
export type ReadInput = z.infer<typeof readSchema>;
export type SendInput = z.infer<typeof sendSchema>;
