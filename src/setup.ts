// Local browser setup page. The user types the NAVER application password into a
// 127.0.0.1 form served by this process, so the secret never passes through the AI chat.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { platform } from 'node:os';
import { dirname } from 'node:path';
import { loadConfig, type Config } from './config.js';
import { NaverMail } from './mail.js';

export interface SetupOptions {
  envFile: string;
  verify?: (config: Config) => Promise<unknown>;
  openBrowser?: boolean;
  onSaved?: (config: Config) => void;
  ttlMs?: number;
  currentEmail?: string;
}

export interface SetupPage { url: string; expiresAt: number; close: () => void }

export function envFileContents(values: { email: string; password: string; senderName: string; enableSend: boolean }): string {
  return [
    '# NAVER Mail MCP account settings. This file stays on this computer.',
    `NAVER_EMAIL=${values.email}`,
    `NAVER_APP_PASSWORD=${values.password}`,
    `NAVER_SENDER_NAME=${JSON.stringify(values.senderName)}`,
    `NAVER_ENABLE_SEND=${values.enableSend ? 'true' : 'false'}`,
    'NAVER_ATTACHMENT_DIR=',
    '',
  ].join('\n');
}

export function writeEnvFile(envFile: string, contents: string) {
  mkdirSync(dirname(envFile), { recursive: true, mode: 0o700 });
  if (existsSync(envFile)) copyFileSync(envFile, envFile + '.bak');
  writeFileSync(envFile, contents, { mode: 0o600 });
  if (platform() !== 'win32') { try { chmodSync(envFile, 0o600); } catch { /* best effort */ } }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

function page(body: string, title = '네이버 메일 연결') {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{color-scheme:light dark}body{font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;margin:0;background:#f4f6f5;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#151716;color:#eee}.card{background:#1f2321!important}input{background:#151716;color:#eee;border-color:#444!important}}
main{max-width:520px;margin:6vh auto;padding:0 16px}.card{background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
h1{font-size:22px;margin:0 0 6px}p{line-height:1.6;margin:8px 0}label{display:block;font-weight:600;margin:18px 0 6px}
input[type=text],input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cfd4d1;border-radius:8px;font-size:16px}
.hint{font-size:13px;color:#6b716e;margin-top:4px}.err{background:#fdecec;color:#a11;border-radius:8px;padding:12px;margin:14px 0}
.ok{background:#e7f8ee;color:#0b6b3a;border-radius:8px;padding:12px;margin:14px 0}
button{margin-top:22px;width:100%;padding:13px;border:0;border-radius:8px;background:#03c75a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
button:disabled{opacity:.6}a{color:#0b6b3a}ol{padding-left:20px;line-height:1.7}.small{font-size:13px;color:#6b716e}
</style></head><body><main><div class="card">${body}</div></main></body></html>`;
}

function formPage(action: string, email: string, error?: string) {
  return page(`<h1>네이버 메일 연결</h1>
<p>AI 앱이 내 네이버 메일을 읽고 보낼 수 있게 계정을 연결합니다. 입력한 내용은 <b>이 컴퓨터에만</b> 저장되고 채팅으로 전송되지 않습니다.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<form method="post" action="${action}">
<label for="email">네이버 메일 주소</label>
<input id="email" name="email" type="email" required autocomplete="username" placeholder="myid@naver.com" value="${escapeHtml(email)}">
<label for="password">애플리케이션 비밀번호</label>
<input id="password" name="password" type="password" required autocomplete="off" placeholder="네이버에서 발급한 앱 비밀번호">
<div class="hint">평소 로그인 비밀번호가 아닙니다. 네이버ID → 보안설정 → 2단계 인증 → 애플리케이션 비밀번호에서 만든 값을 붙여넣으세요.
<a href="https://help.naver.com/service/5640/contents/8584?lang=ko&amp;osType=PC" target="_blank" rel="noreferrer">만드는 방법</a></div>
<label for="sender">보내는 사람 이름 <span class="small">(선택)</span></label>
<input id="sender" name="sender" type="text" maxlength="100" placeholder="홍길동">
<label><input type="checkbox" name="send" value="1" checked> AI가 메일을 보낼 수 있게 허용 (끄면 읽기 전용)</label>
<button type="submit" onclick="this.disabled=true;this.textContent='네이버에 접속 확인 중...';this.form.submit()">연결 확인하고 저장</button>
</form>
<p class="small" style="margin-top:18px">먼저 PC 네이버 메일 → 환경설정 → POP3/IMAP 설정에서 <b>IMAP/SMTP 사용함</b>을 켜 두어야 합니다.
<a href="https://help.naver.com/service/30029/contents/21344?osType=COMMONOS" target="_blank" rel="noreferrer">설정 방법</a></p>`);
}

function donePage(email: string, envFile: string) {
  return page(`<h1>연결 완료</h1>
<div class="ok">${escapeHtml(email)} 계정으로 네이버에 로그인했습니다.</div>
<p>이제 이 창을 닫고 AI 앱으로 돌아가 이렇게 말해 보세요.</p>
<ol><li>"네이버 메일 연결 상태 확인해 줘"</li><li>"안 읽은 메일 5개만 요약해 줘"</li></ol>
<p class="small">설정 파일: ${escapeHtml(envFile)}<br>계정을 바꾸려면 AI 앱에 "네이버 메일 설정해 줘"라고 말하면 이 창이 다시 열립니다.</p>`, '연결 완료');
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 16 * 1024) throw new Error('Form too large');
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function openInBrowser(url: string) {
  try {
    const os = platform();
    const child = os === 'win32'
      ? spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true })
      : spawn(os === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => { /* The tool result still contains the URL. */ });
    child.unref();
  } catch { /* ignore */ }
}

export function startSetupPage(options: SetupOptions): Promise<SetupPage> {
  const token = randomBytes(24).toString('base64url');
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  const verify = options.verify ?? (config => new NaverMail(config).verifyConnection());
  let currentEmail = options.currentEmail ?? '';
  let origin = '';
  let closed = false;

  const server = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', origin);
    const send = (status: number, html: string) => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
      response.end(html);
    };
    // Only this page's own form may post; a random token in the path keeps other local pages out.
    if (url.pathname !== `/${token}` && url.pathname !== `/${token}/save`) return send(404, page('<h1>페이지를 찾을 수 없습니다</h1><p>AI 앱에 "네이버 메일 설정해 줘"라고 말해 새 창을 여세요.</p>'));
    if (request.method === 'GET' && url.pathname === `/${token}`) return send(200, formPage(`/${token}/save`, currentEmail));
    if (request.method !== 'POST' || url.pathname !== `/${token}/save`) return send(405, page('<h1>허용되지 않은 요청</h1>'));
    const requestOrigin = request.headers.origin;
    if (requestOrigin && requestOrigin !== origin) return send(403, page('<h1>거부된 요청</h1>'));
    let form: URLSearchParams;
    try { form = await readForm(request); } catch { return send(413, page('<h1>입력이 너무 깁니다</h1>')); }
    const email = (form.get('email') ?? '').trim();
    const password = (form.get('password') ?? '').trim();
    const senderName = (form.get('sender') ?? '').trim();
    const enableSend = form.get('send') === '1';
    currentEmail = email;
    let config: Config;
    try {
      config = loadConfig({ NAVER_EMAIL: email, NAVER_APP_PASSWORD: password, NAVER_SENDER_NAME: senderName, NAVER_ENABLE_SEND: enableSend ? 'true' : 'false', NAVER_ENV_FILE: undefined });
    } catch {
      return send(200, formPage(`/${token}/save`, email, '주소는 @naver.com 으로 끝나야 하고, 비밀번호에는 공백이 없어야 합니다. 다시 확인해 주세요.'));
    }
    try { await verify(config); } catch {
      return send(200, formPage(`/${token}/save`, email, '네이버에 로그인하지 못했습니다. IMAP/SMTP 사용함, 2단계 인증, 애플리케이션 비밀번호(로그인 비밀번호 아님)를 확인한 뒤 다시 시도하세요.'));
    }
    try { writeEnvFile(options.envFile, envFileContents({ email, password, senderName, enableSend })); } catch {
      return send(200, formPage(`/${token}/save`, email, `설정 파일을 저장하지 못했습니다: ${options.envFile}`));
    }
    options.onSaved?.(config);
    send(200, donePage(email, options.envFile));
    response.on('finish', () => setTimeout(close, 2000).unref());
  });

  const close = () => { if (!closed) { closed = true; server.close(); } };
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Setup page failed to start'));
      origin = `http://127.0.0.1:${address.port}`;
      const url = `${origin}/${token}`;
      const expiresAt = Date.now() + ttlMs;
      setTimeout(close, ttlMs).unref();
      server.unref();
      if (options.openBrowser !== false) openInBrowser(url);
      resolve({ url, expiresAt, close });
    });
  });
}
