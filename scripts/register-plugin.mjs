import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const pluginPath = join(homedir(), 'plugins', 'naver-mail-mcp');
const manifest = JSON.parse(await readFile(join(pluginPath, '.codex-plugin', 'plugin.json'), 'utf8'));
if (manifest.name !== 'naver-mail-mcp') throw new Error('Build the plugin first.');
const path = join(homedir(), '.agents', 'plugins', 'marketplace.json');
let catalog;
try { catalog = JSON.parse(await readFile(path, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Invalid existing marketplace; left unchanged.');
  catalog = { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
}
if (typeof catalog.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(catalog.name) || !Array.isArray(catalog.plugins)) {
  throw new Error('Invalid existing marketplace; left unchanged.');
}
const existing = catalog.plugins.find(plugin => plugin.name === manifest.name);
if (existing) {
  if (existing.source?.source !== 'local' || existing.source.path !== './plugins/naver-mail-mcp') {
    throw new Error('Plugin name already points to another source; left unchanged.');
  }
} else {
  catalog.plugins.push({ name: manifest.name, source: { source: 'local', path: './plugins/naver-mail-mcp' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
}
console.log(`Registered: ${path}`);
console.log(`Install: codex plugin add naver-mail-mcp@${catalog.name}`);
