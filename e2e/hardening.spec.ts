import { test, expect, _electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertInside, parseBranchLine, remove } from '../electron/services';
import { RootRegistry, isAllowedAppNavigation, isAllowedGuestUrl, isSafeRefName } from '../electron/security';
import { validateSshConfig } from '../src/ssh';
import { remoteCommand } from '../src/engines';
import { closeHarness, launchApp } from './helpers';
import type { Workspace } from '../src/types';

test('git branch header parses name and tracking counts', () => {
  expect(parseBranchLine('## main')).toEqual({ branch: 'main', ahead: 0, behind: 0 });
  expect(parseBranchLine('## main...origin/main [ahead 2, behind 1]')).toEqual({ branch: 'main', ahead: 2, behind: 1 });
  expect(parseBranchLine('## release/1.2...origin/release/1.2 [behind 4]')).toEqual({ branch: 'release/1.2', ahead: 0, behind: 4 });
  expect(parseBranchLine('## No commits yet on main').branch).toBe('main');
  expect(parseBranchLine('## HEAD (no branch)').branch).toBe('HEAD (no branch)');
});

test('workspace paths cannot escape through dots or symlinks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-jail-'));
  const root = path.join(base, 'ws');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
  fs.symlinkSync(outside, path.join(root, 'link'));
  try {
    expect(() => assertInside(root, '../outside/secret.txt')).toThrow();
    expect(() => assertInside(root, 'link/secret.txt')).toThrow();
    expect(() => assertInside(root, 'link/new-file.txt')).toThrow();
    expect(assertInside(root, 'new/dir/file.txt')).toBe(path.join(root, 'new/dir/file.txt'));
    // Deleting the link itself is allowed and leaves the target alone.
    remove(root, 'link');
    expect(fs.existsSync(path.join(outside, 'secret.txt'))).toBe(true);
    expect(() => remove(root, '.')).toThrow();
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('only registered workspace folders resolve', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-reg-'));
  const registry = new RootRegistry();
  try {
    expect(() => registry.resolve(dir)).toThrow();
    registry.register(dir);
    expect(registry.resolve(dir)).toBe(fs.realpathSync(dir));
    expect(() => registry.resolve('/')).toThrow();
    expect(() => registry.resolve('relative/path')).toThrow();
    expect(registry.contains(dir)).toBe(true);
    expect(registry.contains(os.homedir())).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('navigation and ref-name guards reject look-alikes', () => {
  expect(isAllowedAppNavigation('http://127.0.0.1:5273/x', 'http://127.0.0.1:5273')).toBe(true);
  expect(isAllowedAppNavigation('http://127.0.0.1.evil.com/x', 'http://127.0.0.1:5273')).toBe(false);
  expect(isAllowedAppNavigation('https://example.com', null)).toBe(false);
  expect(isAllowedGuestUrl('https://example.com')).toBe(true);
  expect(isAllowedGuestUrl('file:///etc/passwd')).toBe(false);
  expect(isAllowedGuestUrl('javascript:alert(1)')).toBe(false);
  expect(isSafeRefName('feature/x-1')).toBe(true);
  expect(isSafeRefName('--orphan')).toBe(false);
  expect(isSafeRefName('a..b')).toBe(false);
});

test('ssh settings reject option and shell injection', () => {
  const ok = { host: 'dev.example.com', user: 'quinton', path: '/srv/app', port: 22 };
  expect(validateSshConfig(ok)).toBeNull();
  expect(validateSshConfig({ ...ok, host: '-oProxyCommand=touch /tmp/x' })).not.toBeNull();
  expect(validateSshConfig({ ...ok, host: 'a;b' })).not.toBeNull();
  expect(validateSshConfig({ ...ok, user: 'x$(id)' })).not.toBeNull();
  expect(validateSshConfig({ ...ok, port: 70000 })).not.toBeNull();
  const workspace = { kind: 'ssh', path: 'ssh://x', ssh: { ...ok, host: 'h;rm -rf ~' } } as unknown as Workspace;
  expect(remoteCommand(workspace, 'claude')).not.toContain('rm -rf');
  const good = { kind: 'ssh', path: 'ssh://x', ssh: { ...ok, path: "/srv/it's" } } as unknown as Workspace;
  expect(remoteCommand(good, 'claude')).toContain("ssh -t -p 22 -- 'quinton@dev.example.com' ");
});

test('renderer cannot reach folders that are not registered workspaces', async () => {
  const harness = await launchApp();
  try {
    const result = await harness.page.evaluate(async () => {
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
          return 'allowed';
        } catch (error) {
          return String((error as Error).message);
        }
      };
      return {
        tree: await attempt(() => window.rm.fs.tree('/etc')),
        shell: await attempt(() => window.rm.shell.run('/', 'id')),
        reveal: await attempt(() => window.rm.revealPath('/etc')),
      };
    });
    expect(result.tree).toContain('not a registered workspace');
    expect(result.shell).toContain('not a registered workspace');
    expect(result.reveal).toContain('Only workspace folders');
    const own = await harness.page.evaluate((p) => window.rm.fs.tree(p).then((r: any) => r.entries.length), harness.workspacePath);
    expect(own).toBeGreaterThan(0);
  } finally {
    await closeHarness(harness);
  }
});

test('an unreadable state file is kept aside instead of overwritten', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reversemind-corrupt-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), '{ this is not json');
  const app = await _electron.launch({
    executablePath: path.join(process.cwd(), 'node_modules/electron/dist/electron'),
    args: ['.', '--no-sandbox'],
    env: { ...process.env, REVERSEMIND_USERDATA: dataDir },
    timeout: 30_000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="mode-agent"]', { timeout: 20_000 });
    const backups = fs.readdirSync(dataDir).filter((f) => f.startsWith('state.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dataDir, backups[0]), 'utf8')).toBe('{ this is not json');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a second instance on the same data folder does not start', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reversemind-lock-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const launch = () =>
    _electron.launch({
      executablePath: path.join(process.cwd(), 'node_modules/electron/dist/electron'),
      args: ['.', '--no-sandbox'],
      env: { ...process.env, REVERSEMIND_USERDATA: dataDir },
      timeout: 30_000,
    });
  const first = await launch();
  try {
    await (await first.firstWindow()).waitForSelector('[data-testid="mode-agent"]', { timeout: 20_000 });
    const second = await launch().catch(() => null);
    if (second) {
      // Electron started and quit immediately because the lock was held.
      const exited = await new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 8_000);
        second.process().once('exit', () => (clearTimeout(t), resolve(true)));
        if (second.process().exitCode !== null) (clearTimeout(t), resolve(true));
      });
      expect(exited).toBe(true);
    }
    expect(first.process().exitCode).toBeNull();
  } finally {
    await first.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});
