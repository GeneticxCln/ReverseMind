import { test, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { streamCompletion } from '../electron/provider';
import { MAX_AGENT_STEPS, agentStepsSinceUser, buildProviderHistory } from '../src/runtime/history';
import { toolDefinitions } from '../src/runtime/tools';
import { createDefaultState } from '../src/defaults';
import type { ChatMessage, ProviderConfig, ToolCall } from '../src/types';

function sse(events: { event?: string; data: unknown }[]): string {
  return events.map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`).join('');
}

async function serve(handler: (req: http.IncomingMessage, body: any, res: http.ServerResponse) => void) {
  const requests: any[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: req.url, headers: req.headers, body });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, requests, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
}

const provider = (kind: ProviderConfig['kind'], baseUrl: string): ProviderConfig => ({
  id: 'p',
  name: 'Mock',
  kind,
  baseUrl,
  apiKey: 'secret',
  model: 'm',
});

const tool = (id: string, status: ToolCall['status'], extra: Partial<ToolCall> = {}): ToolCall => ({
  id,
  kind: 'read_file',
  title: 't',
  args: { path: 'a.txt' },
  status,
  ...extra,
});
const msg = (role: ChatMessage['role'], content: string, toolCalls?: ToolCall[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: Math.random().toString(36),
  role,
  content,
  createdAt: 0,
  toolCalls,
  ...extra,
});

test('Anthropic stream returns text, tool calls and usage, and sends tools and results', async () => {
  const server = await serve((_req, _body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      sse([
        { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 11 } } } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reading ' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'now.' } } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"a.txt"}' } } },
        { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } } },
      ])
    );
  });
  try {
    const deltas: string[] = [];
    const result = await streamCompletion(
      provider('anthropic', server.url),
      {
        requestId: 'r',
        providerId: 'p',
        system: 'sys',
        tools: [{ name: 'read_file', description: 'd', input_schema: { type: 'object' } }],
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'ok', toolCalls: [{ id: 't0', name: 'list_files', args: {} }] },
          { role: 'tool', content: '', toolResults: [{ id: 't0', name: 'list_files', output: 'a.txt', isError: false }] },
        ],
      },
      (t) => deltas.push(t),
      new AbortController().signal
    );
    expect(deltas.join('')).toBe('Reading now.');
    expect(result.content).toBe('Reading now.');
    expect(result.toolCalls).toEqual([{ id: 'toolu_1', name: 'read_file', args: { path: 'a.txt' } }]);
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(result.stopReason).toBe('tool_use');

    const sent = server.requests[0];
    expect(sent.url).toBe('/v1/messages');
    expect(sent.headers['x-api-key']).toBe('secret');
    expect(sent.body.stream).toBe(true);
    expect(sent.body.tools).toHaveLength(1);
    expect(sent.body.messages[1].content[1]).toMatchObject({ type: 'tool_use', id: 't0', name: 'list_files' });
    expect(sent.body.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't0', content: 'a.txt' }],
    });
  } finally {
    await server.close();
  }
});

test('OpenAI stream assembles split tool-call arguments', async () => {
  const server = await serve((_req, _body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      sse([
        { data: { choices: [{ delta: { content: 'Hi' } }] } },
        { data: { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'run_command', arguments: '{"comm' } }] } }] } },
        { data: { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'and":"ls"}' } }] } }] } },
        { data: { choices: [{ delta: {}, finish_reason: 'tool_calls' }] } },
        { data: { choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } } },
        '[DONE]',
      ].map((e) => (typeof e === 'string' ? { data: e } : e)))
    );
  });
  try {
    const result = await streamCompletion(
      provider('openai', server.url),
      {
        requestId: 'r',
        providerId: 'p',
        system: 'sys',
        tools: [{ name: 'run_command', description: 'd', input_schema: { type: 'object' } }],
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'list_files', args: {} }] },
          { role: 'tool', content: '', toolResults: [{ id: 'c0', name: 'list_files', output: 'x', isError: false }] },
        ],
      },
      () => {},
      new AbortController().signal
    );
    expect(result.content).toBe('Hi');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'run_command', args: { command: 'ls' } }]);
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
    const sent = server.requests[0].body;
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(sent.messages[2].tool_calls[0]).toMatchObject({ id: 'c0', type: 'function', function: { name: 'list_files' } });
    expect(sent.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c0', content: 'x' });
    expect(sent.tools[0].function.name).toBe('run_command');
  } finally {
    await server.close();
  }
});

test('OpenAI retries once without stream_options when the server rejects it', async () => {
  const server = await serve((_req, body, res) => {
    if (body.stream_options) {
      res.writeHead(400).end('unknown field stream_options');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sse([{ data: { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] } }, { data: '[DONE]' }]));
  });
  try {
    const result = await streamCompletion(
      provider('openai', server.url),
      { requestId: 'r', providerId: 'p', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      new AbortController().signal
    );
    expect(result.content).toBe('ok');
    expect(server.requests).toHaveLength(2);
  } finally {
    await server.close();
  }
});

test('provider errors surface status and body; abort stops a stalled stream', async () => {
  const bad = await serve((_req, _body, res) => res.writeHead(401).end('{"error":"bad key"}'));
  const stall = await serve((_req, _body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(sse([{ event: 'message_start', data: { type: 'message_start', message: { usage: {} } } }]));
  });
  try {
    await expect(
      streamCompletion(provider('anthropic', bad.url), { requestId: 'r', providerId: 'p', messages: [{ role: 'user', content: 'x' }] }, () => {}, new AbortController().signal)
    ).rejects.toThrow(/401.*bad key/);

    const controller = new AbortController();
    const pending = streamCompletion(provider('anthropic', stall.url), { requestId: 'r', providerId: 'p', messages: [{ role: 'user', content: 'x' }] }, () => {}, controller.signal);
    setTimeout(() => controller.abort(), 150);
    await expect(pending).rejects.toThrow('Aborted');
  } finally {
    await bad.close();
    await stall.close();
  }
});

test('history pairs every tool call with a result and starts on a user turn', () => {
  const history = buildProviderHistory([
    msg('assistant', 'stray greeting'),
    msg('user', 'do it'),
    msg('assistant', 'working', [tool('a', 'done', { output: 'file text' }), tool('b', 'denied'), tool('c', 'pending'), tool('d', 'error', { output: 'partial', error: 'boom' })], { agentLoop: true }),
    msg('assistant', '', undefined, { streaming: true }),
  ]);
  expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
  const results = history[2].toolResults!;
  expect(results.map((r) => [r.id, r.isError])).toEqual([['a', false], ['b', true], ['c', true], ['d', true]]);
  expect(results[0].output).toBe('file text');
  expect(results[1].output).toBe('The user denied this action.');
  expect(results[2].output).toBe('This action was not run.');
  expect(results[3].output).toContain('boom');
});

test('history window never splits a tool call from its result', () => {
  const turns: ChatMessage[] = [];
  for (let i = 0; i < 20; i += 1) {
    turns.push(msg('user', `q${i}`), msg('assistant', `a${i}`, [tool(`t${i}`, 'done', { output: 'o' })]));
  }
  const history = buildProviderHistory(turns, 5);
  expect(history[0]).toMatchObject({ role: 'user', content: 'q15' });
  expect(history.filter((m) => m.role === 'user')).toHaveLength(5);
  const calls = history.flatMap((m) => m.toolCalls || []).map((c) => c.id);
  const results = history.flatMap((m) => m.toolResults || []).map((r) => r.id);
  expect(results).toEqual(calls);
});

test('agent step counting stops at the last user message', () => {
  const messages = [
    msg('user', 'a'),
    msg('assistant', '', [tool('1', 'done')]),
    msg('user', 'b'),
    msg('assistant', '', [tool('2', 'done')]),
    msg('assistant', '', [tool('3', 'done')]),
  ];
  expect(agentStepsSinceUser(messages)).toBe(2);
  expect(MAX_AGENT_STEPS).toBeGreaterThan(2);
});

test('tool definitions follow mode and plugin gating', () => {
  const state = createDefaultState();
  const names = (mode: 'ask' | 'plan' | 'agent') => toolDefinitions(state, mode).map((t) => t.name).sort();
  expect(names('plan')).toEqual([]);
  expect(names('ask')).toEqual(['git_diff', 'git_status', 'list_files', 'read_file']);
  expect(names('agent')).toEqual(['git_commit', 'git_diff', 'git_stage', 'git_status', 'list_files', 'read_file', 'run_command', 'write_file']);
  state.plugins = state.plugins.map((p) => (p.id === 'plugin-terminal' ? { ...p, enabled: false } : p));
  expect(names('agent')).not.toContain('run_command');
});
