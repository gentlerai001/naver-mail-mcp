// 초보자용 대화형 설치 마법사.
// 계정 입력 → 설정 저장 → 실제 접속 테스트 → 설치된 AI 앱 자동 감지·등록.
// 비밀번호는 ~/.naver-mail-mcp/.env 한 곳에만 저장하고 화면·로그에 출력하지 않습니다.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, statSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const home = homedir();
const isWin = platform() === 'win32';
const configDir = join(home, '.naver-mail-mcp');
const envFile = join(configDir, '.env');
const configFile = join(configDir, 'config.json');
const distEntry = join(root, 'dist', 'index.js');
const nodeExe = process.execPath;
const npmCli = process.env.npm_execpath;

// ───────────────────────────── 화면 출력 도우미 ─────────────────────────────
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = s => c('32', s), yellow = s => c('33', s), red = s => c('31', s), bold = s => c('1', s), dim = s => c('2', s);
const ok = s => console.log(`  ${green('✔')} ${s}`);
const warn = s => console.log(`  ${yellow('!')} ${s}`);
const fail = s => console.log(`  ${red('✘')} ${s}`);
const step = (n, s) => console.log(`\n${bold(`[${n}/5] ${s}`)}`);

// 터미널이면 편집 가능한 프롬프트, 파이프 입력이면 줄 단위로 순서대로 소비한다.
const isTTY = !!process.stdin.isTTY;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
let inputClosed = false;
const pending = [], buffered = [];
rl.on('line', line => { const p = pending.shift(); if (p) p(line); else buffered.push(line); });
rl.on('close', () => { inputClosed = true; while (pending.length) pending.shift()(''); });
function readLine(prompt) {
  if (buffered.length) { const l = buffered.shift(); process.stdout.write(prompt + (isTTY ? '' : l) + '\n'); return Promise.resolve(l); }
  if (inputClosed) { console.log(prompt + dim('(입력 없음, 기본값 사용)')); return Promise.resolve(''); }
  rl.setPrompt(prompt); rl.prompt();
  return new Promise(res => pending.push(res));
}
const ask = async (q, def = '') => ((await readLine(`  ${q}${def ? dim(` (${def})`) : ''}: `)) || def).trim();
const askYesNo = async (q, def = true) => {
  const a = (await ask(`${q} ${dim(def ? '[Y/n]' : '[y/N]')}`)).toLowerCase();
  if (!a) return def;
  return a === 'y' || a === 'yes' || a === 'ㅇ' || a === '네' || a === '예';
};
// 비밀번호는 화면에 * 로만 표시
const askSecret = async q => {
  const prompt = `  ${q}: `;
  if (!isTTY) return (await readLine(prompt)).trim();
  const write = rl._writeToOutput;
  rl._writeToOutput = s => {
    if (s.includes(prompt)) write.call(rl, prompt + '*'.repeat(rl.line.length));
    else if (/[\r\n]/.test(s)) write.call(rl, s);
    else write.call(rl, '*'.repeat(s.length));
  };
  try { return (await readLine(prompt)).trim(); } finally { rl._writeToOutput = write; }
};

