import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { closeHarness, launchApp } from './helpers';

function sse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

const textTurn = (text: string) =>
  sse([
    { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 20 } } } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } } },
  ]);

const toolTurn = (id: string, name: string, input: unknown) =>
  sse([
    { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 20 } } } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } } },
  ]);

async function mockProvider(script: (n: number, body: any, res: http.ServerResponse) => void) {
  const bodies: any[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      bodies.push(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      script(bodies.length, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    bodies,
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}

const providerSettings = (url: string, approval: 'ask' | 'auto') => ({
  providers: [{ id: 'mock', name: 'Mock', kind: 'anthropic' as const, baseUrl: url, apiKey: 'k', model: 'mock-model' }],
  defaultProvider: 'mock',
  agentApproval: approval,
});

test('hosted agent reads tool results and continues until it can answer', async () => {
  const provider = await mockProvider((n, _body, res) => {
    if (n === 1) res.end(toolTurn('toolu_w', 'write_file', { path: 'notes.md', content: 'from the model' }));
    else if (n === 2) res.end(toolTurn('toolu_r', 'read_file', { path: 'notes.md' }));
    else res.end(textTurn('Created notes.md and confirmed its contents.'));
  });
  const harness = await launchApp({ settings: providerSettings(provider.url, 'auto') });
  try {
    await harness.page.locator('[data-testid="composer-input"]').fill('make a notes file and check it');
    await harness.page.locator('[data-testid="composer-input"]').press('Enter');
    await expect(harness.page.locator('[data-testid="chat-messages"]')).toContainText('Created notes.md and confirmed its contents.', { timeout: 20_000 });

    expect(fs.readFileSync(path.join(harness.workspacePath, 'notes.md'), 'utf8')).toBe('from the model');
    expect(provider.bodies).toHaveLength(3);
    expect(provider.bodies[0].tools.map((t: any) => t.name)).toContain('write_file');
    // Request 2 carries the write result; request 3 carries the file contents the model asked for.
    const second = provider.bodies[1].messages.at(-1);
    expect(second.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_w' });
    expect(second.content[0].content).toContain('Wrote notes.md');
    const third = provider.bodies[2].messages.at(-1);
    expect(third.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_r' });
    expect(third.content[0].content).toContain('from the model');
  } finally {
    await closeHarness(harness);
    await provider.close();
  }
});

test('hosted agent waits for approval, then continues; denial is reported back to the model', async () => {
  const provider = await mockProvider((n, _body, res) => {
    if (n === 1) res.end(toolTurn('toolu_c', 'run_command', { command: 'echo should-not-run > denied.txt' }));
    else res.end(textTurn('Understood, I will not run it.'));
  });
  const harness = await launchApp({ settings: providerSettings(provider.url, 'ask') });
  try {
    await harness.page.locator('[data-testid="composer-input"]').fill('run something');
    await harness.page.locator('[data-testid="composer-input"]').press('Enter');
    const deny = harness.page.locator('[data-testid^="deny-"]').first();
    await expect(deny).toBeVisible({ timeout: 20_000 });
    expect(provider.bodies).toHaveLength(1);
    await deny.click();
    await expect(harness.page.locator('[data-testid="chat-messages"]')).toContainText('Understood, I will not run it.', { timeout: 20_000 });
    const result = provider.bodies[1].messages.at(-1).content[0];
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_c', is_error: true });
    expect(fs.existsSync(path.join(harness.workspacePath, 'denied.txt'))).toBe(false);
  } finally {
    await closeHarness(harness);
    await provider.close();
  }
});

test('Ask mode denies write tools the model tries anyway and tells it why', async () => {
  const provider = await mockProvider((n, _body, res) => {
    if (n === 1) res.end(toolTurn('toolu_x', 'write_file', { path: 'x.txt', content: 'x' }));
    else res.end(textTurn('Cannot write in Ask mode.'));
  });
  const harness = await launchApp({ settings: providerSettings(provider.url, 'auto') });
  try {
    await harness.page.locator('[data-testid="composer-mode"]').click();
    await harness.page.locator('[data-testid="composer-mode-option-ask"]').click();
    await harness.page.locator('[data-testid="composer-input"]').fill('write x');
    await harness.page.locator('[data-testid="composer-input"]').press('Enter');
    await expect(harness.page.locator('[data-testid="chat-messages"]')).toContainText('Cannot write in Ask mode.', { timeout: 20_000 });
    expect(provider.bodies[0].tools.map((t: any) => t.name)).not.toContain('write_file');
    expect(provider.bodies[1].messages.at(-1).content[0].content).toContain('Ask mode only allows read-only tools');
    expect(fs.existsSync(path.join(harness.workspacePath, 'x.txt'))).toBe(false);
  } finally {
    await closeHarness(harness);
    await provider.close();
  }
});

test('streamed text appears before the reply finishes, and Stop cancels it', async () => {
  const provider = await mockProvider((_n, _body, res) => {
    res.write(
      sse([
        { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 1 } } } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial answer' } } },
      ])
    ); // never ends
  });
  const harness = await launchApp({ settings: providerSettings(provider.url, 'auto') });
  try {
    await harness.page.locator('[data-testid="composer-input"]').fill('talk');
    await harness.page.locator('[data-testid="composer-input"]').press('Enter');
    const messages = harness.page.locator('[data-testid="chat-messages"]');
    await expect(messages).toContainText('partial answer', { timeout: 20_000 });
    await harness.page.locator('[data-testid="composer-send"]').click(); // Stop while busy
    await expect(messages).toContainText('Stopped');
    await expect(harness.page.locator('[data-testid="composer-send"]')).toHaveAttribute('title', 'Send message');
    await harness.page.waitForTimeout(500);
    await expect(messages).not.toContainText('provider call failed');
    expect(provider.bodies).toHaveLength(1); // no continuation after Stop
  } finally {
    await closeHarness(harness);
    await provider.close();
  }
});
