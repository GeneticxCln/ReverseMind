import { useCallback, useEffect, useRef } from 'react';
import { useStore } from './store';
import { nextRoutineRun } from './routines';
import { pluginForTool, toolAllowed } from './plugins';
import type { Agent, AppState, ChatMessage, ChatThread, ToolCall, ToolCallKind, Workspace } from './types';
import { buildOfflineReply } from './runtime/offline';
import { MAX_AGENT_STEPS, agentStepsSinceUser, buildProviderHistory } from './runtime/history';
import { buildSystemPrompt } from './runtime/prompt';
import { TOOL_KINDS, executeTool, makeTool, modeAllowsTool, toolDefinitions, toolKindLabel, toolTitle } from './runtime/tools';
import type { ProviderResult } from './runtime/provider';
import { estimateCostUsd } from './pricing';

export { formatBytes, mcpToolContext, modeAllowsTool, toolKindLabel } from './runtime/tools';

const uid = () => crypto.randomUUID();

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Messages whose generation the user stopped. Checked by the stream, the reveal and the loop. */
const cancelled = new Set<string>();
/** The provider request currently streaming for each chat. */
const activeRequests = new Map<string, string>();

function lastUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === 'user')?.content || '';
}

export function useAgentRuntime() {
  const { getState, mutateChat, addUsage, notify, toast } = useStore();
  const settledHandled = useRef(new Set<string>());

  const patchMessage = useCallback(
    (chatId: string, messageId: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
      mutateChat(chatId, (chat) => ({
        ...chat,
        messages: chat.messages.map((m) => (m.id === messageId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)),
      }));
    },
    [mutateChat]
  );

  const updateTool = useCallback(
    (chatId: string, messageId: string, toolId: string, patch: Partial<ToolCall>) => {
      patchMessage(chatId, messageId, (m) => ({
        toolCalls: (m.toolCalls || []).map((tool) => (tool.id === toolId ? { ...tool, ...patch } : tool)),
      }));
    },
    [patchMessage]
  );

  const autoTools = useCallback(
    (agent: Agent, tools: ToolCall[]) => {
      const settings = getState().settings;
      if (agent.approval === 'auto' || settings.agentApproval === 'auto') return tools;
      if (agent.autopilot) return tools.slice(0, Math.max(1, agent.autopilotMaxSteps || 3));
      return [];
    },
    [getState]
  );

  /** Fire-and-forget holder so runAssistant and continueLoop can call each other. */
  const loopRef = useRef<{ continueLoop: (chatId: string, messageId: string) => Promise<void> } | null>(null);

  const onToolSettled = useCallback(
    (chatId: string, messageId: string) => {
      const chat = getState().chats.find((c) => c.id === chatId);
      const message = chat?.messages.find((m) => m.id === messageId);
      if (!chat || !message?.toolCalls?.length) return;
      if (!message.toolCalls.every((t) => ['done', 'error', 'denied'].includes(t.status))) return;
      const key = `${chatId}:${messageId}`;
      if (settledHandled.current.has(key)) return;
      settledHandled.current.add(key);

      if (message.agentLoop) {
        // Only continue from the newest message, and never after the user pressed Stop.
        const isLast = chat.messages[chat.messages.length - 1]?.id === messageId;
        if (isLast && !message.loopStopped) void loopRef.current?.continueLoop(chatId, messageId);
        return;
      }

      const done = message.toolCalls.filter((t) => t.status === 'done').length;
      const failed = message.toolCalls.filter((t) => t.status === 'error').length;
      const denied = message.toolCalls.filter((t) => t.status === 'denied').length;
      mutateChat(chatId, (c) => ({
        ...c,
        status: 'idle',
        messages: [
          ...c.messages,
          {
            id: uid(),
            role: 'assistant',
            content: failed
              ? `Finished with ${failed} failed action${failed === 1 ? '' : 's'}. Check the tool output above and tell me how you want to proceed.`
              : denied
                ? `${done} action${done === 1 ? '' : 's'} completed. ${denied} ${denied === 1 ? 'was' : 'were'} denied — nothing else was changed.`
                : `All done — ${done} action${done === 1 ? '' : 's'} completed. The workspace is updated and every step is in the transcript above.`,
            createdAt: Date.now(),
          },
        ],
      }));
      const agent = getState().agents.find((a) => a.id === chat.agentId);
      if (agent) notify(`${agent.name} finished`, `${chat.title} · ${done} action${done === 1 ? '' : 's'} completed`, 'success');
    },
    [getState, mutateChat, notify]
  );

  const runTool = useCallback(
    async (chatId: string, messageId: string, tool: ToolCall, workspace: Workspace | null) => {
      const state = getState();
      const chat = state.chats.find((item) => item.id === chatId);
      const mode = chat?.mode || 'agent';
      const deny = (error: string) => {
        updateTool(chatId, messageId, tool.id, { status: 'denied', error, finishedAt: Date.now() });
        setTimeout(() => onToolSettled(chatId, messageId), 0);
        return { output: '', error };
      };
      if (!TOOL_KINDS.has(tool.kind)) return deny(`Unknown tool "${tool.kind}".`);
      if (!modeAllowsTool(mode, tool.kind)) {
        return deny(
          mode === 'plan'
            ? 'Plan mode does not run tools. Switch to Agent mode to execute this action.'
            : 'Ask mode only allows read-only tools. Switch to Agent mode to make changes.'
        );
      }
      const plugin = pluginForTool(state.plugins, tool.kind, tool.args);
      if (plugin && !plugin.enabled) return deny(`${plugin.name} is disabled in Plugins, so this action was not run.`);
      updateTool(chatId, messageId, tool.id, { status: 'running', startedAt: Date.now() });
      const result = await executeTool(workspace, tool);
      updateTool(chatId, messageId, tool.id, {
        status: result.error ? 'error' : 'done',
        output: result.output,
        error: result.error,
        finishedAt: Date.now(),
      });
      setTimeout(() => onToolSettled(chatId, messageId), 0);
      return result;
    },
    [getState, onToolSettled, updateTool]
  );

  const approve = useCallback(
    async (chatId: string, messageId: string, toolId: string) => {
      const state = getState();
      const chat = state.chats.find((c) => c.id === chatId);
      const tool = chat?.messages.find((m) => m.id === messageId)?.toolCalls?.find((t) => t.id === toolId);
      if (!chat || !tool || tool.status !== 'pending') return;
      const workspace = state.workspaces.find((w) => w.id === chat.workspaceId) || null;
      await runTool(chatId, messageId, tool, workspace);
    },
    [getState, runTool]
  );

  const approveAll = useCallback(
    async (chatId: string, messageId: string) => {
      const state = getState();
      const chat = state.chats.find((c) => c.id === chatId);
      const message = chat?.messages.find((m) => m.id === messageId);
      if (!chat || !message?.toolCalls) return;
      const workspace = state.workspaces.find((w) => w.id === chat.workspaceId) || null;
      for (const tool of message.toolCalls.filter((t) => t.status === 'pending')) {
        await runTool(chatId, messageId, tool, workspace);
      }
    },
    [getState, runTool]
  );

  const deny = useCallback(
    (chatId: string, messageId: string, toolId: string) => {
      updateTool(chatId, messageId, toolId, { status: 'denied', finishedAt: Date.now() });
      setTimeout(() => onToolSettled(chatId, messageId), 0);
    },
    [onToolSettled, updateTool]
  );

  /** Offline replies are typed out; hosted replies stream for real. */
  const reveal = useCallback(
    async (chatId: string, messageId: string, full: string, plan?: string[]) => {
      const words = full.split(/(\s+)/);
      let built = '';
      for (let i = 0; i < words.length; i += 6) {
        if (cancelled.has(messageId)) return;
        built += words.slice(i, i + 6).join('');
        patchMessage(chatId, messageId, { content: built, streaming: true });
        await new Promise((r) => setTimeout(r, 10));
      }
      if (!cancelled.has(messageId)) patchMessage(chatId, messageId, { content: full, streaming: false, plan });
    },
    [patchMessage]
  );

  const runOffline = useCallback(
    async (chatId: string, assistantId: string, messages: ChatMessage[]) => {
      const state = getState();
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) return;
      const agent = state.agents.find((a) => a.id === chat.agentId) || state.agents[0];
      const workspace = state.workspaces.find((w) => w.id === chat.workspaceId) || null;
      const prompt = lastUserText(messages);
      const offline = buildOfflineReply(prompt, agent, workspace, chat.mode, (kind) => toolAllowed(state.plugins, kind));
      const tokensIn = estimateTokens(prompt) + 400;
      const tokensOut = estimateTokens(offline.content);
      await reveal(chatId, assistantId, offline.content, offline.plan);
      if (cancelled.has(assistantId)) return;
      mutateChat(chatId, (c) => ({
        ...c,
        status: 'idle',
        messages: c.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: offline.content,
                toolCalls: offline.tools,
                provider: 'ReverseMind Offline',
                model: 'local-rules',
                tokensIn,
                tokensOut,
                plan: offline.plan,
              }
            : m
        ),
      }));
      addUsage({ agentId: agent.id, chatId, provider: 'ReverseMind Offline', model: 'local-rules', inputTokens: tokensIn, outputTokens: tokensOut, costUsd: 0 });
      for (const tool of autoTools(agent, offline.tools)) await runTool(chatId, assistantId, tool, workspace);
    },
    [addUsage, autoTools, getState, mutateChat, reveal, runTool]
  );

  const runHosted = useCallback(
    async (chatId: string, assistantId: string, messages: ChatMessage[]) => {
      const state = getState();
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) return;
      const agent = state.agents.find((a) => a.id === chat.agentId) || state.agents[0];
      const workspace = state.workspaces.find((w) => w.id === chat.workspaceId) || null;
      const provider = state.settings.providers.find((p) => p.id === state.settings.defaultProvider);
      if (!provider) return;
      const model = agent.model || provider.model;
      const requestId = uid();
      activeRequests.set(chatId, requestId);

      let streamed = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        if (!cancelled.has(assistantId)) patchMessage(chatId, assistantId, { content: streamed, streaming: true });
      };
      const off = window.rm.onEvent((raw: unknown) => {
        const e = raw as { event?: string; payload?: { requestId?: string; text?: string } };
        if (e?.event !== 'provider:delta' || e.payload?.requestId !== requestId) return;
        streamed += e.payload.text || '';
        if (!flushTimer) flushTimer = setTimeout(flush, 60);
      });

      try {
        const result: ProviderResult = await window.rm.provider.stream({
          requestId,
          providerId: provider.id,
          model,
          system: buildSystemPrompt(state, chat, agent, workspace),
          messages: buildProviderHistory(messages),
          tools: toolDefinitions(state, chat.mode),
        });
        if (flushTimer) clearTimeout(flushTimer);
        if (cancelled.has(assistantId)) return;

        const latest = getState();
        const toolCalls: ToolCall[] = result.toolCalls.map((call) => {
          const kind = call.name as ToolCallKind;
          return makeTool(kind, toolTitle(kind, call.args), call.args, call.id);
        });
        const tokensIn = result.usage.inputTokens || estimateTokens(JSON.stringify(messages.slice(-4)));
        const tokensOut = result.usage.outputTokens || estimateTokens(result.content);
        const costUsd = estimateCostUsd(provider, tokensIn, tokensOut);
        const content = result.content.trim() || (toolCalls.length ? '' : 'No response content.');
        patchMessage(chatId, assistantId, {
          content,
          streaming: false,
          toolCalls,
          agentLoop: true,
          provider: provider.name,
          model,
          tokensIn,
          tokensOut,
          costUsd,
        });
        mutateChat(chatId, (c) => ({ ...c, status: 'idle' }));
        addUsage({ agentId: agent.id, chatId, provider: provider.name, model, inputTokens: tokensIn, outputTokens: tokensOut, costUsd });

        if (!toolCalls.length) {
          const steps = agentStepsSinceUser(latest.chats.find((c) => c.id === chatId)?.messages || []);
          if (steps > 0) notify(`${agent.name} finished`, chat.title, 'success');
          return;
        }
        // Tools the mode or plugins forbid are denied at once, with a reason the model will see.
        const forbidden = (t: ToolCall) =>
          !TOOL_KINDS.has(t.kind) || !modeAllowsTool(chat.mode, t.kind) || !toolAllowed(getState().plugins, t.kind, t.args);
        const blocked = toolCalls.filter(forbidden);
        const runnable = autoTools(agent, toolCalls.filter((t) => !forbidden(t)));
        for (const tool of [...blocked, ...runnable]) await runTool(chatId, assistantId, tool, workspace);
      } catch (error) {
        if (flushTimer) clearTimeout(flushTimer);
        if (cancelled.has(assistantId)) return;
        const message = String((error as Error)?.message || error);
        patchMessage(chatId, assistantId, {
          content: `${streamed ? `${streamed}\n\n` : ''}The provider call failed. The offline runtime is still available, and no workspace actions were attempted.\n\n\`\`\`\n${message}\n\`\`\``,
          streaming: false,
          error: message,
        });
        mutateChat(chatId, (c) => ({ ...c, status: 'idle' }));
        toast('Provider call failed', message, 'error');
      } finally {
        off();
        if (activeRequests.get(chatId) === requestId) activeRequests.delete(chatId);
      }
    },
    [addUsage, autoTools, getState, mutateChat, notify, patchMessage, runTool, toast]
  );

  const runAssistant = useCallback(
    async (chatId: string, assistantId: string, messages: ChatMessage[]) => {
      const state = getState();
      const hosted = state.settings.providers.some((p) => p.id === state.settings.defaultProvider);
      if (hosted) await runHosted(chatId, assistantId, messages);
      else await runOffline(chatId, assistantId, messages);
    },
    [getState, runHosted, runOffline]
  );

  const continueLoop = useCallback(
    async (chatId: string, messageId: string) => {
      const chat = getState().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const index = chat.messages.findIndex((m) => m.id === messageId);
      const history = chat.messages.slice(0, index + 1);
      if (agentStepsSinceUser(history) >= MAX_AGENT_STEPS) {
        mutateChat(chatId, (c) => ({
          ...c,
          status: 'idle',
          messages: [
            ...c.messages,
            {
              id: uid(),
              role: 'assistant',
              content: `Stopped after ${MAX_AGENT_STEPS} tool rounds to avoid a runaway loop. Tell me to continue if you want more.`,
              createdAt: Date.now(),
            },
          ],
        }));
        return;
      }
      const assistantId = uid();
      mutateChat(chatId, (c) => ({
        ...c,
        status: 'running',
        messages: [...c.messages, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true }],
      }));
      await runHosted(chatId, assistantId, history);
    },
    [getState, mutateChat, runHosted]
  );
  loopRef.current = { continueLoop };

  const send = useCallback(
    async (chatId: string, text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      const chat = getState().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const userMessage: ChatMessage = { id: uid(), role: 'user', content: prompt, createdAt: Date.now() };
      const assistantId = uid();
      const assistant: ChatMessage = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true };
      const newTitle = chat.messages.length === 0 && chat.title === 'New chat' ? prompt.replace(/\s+/g, ' ').slice(0, 52) : chat.title;
      mutateChat(chatId, (c) => ({ ...c, title: newTitle, status: 'running', messages: [...c.messages, userMessage, assistant] }));
      await runAssistant(chatId, assistantId, [...chat.messages, userMessage]);
    },
    [getState, mutateChat, runAssistant]
  );

  const stop = useCallback(
    (chatId: string) => {
      const chat = getState().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const requestId = activeRequests.get(chatId);
      if (requestId) void window.rm.provider.abort(requestId);
      for (const m of chat.messages) if (m.streaming) cancelled.add(m.id);
      const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');
      mutateChat(chatId, (c) => ({
        ...c,
        status: 'idle',
        messages: c.messages.map((m) => {
          if (m.streaming) return { ...m, content: `${m.content}\n\n_Stopped._`.trim(), streaming: false, loopStopped: true };
          if (m.id !== lastAssistant?.id || !m.toolCalls?.length) return m;
          return {
            ...m,
            loopStopped: true,
            toolCalls: m.toolCalls.map((t) => (t.status === 'pending' ? { ...t, status: 'denied', error: 'Stopped by the user.' } : t)),
          };
        }),
      }));
    },
    [getState, mutateChat]
  );

  const regenerate = useCallback(
    async (chatId: string, messageId: string) => {
      const chat = getState().chats.find((c) => c.id === chatId);
      if (!chat || chat.status === 'running') return;
      const index = chat.messages.findIndex((message) => message.id === messageId);
      if (index < 0 || chat.messages[index].role !== 'assistant') return;
      if (chat.messages[chat.messages.length - 1]?.id !== messageId) return;
      const history = chat.messages.slice(0, index);
      if (!lastUserText(history).trim()) return;
      const assistantId = uid();
      mutateChat(chatId, (current) => ({
        ...current,
        status: 'running',
        messages: [...history, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true }],
      }));
      await runAssistant(chatId, assistantId, history);
    },
    [getState, mutateChat, runAssistant]
  );

  return { send, stop, approve, approveAll, deny, runAssistant, regenerate };
}

