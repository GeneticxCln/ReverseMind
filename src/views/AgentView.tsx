import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookText, Plus, Search, Settings2, TerminalSquare, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { ChatPanel } from '../components/ChatPanel';
import { AgentAvatar, Badge, Button, IconButton } from '../components/ui';
import { AgentModal } from '../components/Modals';
import { ChipPopover } from '../components/DropMenu';
import { ENGINE_META } from '../types';
import { engineTerminalPane } from '../engines';

export function AgentView() {
  const { state, setState, patchUi, mutateChat, notify, createChat, deleteChat, toast } = useStore();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const ensured = useRef<Set<string>>(new Set());
  const agent = state.agents.find((a) => a.id === state.ui.selectedAgentId) || state.agents[0] || null;
  const chats = useMemo(
    () =>
      state.chats
        .filter((chat) => chat.agentId === agent?.id)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [state.chats, agent?.id]
  );
  const selected = state.chats.find((chat) => chat.id === state.ui.selectedChatId && chat.agentId === agent?.id) || null;
  const running = chats.filter((chat) => chat.status === 'running').length;

  useEffect(() => {
    if (!agent) return;
    if (chats.length > 0) {
      ensured.current.add(agent.id);
      if (!selected) patchUi({ selectedChatId: chats[0].id, activeThreadId: chats[0].id });
      return;
    }
    if (ensured.current.has(agent.id)) return;
    ensured.current.add(agent.id);
    const chat = createChat(agent.id);
    patchUi({ selectedChatId: chat.id });
  }, [agent, chats, createChat, patchUi, selected]);

  if (!agent) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-title-wrap">
            <h1>Agents</h1>
            <p>Create an agent to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  const engine = ENGINE_META[agent.engine] || ENGINE_META.reversemind;
  const filtered = query.trim()
    ? chats.filter((chat) => {
        const q = query.toLowerCase();
        return (
          chat.title.toLowerCase().includes(q) ||
          chat.messages.some((message) => message.content.toLowerCase().includes(q))
        );
      })
    : chats;

  const newChat = () => {
    const chat = createChat(agent.id);
    patchUi({ selectedChatId: chat.id });
  };

  const launchCli = () => {
    const workspace =
      state.workspaces.find((item) => item.id === state.ui.selectedWorkspaceId) ||
      [...state.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0] ||
      null;
    if (!workspace) {
      toast('Create a workspace first', `${engine.label} runs inside a workspace.`, 'warning');
      patchUi({ mode: 'code', view: 'workspace' });
      return;
    }
    const pane = engineTerminalPane(agent.engine, workspace);
    if (!pane) return;
    setState((prev) => {
      const existing = prev.layouts.find((layout) => layout.workspaceId === workspace.id);
      const layouts = existing
        ? prev.layouts.map((layout) =>
            layout.workspaceId === workspace.id
              ? { ...layout, panes: [...layout.panes, pane], activePaneId: pane.id }
              : layout
          )
        : [...prev.layouts, { workspaceId: workspace.id, panes: [pane], activePaneId: pane.id }];
      return {
        ...prev,
        layouts,
        ui: { ...prev.ui, mode: 'code', view: 'workspace', selectedWorkspaceId: workspace.id },
      };
    });
    toast(
      `${engine.label} launched`,
      workspace.kind === 'ssh' ? `Starting a remote session in ${workspace.name}.` : `Running in ${workspace.name}.`,
      'success'
    );
  };

  return (
    <div className="chat-view" data-testid="agent-view">
      <div className="chat-top">
        <div className="chat-top-left">
          <AgentAvatar name={agent.name} color={agent.color} size={32} status={running ? 'running' : 'online'} />
          <div>
            <div className="chat-agent-name">{agent.name}</div>
            <div className="chat-agent-sub">
              <span className="engine-dot" style={{ background: engine.color }} />
              {agent.engine === 'reversemind'
                ? 'ReverseMind local runtime'
                : engine.command
                  ? `${engine.label} CLI · Launch opens a terminal`
                  : 'ReverseMind local runtime'}
              {agent.autopilot && <Badge tone="cyan">Autopilot</Badge>}
            </div>
          </div>
        </div>
        <div className="chat-top-mid">
          <ChipPopover label="Saved prompts" icon={<BookText size={12} />} count={state.prompts.length} testId="saved-prompts-toggle">
            {(close) => (
              <div className="pop-list">
                {state.prompts.map((prompt) => (
                  <button
                    type="button"
                    className="prompt-mini"
                    key={prompt.id}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('rm:composer-draft', { detail: { text: prompt.body } }));
                      notify('Prompt inserted', prompt.title, 'info');
                      close();
                    }}
                  >
                    <b>{prompt.title}</b>
                    <span>{prompt.body.slice(0, 90)}{prompt.body.length > 90 ? '…' : ''}</span>
                  </button>
                ))}
                {state.prompts.length === 0 && <div className="faint small" style={{ padding: 8 }}>No saved prompts yet. Add one from the Prompts page.</div>}
              </div>
            )}
          </ChipPopover>
          <ChipPopover label="Search" icon={<Search size={12} />} count={chats.length} testId="search-conversations-toggle">
            {(close) => (
              <div className="pop-list">
                <div className="search-row">
                  <Search size={12} />
                  <input
                    value={query}
                    autoFocus
                    placeholder="Search this agent's conversations…"
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="chat-search-input"
                  />
                  {query && (
                    <button type="button" className="icon-button" aria-label="Clear" onClick={() => setQuery('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="chat-search-results">
                  {filtered.slice(0, 10).map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className="search-result"
                      onClick={() => {
                        patchUi({ selectedChatId: chat.id });
                        close();
                      }}
                    >
                      <b>{chat.title}</b>
                      <span>{new Date(chat.updatedAt).toLocaleDateString()}</span>
                    </button>
                  ))}
                  {filtered.length === 0 && <div className="faint small" style={{ padding: 6 }}>No conversations match “{query}”.</div>}
                </div>
              </div>
            )}
          </ChipPopover>
        </div>
        <div className="chat-top-actions">
          <Badge tone={running ? 'amber' : 'neutral'} dot>
            {running ? `${running} working` : 'Idle'}
          </Badge>
          {engine.command && (
            <Button variant="subtle" size="sm" icon={<TerminalSquare size={12} />} onClick={launchCli} testId="launch-agent-cli">
              Launch {engine.label}
            </Button>
          )}
          <IconButton label="Agent settings" onClick={() => setEditing(true)}>
            <Settings2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="chat-tabs">
        {chats.map((chat) => (
          <button
            type="button"
            key={chat.id}
            className={`chat-tab ${chat.id === selected?.id ? 'active' : ''}`}
            onClick={() => patchUi({ selectedChatId: chat.id })}
            data-testid={`chat-tab-${chat.id}`}
          >
            <span>{chat.title}</span>
            <span
              className="tab-close"
              role="button"
              aria-label="Close chat"
              onClick={(event) => {
                event.stopPropagation();
                if (state.chats.length <= 1) {
                  notify('Keep one conversation', 'Create another chat before closing this one.', 'warning');
                  return;
                }
                const remaining = chats.filter((c) => c.id !== chat.id);
                deleteChat(chat.id);
                if (selected?.id === chat.id) patchUi({ selectedChatId: remaining[0]?.id || null });
              }}
            >
              <X size={11} />
            </span>
          </button>
        ))}
        <IconButton label="New chat" onClick={newChat} data-testid="new-chat">
          <Plus size={14} />
        </IconButton>
        <span className="spacer" />
        {selected && (
          <IconButton
            label="Delete conversation"
            onClick={() => {
              if (state.chats.length <= 1) {
                notify('Keep one conversation', 'Create another chat before deleting this one.', 'warning');
                return;
              }
              deleteChat(selected.id);
              const remaining = chats.filter((c) => c.id !== selected.id);
              patchUi({ selectedChatId: remaining[0]?.id || null });
            }}
          >
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>

      <div className="chat-body">
        {selected ? (
          <ChatPanel chat={selected} agent={agent} />
        ) : (
          <div className="chat-empty">
            <h1>No conversation selected</h1>
            <p>Pick a tab or start a new chat with {agent.name}.</p>
          </div>
        )}
      </div>
      {editing && <AgentModal agent={agent} onClose={() => setEditing(false)} />}
    </div>
  );
}
