import { cp, mkdir, readFile, readdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length > 1) throw new Error('Usage: npm run build:plugin -- [output-folder/naver-mail-mcp]');
const output = resolve(args[0] || join(homedir(), 'plugins', 'naver-mail-mcp'));
if (basename(output) !== 'naver-mail-mcp' || output === root) throw new Error('Use a separate folder named naver-mail-mcp.');
let entries = [];
try { entries = await readdir(output); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (entries.length) {
  try {
    const manifest = JSON.parse(await readFile(join(output, '.codex-plugin', 'plugin.json'), 'utf8'));
    if (manifest.name !== 'naver-mail-mcp') throw new Error('Different plugin');
  } catch { throw new Error('Output must be empty or an existing NAVER Mail plugin.'); }
}

// Copy a fixed allowlist, never the repository tree or its .env/.local/attachments.
const copies = [
  ['plugin/.codex-plugin/plugin.json', '.codex-plugin/plugin.json'],
  ['plugin/.mcp.json', '.mcp.json'],
  ['plugin/scripts/start.mjs', 'scripts/start.mjs'],
  ['plugin/README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
  ['.env.example', '.env.example'],
  ['dist', 'server/dist'],
  ['package.json', 'server/package.json'],
  ['package-lock.json', 'server/package-lock.json'],
];
for (const [source, target] of copies) {
  // Reject output links, including existing parent junctions, before writing.
  let current = join(output, target);
  while (current !== dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Output cannot contain symbolic links or junctions.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    current = dirname(current);
  }
  await mkdir(dirname(join(output, target)), { recursive: true });
  await cp(join(root, source), join(output, target), { recursive: true });
}
// npm supplies its JS entrypoint: use Node directly, avoiding Windows shell quoting.
if (!process.env.npm_execpath) throw new Error('Run this builder through npm run build:plugin.');
const install = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: join(output, 'server'), stdio: 'inherit', windowsHide: true,
});
if (install.status !== 0) throw new Error('Plugin dependency installation failed.');
console.log(`Plugin built: ${output}`);
