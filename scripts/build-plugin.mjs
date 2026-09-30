// Copies the installable plugin folder (metadata + bundled server) to a target
// directory, by default ~/plugins/naver-mail-mcp for a personal marketplace.
import { cp, mkdir, readFile, readdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  ['plugin/.codex-mcp.json', '.codex-mcp.json'],
  ['plugin/.claude-plugin/plugin.json', '.claude-plugin/plugin.json'],
  ['plugin/scripts/start.mjs', 'scripts/start.mjs'],
  ['plugin/server/index.js', 'server/index.js'],
  ['plugin/README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
  ['.env.example', '.env.example'],
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
console.log(`Plugin built: ${output}`);
