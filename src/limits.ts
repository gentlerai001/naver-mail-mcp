// smtp.naver.com:587, verified STARTTLS EHLO on 2026-09-12:
// SIZE 39845888 (38 MiB). This is the complete encoded message, not raw files.
export const SMTP_MESSAGE_LIMIT_BYTES = 39_845_888;
// NAVER documents a 40 MB receive limit, without specifying the byte convention.
// A 40 MiB parsing ceiling accommodates both decimal and binary interpretations.
export const RECEIVE_MESSAGE_LIMIT_BYTES = 40 * 1024 * 1024;
