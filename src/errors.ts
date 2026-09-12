export class MailError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof MailError) return { code: error.code, message: error.message };
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (['EAUTH', 'AUTHENTICATIONFAILED'].includes(code)) {
    return { code: 'AUTHENTICATION_FAILED', message: 'Check IMAP/SMTP activation, two-step verification, and the NAVER application password.' };
  }
  return { code: 'MAIL_OPERATION_FAILED', message: 'Mail operation failed. Check network access and NAVER IMAP/SMTP settings. Provider details are omitted to protect credentials and mail content.' };
}
