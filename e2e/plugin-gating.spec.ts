import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultState } from '../src/defaults';
import { mcpToolContext } from '../src/agent';
import { toolAllowed } from '../src/plugins';
import type { Plugin, ToolCallKind } from '../src/types';
import { closeHarness, launchApp, TASK_ID } from './helpers';

const TOOL_KINDS: ToolCallKind[] = [
  'read_file',
  'write_file',
  'list_files',
  'git_status',
  'git_diff',
  'git_stage',
  'git_commit',
  'run_command',
];

test('built-in plugins map to their agent tool kinds', () => {
  const defaults = createDefaultState().plugins;
  const disabled = defaults.map((plugin) => ({ ...plugin, enabled: false }));
  for (const kind of TOOL_KINDS) expect(toolAllowed(disabled, kind)).toBe(false);
  expect(toolAllowed(disabled, 'mcp_tool')).toBe(true);

  const filesOnly = defaults.map((plugin) => ({
    ...plugin,
    enabled: plugin.id === 'plugin-files',
  }));
  expect(toolAllowed(filesOnly, 'write_file')).toBe(true);
  expect(toolAllowed(filesOnly, 'read_file')).toBe(true);
  expect(toolAllowed(filesOnly, 'git_status')).toBe(false);
  expect(toolAllowed(filesOnly, 'run_command')).toBe(false);

  expect(toolAllowed([], 'write_file')).toBe(true);
});

test('MCP tools are advertised only from connected servers with an enabled plugin', () => {
  const state = createDefaultState();
  state.mcpServers = [
    {
      id: 'mcp-srv-1',
      name: 'Test MCP',
      command: 'node',
      args: ['server.mjs'],
      env: {},
      enabled: true,
      status: 'connected',
      tools: [
        {
          name: 'echo',
          description: 'Echo a message back.',
          inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
        },
      ],
    },
  ];
  const plugin: Plugin = {
    id: 'mcp-plugin-mcp-srv-1',
    name: 'Test MCP',
    description: 'MCP connection',
    author: 'MCP',
    enabled: true,
    kind: 'mcp',
    serverId: 'mcp-srv-1',
    icon: 'plug',
  };
  state.plugins.push(plugin);

  const context = mcpToolContext(state);
  expect(context).toContain('serverId mcp-srv-1');
  expect(context).toContain('echo');
  expect(context).toContain('Echo a message back.');
  expect(context).toContain('"type":"object"');

  state.plugins = state.plugins.map((item) => (item.id === plugin.id ? { ...item, enabled: false } : item));
  expect(mcpToolContext(state)).toBe('');
});

test('mcp_tool calls are gated by the server plugin', () => {
  const plugin: Plugin = {
    id: 'mcp-plugin-srv-1',
    name: 'Test MCP',
    description: 'MCP connection',
    author: 'MCP',
    enabled: false,
    kind: 'mcp',
    serverId: 'srv-1',
    icon: 'plug',
  };

  expect(toolAllowed([plugin], 'mcp_tool', { serverId: 'srv-1', tool: 'echo' })).toBe(false);
  expect(toolAllowed([{ ...plugin, enabled: true }], 'mcp_tool', { serverId: 'srv-1', tool: 'echo' })).toBe(true);
  expect(toolAllowed([plugin], 'mcp_tool', { serverId: 'srv-2', tool: 'echo' })).toBe(true);
});

test('workspace files plugin gates file proposals and writes', async () => {
  const harness = await launchApp({ disabledPlugins: ['plugin-files'] });
  const { page, workspacePath } = harness;
  const file = path.join(workspacePath, 'plugin-check.txt');
  const prompt = 'Create a file named plugin-check.txt with content hello';
  try {
    await page.locator('[data-testid="composer-input"]').fill(prompt);
    await page.locator('[data-testid="composer-input"]').press('Enter');
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('plugin-check.txt');
    await expect(page.locator('[data-testid^="approve-"]')).toHaveCount(0);
    expect(fs.existsSync(file)).toBe(false);

    await page.locator('[data-testid="open-palette"]').click();
    await page.locator('[data-testid="palette-item-page-plugins"]').click();
    await page.locator('[data-testid="plugin-plugin-files"] [role="switch"]').click();
    await expect(page.locator('[data-testid="plugin-plugin-files"] [role="switch"]')).toHaveAttribute('aria-checked', 'true');

    await page.locator('[data-testid="mode-agent"]').click();
    await page.locator('[data-testid="composer-input"]').fill(prompt);
    await page.locator('[data-testid="composer-input"]').press('Enter');
    const approve = page.locator('[data-testid^="approve-"]').last();
    await expect(approve).toBeVisible();
    await approve.click();
    await expect.poll(() => fs.existsSync(file), { timeout: 8_000 }).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('hello');
  } finally {
    await closeHarness(harness);
  }
});

test('browser threads plugin hides browser panes and disables saved ones', async () => {
  const harness = await launchApp({ mode: 'code', disabledPlugins: ['plugin-browser'], browserPane: true });
  const { page } = harness;
  try {
    await expect(page.locator('[data-testid="browser-disabled"]')).toBeVisible();
    await page.locator('[data-testid="add-pane"]').click();
    await expect(page.locator('[data-testid="pane-add-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-pane-browser"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="add-pane-terminal"]')).toBeVisible();
  } finally {
    await closeHarness(harness);
  }
});

test('task board plugin makes the board read-only', async () => {
  const harness = await launchApp({ view: 'tickets', disabledPlugins: ['plugin-tasks'], task: true });
  const { page } = harness;
  try {
    await expect(page.locator('[data-testid="tasks-disabled-notice"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-ticket"]')).toBeDisabled();
    await expect(page.locator('button[aria-label="Dispatch to agent"]').first()).toBeDisabled();
    await expect(page.locator('.board-add').first()).toBeDisabled();
    const card = page.locator(`[data-testid="task-${TASK_ID}"]`);
    await expect(card).toHaveAttribute('draggable', 'false');
    await card.click();
    await expect(page.locator('[data-testid="task-modal"]')).toHaveCount(0);
  } finally {
    await closeHarness(harness);
  }
});