// ───────────────────────────── 0. 사전 점검 ─────────────────────────────
console.log(bold('\n네이버 메일 MCP 설치 마법사'));
console.log(dim('  질문 몇 개에 답하면 설정과 앱 연결까지 자동으로 끝납니다. 언제든 Ctrl+C 로 중단할 수 있습니다.\n'));

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  fail(`Node.js 22 이상이 필요합니다. 현재 버전: ${process.versions.node}`);
  console.log('  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.');
  process.exit(1);
}
ok(`Node.js ${process.versions.node} 확인`);
if (!existsSync(join(root, 'node_modules', '@modelcontextprotocol'))) {
  console.log('  필요한 파일을 내려받습니다. 처음 한 번만 하며 1~2분 걸립니다...');
  const r = runNpm(['ci', '--no-audit', '--no-fund'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { fail('파일 내려받기에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행하세요.'); process.exit(1); }
  ok('필요한 파일 준비 완료');
}
if (!existsSync(distEntry) || newestMtime(join(root, 'src')) > statSync(distEntry).mtimeMs) {
  process.stdout.write('  서버를 빌드합니다... ');
  const r = runNpm(['run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { fail('빌드에 실패했습니다. 위 오류 메시지를 이슈로 알려주세요.'); process.exit(1); }
  console.log(green('완료'));
}

// ───────────────────────────── 1. 계정 입력 ─────────────────────────────
step(1, '네이버 계정 정보');
console.log(dim('  준비물: 네이버 메일 IMAP/SMTP 사용함 + 2단계 인증 + 애플리케이션 비밀번호'));
console.log(dim('  아직 준비가 안 됐다면 README 의 "네이버 계정 준비" 항목을 먼저 따라 하세요.\n'));

// 이전 설치 위치(config.json 이 가리키는 .env)도 함께 확인
let existing = readEnv(envFile);
if (!existing.NAVER_EMAIL) { const prev = readJson(configFile)?.envFile; if (prev && prev !== envFile) existing = readEnv(prev); }
let email, password, senderName, enableSend;
if (existing.NAVER_EMAIL && existing.NAVER_APP_PASSWORD) {
  ok(`이미 저장된 계정이 있습니다: ${maskEmail(existing.NAVER_EMAIL)}`);
  if (await askYesNo('이 계정을 그대로 사용할까요?', true)) {
    ({ NAVER_EMAIL: email, NAVER_APP_PASSWORD: password } = existing);
    senderName = existing.NAVER_SENDER_NAME ?? '';
    enableSend = existing.NAVER_ENABLE_SEND !== 'false';
  }
}
if (!email) {
  for (;;) {
    email = await ask('네이버 메일 주소 (예: myid@naver.com)');
    if (/^[^@\s]+@naver\.com$/i.test(email)) break;
    warn('@naver.com 으로 끝나는 주소를 입력하세요.');
  }
  for (;;) {
    password = await askSecret('애플리케이션 비밀번호 (입력해도 화면에 보이지 않습니다)');
    if (password && !/\s/.test(password)) break;
    warn('비밀번호가 비어 있거나 공백이 들어 있습니다. 네이버에서 발급받은 앱 비밀번호를 그대로 붙여넣으세요.');
  }
  senderName = await ask('보내는 사람 이름 (비워도 됩니다)', '');
  enableSend = await askYesNo('AI 가 메일을 보낼 수 있게 할까요? (아니오 = 읽기 전용)', true);
}

mkdirSync(configDir, { recursive: true, mode: 0o700 });
if (existsSync(envFile)) copyFileSync(envFile, envFile + '.bak');
writeFileSync(envFile, [
  '# 네이버 메일 MCP 계정 설정. 이 파일은 내 PC 에만 저장됩니다.',
  `NAVER_EMAIL=${email}`,
  `NAVER_APP_PASSWORD=${password}`,
  `NAVER_SENDER_NAME=${JSON.stringify(senderName)}`,
  `NAVER_ENABLE_SEND=${enableSend ? 'true' : 'false'}`,
  'NAVER_ATTACHMENT_DIR=',
  '',
].join('\n'), { mode: 0o600 });
if (!isWin) try { chmodSync(envFile, 0o600); } catch {}
writeFileSync(configFile, JSON.stringify({ envFile }, null, 2) + '\n', { mode: 0o600 });
ok(`설정 저장: ${envFile}`);
ok(`첨부파일 폴더: ${join(configDir, 'attachments')} ${dim('(보낼 파일은 이 폴더에 넣으세요)')}`);

// ───────────────────────────── 2. 접속 테스트 ─────────────────────────────
step(2, '네이버 서버 접속 테스트');
process.stdout.write('  IMAP·SMTP 로그인 중... ');
try {
  const { loadConfig } = await import(pathToFileURL(join(root, 'dist', 'config.js')).href);
  const { NaverMail } = await import(pathToFileURL(join(root, 'dist', 'mail.js')).href);
  const cfg = loadConfig({ NAVER_ENV_FILE: envFile });
  await new NaverMail(cfg).verifyConnection();
  console.log(green('성공'));
  ok('받은메일함 조회와 메일 발송 인증이 모두 정상입니다.');
} catch (error) {
  console.log(red('실패'));
  fail('네이버에 로그인하지 못했습니다. 다음을 확인하세요.');
  console.log('    1. 네이버 메일 → 환경설정 → POP3/IMAP 설정 → IMAP/SMTP "사용함"');
  console.log('    2. 네이버 ID → 보안설정 → 2단계 인증이 켜져 있는지');
  console.log('    3. 로그인 비밀번호가 아니라 "애플리케이션 비밀번호"를 넣었는지');
  console.log(dim(`    (${String(error?.message ?? error).split('\n')[0]})`));
  if (!(await askYesNo('그래도 앱 연결을 계속 진행할까요?', false))) { if (!inputClosed) rl.close(); process.exit(1); }
}

// ───────────────────────────── 3. 앱 감지 ─────────────────────────────
step(3, '연결할 AI 앱 찾기');
const apps = detectApps();
if (!apps.length) {
  warn('Codex, Claude Desktop, Claude Code 중 설치된 것을 찾지 못했습니다.');
  console.log('  앱을 설치한 뒤 `npm run setup` 을 다시 실행하거나, docs/manual-setup.md 를 참고해 직접 연결하세요.');
} else {
  for (const a of apps) ok(`${a.label} 발견`);
}

// ───────────────────────────── 4. 앱 등록 ─────────────────────────────
step(4, 'AI 앱에 등록');
const results = [];
for (const a of apps) {
  if (!(await askYesNo(`${a.label} 에 연결할까요?`, true))) { results.push([a.label, 'skip']); continue; }
  try { await a.install(); results.push([a.label, 'ok']); ok(`${a.label} 연결 완료`); }
  catch (e) { results.push([a.label, 'fail', e.message]); fail(`${a.label} 연결 실패: ${e.message}`); }
}

// ───────────────────────────── 5. 마무리 ─────────────────────────────
step(5, '완료');
console.log('');
for (const [label, status, msg] of results) {
  if (status === 'ok') ok(`${label}: 앱을 완전히 종료했다가 다시 실행하세요.`);
  else if (status === 'skip') console.log(`  ${dim('-')} ${label}: 건너뜀`);
  else fail(`${label}: ${msg}`);
}
console.log(`\n  앱을 다시 켠 뒤 이렇게 말해 보세요.`);
console.log(`    ${bold('"네이버 메일 연결 상태 확인해 줘"')}`);
console.log(`    ${bold('"안 읽은 메일 5개만 요약해 줘"')}`);
console.log(`\n  계정을 바꾸거나 다시 연결하려면 언제든 ${bold('npm run setup')} 을 다시 실행하면 됩니다.`);
console.log(dim(`  설정 파일: ${envFile}\n`));
if (!inputClosed) rl.close();

// ═════════════════════════════ 도우미 함수 ═════════════════════════════
function runNpm(args, opts = {}) {
  if (npmCli) return spawnSync(nodeExe, [npmCli, ...args], { cwd: root, stdio: 'inherit', windowsHide: true, ...opts });
  return spawnSync(isWin ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
}
function run(cmd, args, opts = {}) {
  // Windows 는 .cmd 래퍼 때문에 shell 이 필요하고, 그 경우 공백 있는 인자를 직접 감싸야 한다.
  const argv = isWin ? args.map(a => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  return spawnSync(cmd, argv, { stdio: opts.quiet ? 'pipe' : 'inherit', shell: isWin, windowsHide: true, encoding: 'utf8', ...opts });
}
function has(cmd) {
  const r = spawnSync(isWin ? 'where' : 'which', [cmd], { stdio: 'pipe', shell: isWin, encoding: 'utf8' });
  return r.status === 0;
}
function readEnv(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
      out[m[1]] = v;
    }
    return out;
  } catch { return {}; }
}
function newestMtime(dir) {
  let max = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return max;
}
function maskEmail(e) { const [u, d] = e.split('@'); return `${u.slice(0, 2)}***@${d}`; }
function readJson(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
function backupAndWriteJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, path + '.bak');
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function detectApps() {
  const list = [];
  // Codex: CLI 또는 ~/.codex 폴더
  if (has('codex') || existsSync(join(home, '.codex'))) list.push({ label: 'Codex', install: installCodex });
  // Claude Desktop: 설정 폴더 존재
  const desktopCfg = claudeDesktopConfigPath();
  if (desktopCfg && existsSync(dirname(desktopCfg))) list.push({ label: 'Claude Desktop', install: () => installClaudeDesktop(desktopCfg) });
  // Claude Code: CLI
  if (has('claude')) list.push({ label: 'Claude Code', install: installClaudeCode });
  return list;
}
function claudeDesktopConfigPath() {
  if (isWin) return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

async function installCodex() {
  const toml = join(process.env.CODEX_HOME || join(home, '.codex'), 'config.toml');
  if (has('codex')) {
    // 1순위: 이 폴더를 마켓플레이스로 등록하고 플러그인으로 설치 (앱에 "NAVER Mail" 로 표시)
    if (existsSync(join(root, 'plugin', 'server', 'index.js'))) {
      run('codex', ['plugin', 'marketplace', 'add', root], { quiet: true });
      const add = run('codex', ['plugin', 'add', 'naver-mail-mcp@gentler'], { quiet: true });
      if (add.status === 0) {
        run('codex', ['mcp', 'remove', 'naver-mail'], { quiet: true });
        if (existsSync(toml)) {
          const text = readFileSync(toml, 'utf8');
          const next = text.replace(/(\[plugins\."naver-mail-mcp@gentler"\]\s*\r?\n\s*enabled\s*=\s*)false/g, '$1true');
          if (next !== text) writeFileSync(toml, next);
        }
        console.log(dim('    플러그인으로 설치했습니다: naver-mail-mcp@gentler'));
        return;
      }
    }
    // 2순위: 일반 MCP 서버 등록. codex CLI 가 config.toml 을 안전하게 갱신한다.
    run('codex', ['mcp', 'remove', 'naver-mail'], { quiet: true });
    const mcp = run('codex', ['mcp', 'add', 'naver-mail', '--env', `NAVER_ENV_FILE=${envFile}`, '--', nodeExe, distEntry], { quiet: true });
    if (mcp.status !== 0) throw new Error((mcp.stderr || mcp.stdout || '').trim().split('\n')[0] || 'codex mcp add 실패');
  } else {
    // CLI 없음: config.toml 직접 편집
    let text = existsSync(toml) ? readFileSync(toml, 'utf8') : '';
    if (!/\[mcp_servers\.naver-mail\]/.test(text)) {
      if (existsSync(toml)) copyFileSync(toml, toml + '.bak');
      text += `\n[mcp_servers.naver-mail]\ncommand = ${JSON.stringify(nodeExe)}\nargs = [${JSON.stringify(distEntry)}]\nstartup_timeout_sec = 20\ntool_timeout_sec = 120\n\n[mcp_servers.naver-mail.env]\nNAVER_ENV_FILE = ${JSON.stringify(envFile)}\n`;
      mkdirSync(dirname(toml), { recursive: true });
      writeFileSync(toml, text);
    }
  }
  // 예전 방식(Codex 플러그인)이 켜져 있으면 도구가 두 번 보이므로 끈다.
  if (existsSync(toml)) {
    const text = readFileSync(toml, 'utf8');
    const next = text.replace(/(\[plugins\."naver-mail-mcp@[^"]+"\]\s*\r?\n\s*enabled\s*=\s*)true/g, '$1false');
    if (next !== text) { writeFileSync(toml, next); console.log(dim('    이전에 설치한 NAVER Mail 플러그인은 중복을 피하려고 껐습니다.')); }
  }
  console.log(dim(`    ${toml}`));
}

async function installClaudeDesktop(cfgPath) {
  const cfg = readJson(cfgPath) ?? {};
  cfg.mcpServers = cfg.mcpServers ?? {};
  cfg.mcpServers['naver-mail'] = { command: nodeExe, args: [distEntry], env: { NAVER_ENV_FILE: envFile } };
  backupAndWriteJson(cfgPath, cfg);
  console.log(dim(`    ${cfgPath}`));
}

async function installClaudeCode() {
  run('claude', ['mcp', 'remove', 'naver-mail', '-s', 'user'], { quiet: true });
  const r = run('claude', ['mcp', 'add', 'naver-mail', '-s', 'user', '-e', `NAVER_ENV_FILE=${envFile}`, '--', nodeExe, distEntry], { quiet: true });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim().split('\n')[0] || 'claude mcp add 실패');
}
