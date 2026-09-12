import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { MailError } from './errors.js';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_MESSAGE_BYTES = 30 * 1024 * 1024;

export function digest(content: Buffer) { return createHash('sha256').update(content).digest('hex'); }

export function safeFilename(name: string): boolean {
  return name.length > 0 && name.length <= 180 && !/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)
    && !name.startsWith('.') && !/[. ]$/.test(name)
    && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name);
}

function safeRelativePath(value: string) {
  if (isAbsolute(value) || win32.isAbsolute(value)) return false;
  return value.split(/[\\/]/).every(safeFilename);
}

function inside(root: string, target: string) {
  const part = relative(root, target);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function downloadName(original: string | undefined) {
  let name = (original ?? 'attachment.bin').split(/[\\/]/).at(-1) ?? 'attachment.bin';
  name = name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 130);
  if (!safeFilename(name)) name = 'attachment.bin';
  return `${randomUUID().slice(0, 8)}-${name}`;
}

// This is a dedicated user-controlled exchange folder, not an OS sandbox.
// Never point it at a secret directory or allow untrusted local processes to modify it.
export class AttachmentStore {
  constructor(private readonly directory: string) {}

  private root() {
    if (!isAbsolute(this.directory)) throw new MailError('ATTACHMENT_DIRECTORY', 'The attachment directory must be absolute.');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    return realpathSync(this.directory);
  }

  read(path: string, filename?: string, expectedSha256?: string) {
    if (!safeRelativePath(path) || (filename !== undefined && !safeFilename(filename))) {
      throw new MailError('INVALID_ATTACHMENT_PATH', 'Use a relative path inside the attachment folder. Hidden files, traversal, URLs, device names and alternate streams are not allowed.');
    }
    const root = this.root();
    const parts = path.split(/[\\/]/);
    let target = root;
    let fd: number | undefined;
    try {
      for (const part of parts) {
        target = join(target, part);
        if (lstatSync(target).isSymbolicLink()) throw new MailError('INVALID_ATTACHMENT_PATH', 'Symbolic links and junctions are not allowed.');
      }
      if (!inside(root, realpathSync(target))) throw new MailError('INVALID_ATTACHMENT_PATH', 'Attachment path leaves the configured folder.');
      const before = lstatSync(target);
      if (!before.isFile() || before.nlink !== 1) throw new MailError('INVALID_ATTACHMENT_PATH', 'Only regular files without hard links may be attached.');
      if (before.size > MAX_ATTACHMENT_BYTES) throw new MailError('ATTACHMENT_TOO_LARGE', 'Each attachment must be at most 10 MiB.');
      fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK);
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > MAX_ATTACHMENT_BYTES) {
        throw new MailError('ATTACHMENT_CHANGED', 'Attachment changed while opening. Preview again.');
      }
      const buffer = Buffer.alloc(Math.min(opened.size + 1, MAX_ATTACHMENT_BYTES + 1));
      let size = 0;
      while (size < buffer.length) {
        const count = readSync(fd, buffer, size, buffer.length - size, null);
        if (count === 0) break;
        size += count;
      }
      const after = fstatSync(fd);
      if (size !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
        throw new MailError('ATTACHMENT_CHANGED', 'Attachment changed while reading. Preview again.');
      }
      const content = buffer.subarray(0, size);
      const sha256 = digest(content);
      if (expectedSha256 && expectedSha256 !== sha256) throw new MailError('ATTACHMENT_CHANGED', 'Attachment differs from expected_sha256. Preview again.');
      return { path: parts.join('/'), filename: filename ?? parts.at(-1)!, size, sha256, content };
    } catch (error) {
      if (error instanceof MailError) throw error;
      throw new MailError('ATTACHMENT_READ_FAILED', 'Cannot read attachment. Check its relative path and file permissions.');
    } finally { if (fd !== undefined) closeSync(fd); }
  }

  save(content: Buffer, originalFilename?: string, saveAs?: string) {
    if (content.length > MAX_ATTACHMENT_BYTES) throw new MailError('ATTACHMENT_TOO_LARGE', 'Each download must be at most 10 MiB.');
    if (saveAs !== undefined && !safeFilename(saveAs)) throw new MailError('INVALID_ATTACHMENT_PATH', 'save_as must be a plain filename, not a path, hidden file or reserved device name.');
    const root = this.root();
    const filename = saveAs ?? downloadName(originalFilename);
    const target = resolve(root, filename);
    if (!inside(root, target)) throw new MailError('INVALID_ATTACHMENT_PATH', 'Download must stay inside the attachment folder.');
    let fd: number | undefined;
    try {
      fd = openSync(target, 'wx', 0o600); // Never replace an existing file or follow a destination symlink.
      writeFileSync(fd, content);
      return { path: filename, absolute_path: target, size: content.length, sha256: digest(content) };
    } catch (error) {
      if (fd !== undefined) { closeSync(fd); fd = undefined; unlinkSync(target); }
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      throw new MailError(code === 'EEXIST' ? 'ATTACHMENT_EXISTS' : 'ATTACHMENT_WRITE_FAILED', code === 'EEXIST'
        ? 'Destination already exists. Choose another save_as filename.' : 'Cannot save attachment. Check directory permissions and disk space.');
    } finally { if (fd !== undefined) closeSync(fd); }
  }
}
