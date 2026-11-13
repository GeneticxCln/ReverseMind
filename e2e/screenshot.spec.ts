import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { closeHarness, launchApp } from './helpers';

// Regenerates docs/screenshot.png. Run: RM_SCREENSHOT=1 npx playwright test e2e/screenshot.spec.ts
test.skip(!process.env.RM_SCREENSHOT, 'set RM_SCREENSHOT=1 to regenerate the README screenshot');

test('capture README screenshot', async () => {
  const harness = await launchApp({
    mode: 'agent',
    workspaceName: 'my-project',
    settings: { agentApproval: 'ask' },
    autopilot: false,
    prepare: (dir) => {
      fs.writeFileSync(path.join(dir, 'README.md'), '# my-project\n');
      fs.writeFileSync(path.join(dir, 'todo.txt'), 'write tests\nship it\n');
    },
  });
  const { page, app } = harness;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1240));
    const input = page.locator('[data-testid="composer-input"]').first();
    const messages = page.locator('[data-testid="chat-messages"]').first();

    await input.fill('What can you do?');
    await input.press('Enter');
    await expect(messages).toContainText('local-first coding agent', { timeout: 15_000 });

    await expect(page.locator('[data-testid="composer-send"]')).toHaveAttribute('title', 'Send message'); // reply finished
    await input.fill('Create a file named CHANGELOG.md with content Initial release');
    await input.press('Enter');
    await expect(page.locator('[data-testid^="approve-"]').first()).toBeVisible({ timeout: 15_000 });

    await input.fill('Then run the command npm test and commit the result');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot.png') });
  } finally {
    await closeHarness(harness);
  }
});
