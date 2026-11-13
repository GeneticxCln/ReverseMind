import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { CHAT_ID, closeHarness, launchApp } from './helpers';

// Regenerates docs/screenshot.png. Run: RM_SCREENSHOT=1 npx playwright test e2e/screenshot.spec.ts
test.skip(!process.env.RM_SCREENSHOT, 'set RM_SCREENSHOT=1 to regenerate the README screenshot');

test('capture README screenshot', async () => {
  const harness = await launchApp({
    mode: 'code',
    workspaceName: 'my-project',
    settings: { agentApproval: 'auto' },
    prepare: (dir) => {
      fs.writeFileSync(path.join(dir, 'README.md'), '# my-project\n\nA small demo workspace.\n\n- Ask the agent to change files\n- Approve each action\n- Review the result in Git\n');
      fs.writeFileSync(path.join(dir, 'todo.txt'), 'write tests\nship it\n');
    },
    panes: [
      { id: 'p-chat', type: 'chat', title: 'ReverseMind', chatId: CHAT_ID },
      { id: 'p-editor', type: 'editor', title: 'README.md', filePath: 'README.md', tabs: ['README.md'] },
      { id: 'p-term', type: 'terminal', title: 'Terminal', engine: 'terminal' },
      { id: 'p-files', type: 'files', title: 'Files' },
    ],
  });
  const { page, app } = harness;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 860));
    const input = page.locator('[data-testid="composer-input"]').first();
    await input.fill('Create a file named hello.md with content Hello from ReverseMind');
    await input.press('Enter');
    await expect(page.locator('[data-testid="chat-messages"]').first()).toContainText('All done', { timeout: 15_000 });
    await input.fill('Run the command echo reverse-mind-ok');
    await input.press('Enter');
    await expect(page.locator('[data-testid="chat-messages"]').first()).toContainText('reverse-mind-ok', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.getByLabel('Refresh files').click();
    const host = page.locator('[data-testid="terminal-host"]');
    await host.click();
    await page.keyboard.type('ls\n');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot.png') });
  } finally {
    await closeHarness(harness);
  }
});
