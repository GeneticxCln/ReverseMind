// Downloads the Electron binary if npm skipped Electron's own install script
// (newer npm blocks dependency install scripts unless allowed).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pkgDir;
try {
  pkgDir = require.resolve('electron/package.json').replace(/package\.json$/, '');
} catch {
  process.exit(0); // electron not installed (e.g. production-only install)
}
if (existsSync(`${pkgDir}dist/electron`) || existsSync(`${pkgDir}dist/electron.exe`)) process.exit(0);
console.log('Downloading the Electron binary…');
const result = spawnSync(process.execPath, [`${pkgDir}install.js`], { stdio: 'inherit' });
process.exit(result.status ?? 1);