/** Routines currently executing; shared so the scheduler and the manual Run button cannot double-fire. */
const runningRoutines = new Set<string>();

/** Pass `schedule: true` from exactly one place (App) to enable the 20-second due-check. */
export function useRoutineRunner({ schedule = false }: { schedule?: boolean } = {}) {
  const { getState, setState, createChat, notify, toast } = useStore();
  const { send } = useAgentRuntime();

  const runRoutine = useCallback(
    async (routineId: string) => {
      const state = getState();
      const routine = state.routines.find((r) => r.id === routineId);
      if (!routine || runningRoutines.has(routineId)) return;
      runningRoutines.add(routineId);
      const agent = state.agents.find((a) => a.id === routine.agentId) || state.agents[0];
      const chat = createChat(agent.id, { title: `Routine · ${routine.name}` });
      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((r) =>
          r.id === routineId ? { ...r, lastRunAt: Date.now(), lastResult: 'Running…' } : r
        ),
      }));
      try {
        await send(chat.id, routine.prompt);
        setState((prev) => ({
          ...prev,
          routines: prev.routines.map((r) => (r.id === routineId ? { ...r, lastResult: 'Completed' } : r)),
        }));
        notify('Routine finished', routine.name, 'success');
      } catch (error) {
        toast('Routine failed', String((error as Error)?.message || error), 'error');
        setState((prev) => ({
          ...prev,
          routines: prev.routines.map((r) => (r.id === routineId ? { ...r, lastResult: 'Failed' } : r)),
        }));
      } finally {
        runningRoutines.delete(routineId);
      }
    },
    [createChat, getState, notify, send, setState, toast]
  );

  useEffect(() => {
    if (!schedule) return;
    const check = () => {
      const now = Date.now();
      const due = getState().routines.find(
        (r) => r.enabled && r.nextRunAt !== null && r.nextRunAt <= now && !runningRoutines.has(r.id)
      );
      if (!due) return;
      runRoutine(due.id).finally(() => {
        const next = nextRoutineRun(due.schedule, due.time, Date.now());
        setState((prev) => ({
          ...prev,
          routines: prev.routines.map((r) => (r.id === due.id ? { ...r, nextRunAt: next } : r)),
        }));
      });
    };
    const timer = setInterval(check, 20_000);
    check();
    return () => clearInterval(timer);
  }, [getState, runRoutine, schedule, setState]);

  return { runRoutine };
}
