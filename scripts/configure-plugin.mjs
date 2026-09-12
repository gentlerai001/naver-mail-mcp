import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 1) throw new Error('Usage: npm run configure:plugin -- <path-to-existing-.env>');
const envFile = resolve(args[0]);
await access(envFile);
const configDir = join(homedir(), '.naver-mail-mcp');
const configPath = join(configDir, 'config.json');
await mkdir(configDir, { recursive: true, mode: 0o700 });
let existing;
try { existing = JSON.parse(await readFile(configPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read existing plugin config; left unchanged.'); }
if (existing && existing.envFile !== envFile) {
  throw new Error('A different envFile is already configured. Edit ~/.naver-mail-mcp/config.json explicitly to switch accounts.');
}
await writeFile(configPath, JSON.stringify({ envFile }, null, 2) + '\n', { mode: 0o600 });
console.log(`Plugin configuration saved: ${configPath} (path only; no credentials copied)`);
