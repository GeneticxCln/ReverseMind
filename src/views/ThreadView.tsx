import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { AgentAvatar, Badge, Button, IconButton } from '../components/ui';
import { ChatPanel } from '../components/ChatPanel';

export function ThreadView() {
  const { state, patchUi, createChat, deleteChat } = useStore();
  const [query, setQuery] = useState('');
  const agent = state.agents.find((a) => a.id === state.ui.selectedAgentId) || state.agents[0] || null;
  const chats = useMemo(
    () => [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.chats]
  );
  const filtered = query.trim()
    ? chats.filter((chat) => {
        const q = query.toLowerCase();
        return (
          chat.title.toLowerCase().includes(q) ||
          chat.messages.some((message) => message.content.toLowerCase().includes(q))
        );
      })
    : chats;
  const selected = chats.find((chat) => chat.id === state.ui.selectedChatId) || chats[0] || null;

  useEffect(() => {
    if (selected && selected.id !== state.ui.selectedChatId) patchUi({ selectedChatId: selected.id });
  }, [patchUi, selected, state.ui.selectedChatId]);

  const selectedAgent = selected ? state.agents.find((a) => a.id === selected.agentId) || agent : agent;

  return (
    <div className="thread-view" data-testid="thread-view">
      <div className="thread-list">
        <div className="thread-list-head">
          <div>
            <h2>Threads</h2>
            <p>{chats.length} conversations across {state.agents.length} agents</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="New thread"
            data-testid="new-thread"
            onClick={() => {
              if (!agent) return;
              const chat = createChat(agent.id);
              patchUi({ selectedChatId: chat.id });
            }}
          >
            <MessageSquarePlus size={15} />
          </button>
        </div>
        <div className="thread-search">
          <Search size={12} />
          <input
            value={query}
            placeholder="Search all conversations…"
            onChange={(e) => setQuery(e.target.value)}
            data-testid="thread-search"
          />
        </div>
        <div className="thread-list-scroll">
          {filtered.map((chat) => {
            const chatAgent = state.agents.find((a) => a.id === chat.agentId);
            const last = chat.messages[chat.messages.length - 1];
            return (
              <button
                type="button"
                className={`thread-row ${chat.id === selected?.id ? 'active' : ''}`}
                key={chat.id}
                onClick={() => patchUi({ selectedChatId: chat.id })}
                data-testid={`thread-${chat.id}`}
              >
                <AgentAvatar name={chatAgent?.name || 'RM'} color={chatAgent?.color || '#8b5cf6'} size={28} />
                <span className="thread-row-main">
                  <span className="thread-row-title">{chat.title}</span>
                  <span className="thread-row-snippet">
                    {last ? `${last.role === 'user' ? 'You: ' : ''}${last.content.replace(/\s+/g, ' ').slice(0, 74)}` : 'No messages yet'}
                  </span>
                  <span className="thread-row-meta">
                    {chatAgent?.name || 'Agent'} · {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                {chat.status === 'running' ? <Badge tone="amber">Running</Badge> : null}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="faint small" style={{ padding: 16 }}>No conversations match your search.</div>}
        </div>
        <div className="thread-list-foot">
          <span>{selected?.mode ? `Mode: ${selected.mode}` : 'Pick a conversation'}</span>
          {selected && chats.length > 1 && (
            <IconButton
              label="Delete thread"
              onClick={() => {
                deleteChat(selected.id);
                const next = chats.find((chat) => chat.id !== selected.id);
                if (next) patchUi({ selectedChatId: next.id });
              }}
            >
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="thread-main">
        {selected ? (
          <>
            <div className="thread-main-head">
              <AgentAvatar name={selectedAgent?.name || 'RM'} color={selectedAgent?.color || '#8b5cf6'} size={24} />
              <div>
                <b>{selectedAgent?.name || 'Agent'}</b>
                <span className="faint small"> · {selected.title}</span>
              </div>
              <span className="spacer" />
              <Button
                variant="subtle"
                size="sm"
                icon={<MessageSquarePlus size={12} />}
                onClick={() => {
                  if (!agent) return;
                  const chat = createChat(selected.agentId || agent.id);
                  patchUi({ selectedChatId: chat.id });
                }}
              >
                New thread
              </Button>
            </div>
            <ChatPanel chat={selected} agent={selectedAgent} />
          </>
        ) : (
          <div className="empty-state">
            <h3>No conversation selected</h3>
            <p>Start a thread with one of your agents.</p>
            <Button
              variant="primary"
              onClick={() => {
                if (!agent) return;
                const chat = createChat(agent.id);
                patchUi({ selectedChatId: chat.id });
              }}
            >
              New thread
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
