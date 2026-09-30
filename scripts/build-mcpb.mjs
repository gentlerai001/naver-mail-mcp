// Packs the bundled server as a Claude Desktop extension (.mcpb) for chat sessions,
// where plugin-provided local MCP servers do not run. Output: release/naver-mail-mcp.mcpb
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = join(root, 'plugin', 'server', 'index.js');
if (!existsSync(bundle)) throw new Error('Run `npm run build:bundle` first.');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8'));
manifest.version = pkg.version;

const stage = join(root, '.local', 'mcpb-stage');
const out = join(root, 'release', `naver-mail-mcp-${pkg.version}.mcpb`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'server'), { recursive: true });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
cpSync(bundle, join(stage, 'server', 'index.js'));
cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
cpSync(join(root, 'mcpb', 'README.md'), join(stage, 'README.md'));
if (existsSync(join(root, 'mcpb', 'icon.png'))) cpSync(join(root, 'mcpb', 'icon.png'), join(stage, 'icon.png'));

// The MCPB CLI validates the manifest and writes the zip.
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
for (const args of [['--yes', '@anthropic-ai/mcpb', 'validate', join(stage, 'manifest.json')], ['--yes', '@anthropic-ai/mcpb', 'pack', stage, out]]) {
  const r = spawnSync(npx, args, { stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  if (r.status !== 0) throw new Error(`mcpb ${args[2]} failed`);
}
console.log(`Extension written: ${out}`);
