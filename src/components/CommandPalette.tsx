import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  Clock3,
  Command,
  FolderGit2,
  KanbanSquare,
  MessageSquare,
  Plug,
  Plus,
  Search,
  Server,
  Settings,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useStore } from '../store';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  kind: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNewWorkspace,
  onNewAgent,
}: {
  open: boolean;
  onClose: () => void;
  onNewWorkspace: () => void;
  onNewAgent: () => void;
}) {
  const { state, patchUi, createChat, toast } = useStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const go = (view: 'workspace' | 'tickets' | 'routines' | 'plugins' | 'skills' | 'prompts' | 'usage' | 'remote' | 'settings', mode?: 'agent' | 'code' | 'thread') =>
      () => {
        patchUi({ view, ...(mode ? { mode } : {}) });
        onClose();
      };

    list.push(
      { id: 'mode-agent', label: 'Switch to Agent mode', kind: 'Mode', icon: <Bot size={15} />, run: go('workspace', 'agent') },
      { id: 'mode-code', label: 'Switch to Code mode', kind: 'Mode', icon: <FolderGit2 size={15} />, run: go('workspace', 'code') },
      { id: 'mode-thread', label: 'Switch to Thread mode', kind: 'Mode', icon: <MessageSquare size={15} />, run: go('workspace', 'thread') },
      { id: 'page-tickets', label: 'Open Tickets', kind: 'Page', icon: <KanbanSquare size={15} />, run: go('tickets') },
      { id: 'page-routines', label: 'Open Routines', kind: 'Page', icon: <Clock3 size={15} />, run: go('routines') },
      { id: 'page-plugins', label: 'Open Plugins & MCP', kind: 'Page', icon: <Plug size={15} />, run: go('plugins') },
      { id: 'page-skills', label: 'Open Skills', kind: 'Page', icon: <Sparkles size={15} />, run: go('skills') },
      { id: 'page-prompts', label: 'Open Prompt library', kind: 'Page', icon: <BookOpen size={15} />, run: go('prompts') },
      { id: 'page-usage', label: 'Open Usage metering', kind: 'Page', icon: <BarChart3 size={15} />, run: go('usage') },
      { id: 'page-remote', label: 'Open Remote workspaces', kind: 'Page', icon: <Server size={15} />, run: go('remote') },
      { id: 'page-settings', label: 'Open Settings', kind: 'Page', icon: <Settings size={15} />, run: () => { patchUi({ view: 'settings', settingsTab: 'general' }); onClose(); } },
      {
        id: 'action-workspace',
        label: 'New workspace…',
        kind: 'Action',
        icon: <Plus size={15} />,
        run: () => {
          onClose();
          onNewWorkspace();
        },
      },
      {
        id: 'action-agent',
        label: 'New agent…',
        kind: 'Action',
        icon: <Plus size={15} />,
        run: () => {
          onClose();
          onNewAgent();
        },
      }
    );

    for (const agent of state.agents) {
      list.push({
        id: `agent-${agent.id}`,
        label: `Chat with ${agent.name}`,
        hint: agent.engine === 'reversemind' ? 'Local runtime' : agent.engine,
        kind: 'Agent',
        icon: <Bot size={15} />,
        run: () => {
          const chat = createChat(agent.id);
          patchUi({ view: 'workspace', mode: 'agent', selectedAgentId: agent.id, selectedChatId: chat.id });
          onClose();
        },
      });
    }

    for (const workspace of state.workspaces) {
      list.push({
        id: `workspace-${workspace.id}`,
        label: `Open ${workspace.name}`,
        hint: workspace.path,
        kind: workspace.kind === 'ssh' ? 'Remote' : 'Workspace',
        icon: <FolderGit2 size={15} />,
        run: () => {
          patchUi({ view: 'workspace', mode: 'code', selectedWorkspaceId: workspace.id });
          onClose();
        },
      });
    }

    for (const chat of [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)) {
      const agent = state.agents.find((a) => a.id === chat.agentId);
      list.push({
        id: `chat-${chat.id}`,
        label: chat.title,
        hint: agent ? `${agent.name} · ${chat.messages.length} messages` : `${chat.messages.length} messages`,
        kind: 'Conversation',
        icon: <MessageSquare size={15} />,
        run: () => {
          patchUi({
            view: 'workspace',
            mode: 'agent',
            selectedAgentId: chat.agentId,
            selectedChatId: chat.id,
            selectedWorkspaceId: chat.workspaceId || state.ui.selectedWorkspaceId,
          });
          onClose();
        },
      });
    }

    for (const prompt of state.prompts) {
      list.push({
        id: `prompt-${prompt.id}`,
        label: `Insert prompt: ${prompt.title}`,
        hint: prompt.tags.join(', '),
        kind: 'Prompt',
        icon: <BookOpen size={15} />,
        run: () => {
          window.dispatchEvent(new CustomEvent('rm:composer-draft', { detail: { text: prompt.body } }));
          toast('Prompt inserted', prompt.title, 'success');
          onClose();
        },
      });
    }

    return list;
  }, [createChat, onClose, onNewAgent, onNewWorkspace, patchUi, state.agents, state.chats, state.prompts, state.ui.selectedWorkspaceId, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.hint || ''} ${item.kind}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const runAt = (index: number) => {
    const item = filtered[index];
    if (item) item.run();
  };

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      data-testid="command-palette"
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search pages, agents, workspaces, chats and actions…"
            aria-label="Search commands"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((prev) => Math.min(filtered.length - 1, prev + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((prev) => Math.max(0, prev - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runAt(selected);
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            data-testid="palette-input"
          />
          <span className="kbd">
            <Command size={9} />K
          </span>
        </div>
        <div className="palette-list">
          {filtered.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`palette-item ${index === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => runAt(index)}
              data-testid={`palette-item-${item.id}`}
            >
              {item.icon}
              <span className="palette-label">{item.label}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
              <span className="palette-kind">{item.kind}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="palette-empty">Nothing matches “{query}”.</div>}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span>
            <span className="kbd">Enter</span> open
          </span>
          <span>
            <span className="kbd">Esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
