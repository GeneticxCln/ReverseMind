import { expect, test } from '@playwright/test';
import { closeHarness, launchApp, waitForExit } from './helpers';

test('keep behavior hides the window and stays running until quit', async () => {
  const harness = await launchApp({ settings: { quitBehavior: 'keep' } });
  const { app, page } = harness;
  try {
    await page.evaluate(() => window.rm.window.control('close'));
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), { timeout: 8_000 })
      .toBe(false);
    expect(app.process().exitCode).toBeNull();

    await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {});
    expect(await waitForExit(app)).toBe(true);
  } finally {
    await closeHarness(harness);
  }
});

test('stop behavior exits as soon as the window closes', async () => {
  const harness = await launchApp({ settings: { quitBehavior: 'stop' } });
  const { app, page } = harness;
  try {
    await Promise.race([
      page.evaluate(() => window.rm.window.control('close')).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    expect(await waitForExit(app)).toBe(true);
    expect(app.process().exitCode).not.toBeNull();
  } finally {
    await closeHarness(harness);
  }
});
