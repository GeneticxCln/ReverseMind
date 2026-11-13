import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import http from 'node:http';

async function buildElectron() {
  await build({
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'silent',
  });
  await build({
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'silent',
  });
}

const vite = spawn('npx', ['vite', '--port', '5273', '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
let started = false;

vite.stdout.on('data', async (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!started && (text.includes('Local:') || text.includes('ready in'))) {
    started = true;
    await buildElectron();
    const electron = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      env: { ...process.env, REVERSEMIND_DEV_URL: 'http://127.0.0.1:5273/' },
    });
    electron.on('exit', () => {
      vite.kill('SIGTERM');
      process.exit(0);
    });
  }
});

vite.on('exit', (code) => {
  if (!started) process.exit(code ?? 0);
});
