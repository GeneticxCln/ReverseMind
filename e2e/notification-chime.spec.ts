import { expect, test } from '@playwright/test';
import { closeHarness, launchApp, TASK_ID } from './helpers';

test('in-app chime plays for a notification when enabled', async () => {
  const harness = await launchApp({ view: 'tickets', task: true, settings: { notificationChime: true } });
  const { page } = harness;
  try {
    await page.evaluate(() => {
      (window as any).__chimeStarts = 0;
      (window as any).AudioContext = class {
        state = 'running';
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {
            type: 'sine',
            frequency: { value: 0 },
            connect() {},
            start() {
              (window as any).__chimeStarts += 1;
            },
            stop() {},
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime() {},
              linearRampToValueAtTime() {},
              exponentialRampToValueAtTime() {},
            },
            connect() {},
          };
        }
        resume() {
          return Promise.resolve();
        }
      };
    });

    await page.locator(`[data-testid="complete-task-${TASK_ID}"]`).click();
    await expect.poll(() => page.evaluate(() => (window as any).__chimeStarts)).toBeGreaterThan(0);
  } finally {
    await closeHarness(harness);
  }
});
