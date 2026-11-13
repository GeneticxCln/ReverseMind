import type { ProviderConfig } from '../src/types';
import type { ProviderMessage, ProviderResult, ProviderStreamRequest, ProviderToolCall } from '../src/runtime/provider';

const IDLE_TIMEOUT_MS = 120_000;

interface SseEvent {
  event: string;
  data: string;
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) yield { event, data: data.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseArgs(json: string): Record<string, unknown> {
  if (!json.trim()) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toAnthropicMessages(messages: ProviderMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: (m.toolResults || []).map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.output,
          ...(r.isError ? { is_error: true } : {}),
        })),
      };
    }
    if (m.role === 'assistant') {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls || []) blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
      return { role: 'assistant', content: blocks };
    }
    return { role: 'user', content: m.content };
  });
}

function toOpenAiMessages(messages: ProviderMessage[], system?: string) {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'tool') {
      for (const r of m.toolResults || []) out.push({ role: 'tool', tool_call_id: r.id, content: r.output });
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: 'user', content: m.content });
    }
  }
  return out;
}

/**
 * Stream one model turn. `onDelta` receives text as it arrives; tool calls are returned whole.
 * Aborts through `signal`, and also gives up if the server goes quiet for two minutes.
 */
export async function streamCompletion(
  provider: ProviderConfig,
  request: ProviderStreamRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<ProviderResult> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', onAbort, { once: true });
  let idleTimer: NodeJS.Timeout | null = null;
  let timedOut = false;
  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };
  touch();

  const model = request.model || provider.model;
  const base = provider.baseUrl.replace(/\/$/, '');
  const tools = request.tools || [];
  try {
    const result = provider.kind === 'anthropic'
      ? await streamAnthropic(provider, base, model, request, tools, controller.signal, onDelta, touch)
      : await streamOpenAi(provider, base, model, request, tools, controller.signal, onDelta, touch);
    return result;
  } catch (error) {
    if (timedOut) throw new Error('The provider stopped responding for 2 minutes.');
    if (signal.aborted) throw new Error('Aborted');
    throw error;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal.removeEventListener('abort', onAbort);
  }
}

async function failIfBad(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  throw new Error(`${res.status} ${text.slice(0, 800)}`);
}

async function streamAnthropic(
  provider: ProviderConfig,
  base: string,
  model: string,
  request: ProviderStreamRequest,
  tools: NonNullable<ProviderStreamRequest['tools']>,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  touch: () => void
): Promise<ProviderResult> {
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      system: request.system || undefined,
      messages: toAnthropicMessages(request.messages),
      ...(tools.length ? { tools } : {}),
    }),
  });
  await failIfBad(res);
  if (!res.body) throw new Error('Empty response from provider');

  let content = '';
  let stopReason = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const blocks = new Map<number, { id: string; name: string; json: string }>();
  for await (const sse of readSse(res.body)) {
    touch();
    let data: any;
    try {
      data = JSON.parse(sse.data);
    } catch {
      continue;
    }
    if (sse.event === 'error' || data.type === 'error') throw new Error(data.error?.message || 'Provider error');
    if (data.type === 'message_start') inputTokens = data.message?.usage?.input_tokens || 0;
    else if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
      blocks.set(data.index, { id: data.content_block.id, name: data.content_block.name, json: '' });
    } else if (data.type === 'content_block_delta') {
      if (data.delta?.type === 'text_delta') {
        content += data.delta.text;
        onDelta(data.delta.text);
      } else if (data.delta?.type === 'input_json_delta') {
        const block = blocks.get(data.index);
        if (block) block.json += data.delta.partial_json || '';
      }
    } else if (data.type === 'message_delta') {
      stopReason = data.delta?.stop_reason || stopReason;
      outputTokens = data.usage?.output_tokens || outputTokens;
      if (data.usage?.input_tokens) inputTokens = data.usage.input_tokens;
    }
  }
  const toolCalls: ProviderToolCall[] = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => ({ id: b.id, name: b.name, args: parseArgs(b.json) }));
  return { content, toolCalls, usage: { inputTokens, outputTokens }, stopReason };
}

async function streamOpenAi(
  provider: ProviderConfig,
  base: string,
  model: string,
  request: ProviderStreamRequest,
  tools: NonNullable<ProviderStreamRequest['tools']>,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  touch: () => void
): Promise<ProviderResult> {
  const body = {
    model,
    stream: true,
    temperature: 0.2,
    messages: toOpenAiMessages(request.messages, request.system),
    ...(tools.length
      ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) }
      : {}),
  };
  const send = (extra: Record<string, unknown>) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ ...body, ...extra }),
    });
  let res = await send({ stream_options: { include_usage: true } });
  if (res.status === 400) {
    // Some OpenAI-compatible servers reject stream_options; retry without it.
    const text = await res.text().catch(() => '');
    if (!/stream_options/i.test(text)) throw new Error(`400 ${text.slice(0, 800)}`);
    res = await send({});
  }
  await failIfBad(res);
  if (!res.body) throw new Error('Empty response from provider');

  let content = '';
  let stopReason = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const calls = new Map<number, { id: string; name: string; json: string }>();
  for await (const sse of readSse(res.body)) {
    touch();
    if (sse.data === '[DONE]') break;
    let data: any;
    try {
      data = JSON.parse(sse.data);
    } catch {
      continue;
    }
    if (data.error) throw new Error(data.error.message || 'Provider error');
    if (data.usage) {
      inputTokens = data.usage.prompt_tokens || inputTokens;
      outputTokens = data.usage.completion_tokens || outputTokens;
    }
    const choice = data.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      onDelta(delta.content);
    }
    for (const call of delta.tool_calls || []) {
      const entry = calls.get(call.index) || { id: '', name: '', json: '' };
      if (call.id) entry.id = call.id;
      if (call.function?.name) entry.name += call.function.name;
      if (call.function?.arguments) entry.json += call.function.arguments;
      calls.set(call.index, entry);
    }
    if (choice.finish_reason) stopReason = choice.finish_reason;
  }
  const toolCalls: ProviderToolCall[] = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, c]) => c.name)
    .map(([index, c]) => ({ id: c.id || `call_${Date.now()}_${index}`, name: c.name, args: parseArgs(c.json) }));
  return { content, toolCalls, usage: { inputTokens, outputTokens }, stopReason };
}
