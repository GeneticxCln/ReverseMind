import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { modeAllowsTool } from '../src/agent';
import { closeHarness, launchApp } from './helpers';

test('modes constrain which tool kinds can run', () => {
  expect(modeAllowsTool('ask', 'read_file')).toBe(true);
  expect(modeAllowsTool('ask', 'list_files')).toBe(true);
  expect(modeAllowsTool('ask', 'git_status')).toBe(true);
  expect(modeAllowsTool('ask', 'git_diff')).toBe(true);
  expect(modeAllowsTool('ask', 'write_file')).toBe(false);
  expect(modeAllowsTool('ask', 'run_command')).toBe(false);
  expect(modeAllowsTool('ask', 'mcp_tool')).toBe(false);

  expect(modeAllowsTool('plan', 'read_file')).toBe(false);
  expect(modeAllowsTool('plan', 'write_file')).toBe(false);

  expect(modeAllowsTool('agent', 'write_file')).toBe(true);
  expect(modeAllowsTool('agent', 'mcp_tool')).toBe(true);
});

test('Ask mode is read-only and does not propose writes', async () => {
  const harness = await launchApp();
  const { page, workspacePath } = harness;
  const file = path.join(workspacePath, 'ask-blocked.txt');
  try {
    await page.locator('[data-testid="composer-mode"]').click();
    await page.locator('[data-testid="composer-mode-option-ask"]').click();
    await page.locator('[data-testid="composer-input"]').fill('Create a file named ask-blocked.txt with content nope');
    await page.locator('[data-testid="composer-input"]').press('Enter');

    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Ask mode is read-only');
    await expect(page.locator('[data-testid^="approve-"]')).toHaveCount(0);
    expect(fs.existsSync(file)).toBe(false);
  } finally {
    await closeHarness(harness);
  }
});

test('Plan mode plans without proposing tools', async () => {
  const harness = await launchApp();
  const { page, workspacePath } = harness;
  const file = path.join(workspacePath, 'plan-blocked.txt');
  try {
    await page.locator('[data-testid="composer-mode"]').click();
    await page.locator('[data-testid="composer-mode-option-plan"]').click();
    await page.locator('[data-testid="composer-input"]').fill('Create a file named plan-blocked.txt with content nope');
    await page.locator('[data-testid="composer-input"]').press('Enter');

    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Plan mode only plans');
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Map the files and interfaces');
    await expect(page.locator('[data-testid^="approve-"]')).toHaveCount(0);
    expect(fs.existsSync(file)).toBe(false);
  } finally {
    await closeHarness(harness);
  }
});

test('Regenerate replaces the latest assistant response', async () => {
  const harness = await launchApp();
  const { page } = harness;
  try {
    await page.locator('[data-testid="composer-input"]').fill('What can you do?');
    await page.locator('[data-testid="composer-input"]').press('Enter');

    const messages = page.locator('[data-testid="chat-messages"]');
    const assistant = page.locator('[data-testid="message-assistant"]');
    await expect(messages).toContainText('local-first coding agent');
    await expect(assistant).toHaveCount(1);
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(1);

    const regenerate = page.locator('[data-testid^="regenerate-"]');
    await expect(regenerate).toBeVisible();
    await regenerate.click();

    await expect(assistant).toHaveCount(1);
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(1);
    await expect(messages).toContainText('local-first coding agent');
  } finally {
    await closeHarness(harness);
  }
});
