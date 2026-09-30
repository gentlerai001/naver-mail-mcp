// Backend that loads the account on first use, so the server can start before the
// user has configured anything and pick up a new configuration without a restart.
import { loadConfig, type Config } from './config.js';
import { MailError } from './errors.js';
import { NaverMail, type MailBackend } from './mail.js';
import type { AttachmentMessageInput, DownloadInput, ReadInput, SearchInput, SendInput } from './schemas.js';

export const NOT_CONFIGURED_MESSAGE = 'NAVER account is not configured on this computer yet. Call setup_naver_mail to open the local setup page and ask the user to fill it in. Never ask for the password in chat.';

export class LazyMail implements MailBackend {
  private loaded?: { config: Config; mail: NaverMail };

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly factory: (config: Config) => NaverMail = config => new NaverMail(config)) {}

  reset() { this.loaded = undefined; }

  private get current() {
    if (!this.loaded) {
      let config: Config;
      try { config = loadConfig(this.env); }
      catch { throw new MailError('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE); }
      this.loaded = { config, mail: this.factory(config) };
    }
    return this.loaded;
  }

  listMailboxes() { return this.current.mail.listMailboxes(); }
  searchEmails(input: SearchInput) { return this.current.mail.searchEmails(input); }
  getEmail(input: ReadInput) { return this.current.mail.getEmail(input); }
  verifyConnection() { return this.current.mail.verifyConnection(); }
  listAttachments(input: AttachmentMessageInput) { return this.current.mail.listAttachments(input); }
  downloadAttachment(input: DownloadInput) { return this.current.mail.downloadAttachment(input); }
  async sendEmail(input: SendInput) {
    const { config, mail } = this.current;
    if (!config.enableSend) throw new MailError('SEND_DISABLED', 'Sending is disabled for this account (NAVER_ENABLE_SEND=false). The user can enable it on the setup page via setup_naver_mail.');
    return mail.sendEmail(input);
  }
}
