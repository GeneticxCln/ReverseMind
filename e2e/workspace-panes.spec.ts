import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { closeHarness, launchApp } from './helpers';
import type { McpServer } from '../src/types';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe' });

test('a running terminal survives switching views and keeps its shell state', async () => {
  const harness = await launchApp({
    mode: 'code',
    panes: [{ id: 'pane-term', type: 'terminal', title: 'Terminal', engine: 'terminal' }],
  });
  const { page } = harness;
  try {
    const host = page.locator('[data-testid="terminal-host"]');
    await expect(host).toBeVisible();
    await page.waitForTimeout(1200); // shell start-up
    await host.click();
    await page.keyboard.type('export RM_MARK=still-here; echo first-$$\n');
    await expect(host).toContainText('first-');

    await page.locator('[data-testid="mode-agent"]').click();
    await expect(page.locator('[data-testid="terminal-host"]')).toHaveCount(0);
    await page.locator('[data-testid="mode-code"]').click();

    const back = page.locator('[data-testid="terminal-host"]');
    await expect(back).toBeVisible();
    await expect(back).toContainText('first-'); // scrollback kept
    await back.click();
    await page.keyboard.type('echo mark=$RM_MARK\n');
    await expect(back).toContainText('mark=still-here'); // same shell process, not a new one
  } finally {
    await closeHarness(harness);
  }
});

test('files can be renamed and deleted, with a confirmation before deleting', async () => {
  const harness = await launchApp({ mode: 'code', panes: [{ id: 'pane-files', type: 'files', title: 'Files' }] });
  const { page, workspacePath } = harness;
  try {
    await page.locator('[data-testid="file-seed.txt"]').click();
    await page.getByLabel('Rename selected').click();
    await page.locator('[data-testid="files-rename-to"]').fill('renamed.txt');
    await page.locator('[data-testid="files-rename-confirm"]').click();
    await expect(page.locator('[data-testid="file-renamed.txt"]')).toBeVisible();
    expect(fs.existsSync(path.join(workspacePath, 'renamed.txt'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'seed.txt'))).toBe(false);

    await page.getByLabel('Delete selected').click();
    await page.locator('[data-testid="confirm-cancel"]').click();
    expect(fs.existsSync(path.join(workspacePath, 'renamed.txt'))).toBe(true);

    await page.getByLabel('Delete selected').click();
    await page.locator('[data-testid="confirm-ok"]').click();
    await expect(page.locator('[data-testid="file-renamed.txt"]')).toHaveCount(0);
    expect(fs.existsSync(path.join(workspacePath, 'renamed.txt'))).toBe(false);
  } finally {
    await closeHarness(harness);
  }
});

test('discarding Git changes asks first', async () => {
  const harness = await launchApp({
    mode: 'code',
    panes: [{ id: 'pane-git', type: 'git', title: 'Git' }],
    prepare: (dir) => {
      git(dir, 'init', '-b', 'main');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-m', 'init');
      fs.writeFileSync(path.join(dir, 'seed.txt'), 'edited');
    },
  });
  const { page, workspacePath } = harness;
  const seed = path.join(workspacePath, 'seed.txt');
  try {
    await expect(page.locator('[data-testid="git-branch"]')).toHaveValue('main');
    await page.getByLabel('Discard changes').first().click();
    await page.locator('[data-testid="confirm-cancel"]').click();
    expect(fs.readFileSync(seed, 'utf8')).toBe('edited');

    await page.getByLabel('Discard changes').first().click();
    await page.locator('[data-testid="confirm-ok"]').click();
    await expect.poll(() => fs.readFileSync(seed, 'utf8')).toBe('seed');
  } finally {
    await closeHarness(harness);
  }
});

test('enabled MCP servers reconnect on start', async () => {
  const server: McpServer = {
    id: 'mcp-auto',
    name: 'Bundled test server',
    command: process.execPath,
    args: [path.join(process.cwd(), 'resources', 'test-mcp-server.mjs')],
    env: {},
    enabled: true,
    status: 'connected', // stale from a previous run; the app must not trust it
    tools: [],
  };
  const harness = await launchApp({ mcpServers: [server] });
  try {
    const statePath = path.join(harness.dataDir, 'state.json');
    await expect
      .poll(
        () => {
          const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          const mcp = saved.mcpServers[0];
          return mcp.status === 'connected' ? mcp.tools.map((t: { name: string }) => t.name).sort().join(',') : mcp.status;
        },
        { timeout: 15_000 }
      )
      .toBe('add,echo,reverse');
  } finally {
    await closeHarness(harness);
  }
});
