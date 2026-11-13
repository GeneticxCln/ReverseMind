import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { closeHarness, launchApp } from './helpers';

// Release check: run with RM_PACKAGED=release/linux-unpacked/reversemind (see `npm run test:packaged`).
test.skip(!process.env.RM_PACKAGED, 'set RM_PACKAGED to test the unpacked build');

const resourcesDir = () => path.join(path.dirname(path.resolve(process.env.RM_PACKAGED!)), 'resources');

test('the packaged app ships its helper files', () => {
  expect(fs.existsSync(path.join(resourcesDir(), 'python', 'pty-host.py'))).toBe(true);
  expect(fs.existsSync(path.join(resourcesDir(), 'resources', 'test-mcp-server.mjs'))).toBe(true);
});

test('the packaged app starts and answers offline', async () => {
  const harness = await launchApp();
  try {
    await harness.page.locator('[data-testid="composer-input"]').fill('What can you do?');
    await harness.page.locator('[data-testid="composer-input"]').press('Enter');
    await expect(harness.page.locator('[data-testid="chat-messages"]')).toContainText('local-first coding agent');
  } finally {
    await closeHarness(harness);
  }
});

test('the packaged app runs a real terminal through the bundled PTY host', async () => {
  const harness = await launchApp({ mode: 'code', panes: [{ id: 'pane-term', type: 'terminal', title: 'Terminal', engine: 'terminal' }] });
  try {
    const host = harness.page.locator('[data-testid="terminal-host"]');
    await expect(host).toBeVisible();
    await harness.page.waitForTimeout(1200);
    await host.click();
    await harness.page.keyboard.type('echo packaged-$((6*7))\n');
    await expect(host).toContainText('packaged-42');
  } finally {
    await closeHarness(harness);
  }
});

test('the packaged app connects the bundled MCP server', async () => {
  const harness = await launchApp({
    mcpServers: [
      {
        id: 'mcp-packaged',
        name: 'Bundled',
        command: process.execPath,
        args: [path.join(resourcesDir(), 'resources', 'test-mcp-server.mjs')],
        env: {},
        enabled: true,
        status: 'disconnected',
        tools: [],
      },
    ],
  });
  try {
    const state = path.join(harness.dataDir, 'state.json');
    await expect
      .poll(() => JSON.parse(fs.readFileSync(state, 'utf8')).mcpServers[0].status, { timeout: 15_000 })
      .toBe('connected');
  } finally {
    await closeHarness(harness);
  }
});
