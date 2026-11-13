import { expect, test } from '@playwright/test';
import { closeHarness, installFakeSpeech, launchApp } from './helpers';

test('dictation auto-sends the completed transcript when enabled', async () => {
  const harness = await launchApp({ settings: { voiceEnabled: true, voiceAutoSend: true } });
  const { page } = harness;
  try {
    await installFakeSpeech(page, 'run the tests');
    await page.locator('button[aria-label="Dictate"]').click();
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('run the tests');
    await expect(page.locator('[data-testid="composer-input"]')).toHaveValue('');
  } finally {
    await closeHarness(harness);
  }
});

test('dictation only inserts the transcript when auto-send is off', async () => {
  const harness = await launchApp({ settings: { voiceEnabled: true, voiceAutoSend: false } });
  const { page } = harness;
  try {
    await installFakeSpeech(page, 'run the tests');
    await page.locator('button[aria-label="Dictate"]').click();
    await expect(page.locator('[data-testid="composer-input"]')).toHaveValue('run the tests');
    await expect(page.locator('[data-testid="chat-messages"]')).toHaveCount(0);
  } finally {
    await closeHarness(harness);
  }
});

test('dictation control is hidden when voice input is disabled', async () => {
  const harness = await launchApp({ settings: { voiceEnabled: false } });
  const { page } = harness;
  try {
    await expect(page.locator('button[aria-label="Dictate"]')).toHaveCount(0);
  } finally {
    await closeHarness(harness);
  }
});
