import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Check, GitBranch, Globe, Sparkles, TerminalSquare, WandSparkles } from 'lucide-react';
import type { Agent, ChatThread } from '../types';
import { useStore } from '../store';
import { useAgentRuntime } from '../agent';
import { MessageView } from './MessageView';
import { Composer } from './Composer';
import { Button, LogoMark } from './ui';

const SUGGESTIONS = [
  'Create a file named hello.txt with content Hello from ReverseMind',
  'Run the command echo reverse-mind-ok',
  'Show me the workspace files',
  'What can you do?',
];

export function ChatPanel({
  chat,
  agent,
  compact = false,
}: {
  chat: ChatThread;
  agent: Agent | null;
  compact?: boolean;
}) {
  const { mutateChat, state } = useStore();
  const runtime = useAgentRuntime();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);
  const workspace = state.workspaces.find((w) => w.id === chat.workspaceId) || null;
  const busy = chat.status === 'running';
  const pending = chat.messages.flatMap((message) => (message.toolCalls || []).filter((t) => t.status === 'pending')).length;
  const lastAssistantId = [...chat.messages].reverse().find((message) => message.role === 'assistant')?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = chat.messages.length > lastCount.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    if (grew || nearBottom || chat.status === 'running') {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = chat.messages.length;
  }, [chat.messages, chat.status]);

  const send = (text: string) => {
    void runtime.send(chat.id, text);
  };

  return (
    <div className={`chat-view ${compact ? 'compact' : ''}`}>
      <div className="chat-body">
        <div
          className="chat-scroll"
          ref={scrollRef}
          data-testid="chat-scroll"
          onScroll={() => {
            const el = scrollRef.current;
            if (el) lastCount.current = chat.messages.length;
          }}
        >
          {chat.messages.length === 0 ? (
            <div className="chat-empty" data-testid="chat-empty">
              <div className="hero-mark">
                <LogoMark size={30} />
              </div>
              <h1>What should we build?</h1>
              <p>
                {agent?.name || 'Your agent'} works inside your machine. Give it a task, paste an error, or start with
                one of these.
              </p>
              {!workspace && (
                <div className="hint-box" style={{ marginBottom: 14, maxWidth: 520 }}>
                  Pick a workspace in the composer to let the agent read files and make real changes. Everything runs
                  locally.
                </div>
              )}
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion, index) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={suggestion}
                    data-testid={`suggestion-${index}`}
                    onClick={() => send(suggestion)}
                  >
                    {index === 0 ? <WandSparkles size={11} /> : null}
                    {index === 1 ? <TerminalSquare size={11} /> : null}
                    {index === 2 ? <GitBranch size={11} /> : null}
                    {index === 3 ? <Sparkles size={11} /> : null}
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-thread" data-testid="chat-messages">
              {chat.messages.map((message) => (
                <MessageView
                  key={message.id}
                  message={message}
                  agent={agent}
                  busy={busy}
                  onApprove={(toolId) => void runtime.approve(chat.id, message.id, toolId)}
                  onApproveAll={() => void runtime.approveAll(chat.id, message.id)}
                  onDeny={(toolId) => runtime.deny(chat.id, message.id, toolId)}
                  onRegenerate={
                    message.id === lastAssistantId ? () => void runtime.regenerate(chat.id, message.id) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
        <div className="composer-zone">
          {pending > 0 && (
            <div className="composer-inner">
              <div className="pending-approval-banner">
                <AlertTriangle size={13} />
                {pending} action{pending === 1 ? '' : 's'} waiting for your approval
                <span className="spacer" />
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Check size={11} />}
                  onClick={() => {
                    const message = [...chat.messages].reverse().find((m) => (m.toolCalls || []).some((t) => t.status === 'pending'));
                    if (message) void runtime.approveAll(chat.id, message.id);
                  }}
                >
                  Approve all
                </Button>
              </div>
            </div>
          )}
          <Composer
            agent={agent}
            workspaceId={chat.workspaceId}
            busy={busy}
            mode={chat.mode}
            placeholder={agent ? `Message ${agent.name}…` : 'Message your agent…'}
            compact={compact}
            onModeChange={(mode) => mutateChat(chat.id, (c) => ({ ...c, mode }))}
            onWorkspaceChange={(workspaceId) => {
              mutateChat(chat.id, (c) => ({ ...c, workspaceId }));
            }}
            onSend={send}
            onStop={() => runtime.stop(chat.id)}
          />
        </div>
      </div>
    </div>
  );
}
