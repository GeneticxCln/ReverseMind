import type { ChatMessage, ToolCall } from '../types';
import type { ProviderMessage, ProviderToolResult } from './provider';

const MAX_RESULT_CHARS = 20000;

export const MAX_AGENT_STEPS = 15;

function toolResult(tool: ToolCall): ProviderToolResult {
  const base = { id: tool.id, name: tool.kind };
  let text: string;
  let isError = false;
  if (tool.status === 'done') {
    text = tool.output || 'Done.';
  } else if (tool.status === 'error') {
    isError = true;
    text = [tool.output, tool.error].filter(Boolean).join('\n') || 'The action failed.';
  } else if (tool.status === 'denied') {
    isError = true;
    text = tool.error || 'The user denied this action.';
  } else {
    isError = true;
    text = 'This action was not run.';
  }
  if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n… truncated`;
  return { ...base, output: text, isError };
}

/**
 * Convert stored chat messages into provider turns. Every tool call is paired with a result so the
 * request is valid even when an action was never approved. Keeps the last `maxTurns` user turns,
 * always starting on a user message and never splitting a tool call from its result.
 */
export function buildProviderHistory(messages: ChatMessage[], maxTurns = 12): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'user') {
      if (message.content.trim()) out.push({ role: 'user', content: message.content });
      continue;
    }
    const tools = message.toolCalls || [];
    if (message.streaming && !message.content && !tools.length) continue;
    if (!message.content.trim() && !tools.length) continue;
    out.push({
      role: 'assistant',
      content: message.content,
      toolCalls: tools.length ? tools.map((t) => ({ id: t.id, name: t.kind, args: t.args })) : undefined,
    });
    if (tools.length) out.push({ role: 'tool', content: '', toolResults: tools.map(toolResult) });
  }
  const userIndexes = out.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0);
  if (userIndexes.length > maxTurns) return out.slice(userIndexes[userIndexes.length - maxTurns]);
  const firstUser = userIndexes[0];
  return firstUser === undefined ? [] : out.slice(firstUser);
}

/** Assistant tool rounds since the last user message. */
export function agentStepsSinceUser(messages: ChatMessage[]): number {
  let steps = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === 'user') break;
    if (message.role === 'assistant' && message.toolCalls?.length) steps += 1;
  }
  return steps;
}
