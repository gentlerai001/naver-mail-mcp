import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

// Credentials stay outside the distributable plugin and survive cache updates.
// Explicit environment variables take priority over this machine's config.
if (!process.env.NAVER_ENV_FILE && !(process.env.NAVER_EMAIL && process.env.NAVER_APP_PASSWORD)) {
  try {
    const config = JSON.parse(readFileSync(join(homedir(), '.naver-mail-mcp', 'config.json'), 'utf8'));
    if (typeof config.envFile !== 'string' || !isAbsolute(config.envFile)) throw new Error('Invalid path');
    process.env.NAVER_ENV_FILE = config.envFile;
  } catch (error) {
    if (error.code === 'ENOENT') {
      process.env.NAVER_ENV_FILE = join(homedir(), '.naver-mail-mcp', '.env');
    } else {
      console.error('NAVER Mail: invalid ~/.naver-mail-mcp/config.json. Set envFile to an absolute .env path.');
      process.exit(1);
    }
  }
}

await import('../server/index.js');
