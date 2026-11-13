import { useMcpSync } from './mcpSync';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ChevronRight,
  Clock3,
  FolderGit2,
  KanbanSquare,
  LayoutGrid,
  MessageSquare,
  Minus,
  PanelLeft,
  Plug,
  Plus,
  Search,
  Server,
  Settings,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useStore } from './store';
import type { Agent, ChatThread, Mode, ViewName, Workspace } from './types';
import { ENGINE_META } from './types';
import { useRoutineRunner } from './agent';
import { AgentAvatar, Brand, IconButton, LogoMark, Spinner } from './components/ui';
import { AgentModal, WorkspaceModal } from './components/Modals';
import { CommandPalette } from './components/CommandPalette';
import { PromptDrawer } from './components/PromptDrawer';
import { NotificationsPopover } from './components/NotificationsPopover';
import { Toasts } from './components/Toasts';
import { AgentView } from './views/AgentView';
import { CodeView } from './views/CodeView';
import { ThreadView } from './views/ThreadView';
import { TicketsView } from './views/TicketsView';
import { RoutinesView } from './views/RoutinesView';
import { PluginsView } from './views/PluginsView';
import { SkillsView } from './views/SkillsView';
import { PromptsView } from './views/PromptsView';
import { UsageView } from './views/UsageView';
import { RemoteView } from './views/RemoteView';
import { SETTINGS_SECTIONS, SettingsView } from './views/SettingsView';

const MODES: { id: Mode; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'code', label: 'Code' },
  { id: 'thread', label: 'Thread' },
];

const DESTINATIONS: { id: ViewName; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'tickets', label: 'Tickets', description: 'Plan and dispatch work', icon: <KanbanSquare size={15} /> },
  { id: 'routines', label: 'Routines', description: 'Scheduled agent runs', icon: <Clock3 size={15} /> },
  { id: 'plugins', label: 'Plugins & MCP', description: 'Local capabilities', icon: <Plug size={15} /> },
  { id: 'skills', label: 'Skills', description: 'Reusable agent procedures', icon: <Sparkles size={15} /> },
  { id: 'prompts', label: 'Prompts', description: 'Your prompt library', icon: <BookOpen size={15} /> },
  { id: 'usage', label: 'Usage', description: 'Tokens and local metering', icon: <BarChart3 size={15} /> },
  { id: 'remote', label: 'Remote', description: 'SSH workspaces', icon: <Server size={15} /> },
  { id: 'settings', label: 'Settings', description: 'App and connection settings', icon: <Settings size={15} /> },
];

export default function App() {
  const {
    state,
    setState,
    patchUi,
    createChat,
    selectedAgent,
    info,
    loading,
    toast,
  } = useStore();
  useRoutineRunner({ schedule: true });
  useMcpSync();
  const [workspaceModal, setWorkspaceModal] = useState(false);
  const [agentModal, setAgentModal] = useState(false);
  const [destOpen, setDestOpen] = useState(false);

  const agent = selectedAgent();
  const workspace = state.workspaces.find((item) => item.id === state.ui.selectedWorkspaceId) || null;
  const unread = state.notifications.filter((notification) => !notification.read).length;

  const recentChats = useMemo(
    () => [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.chats]
  );
  const agentChats = useMemo(
    () => (agent ? recentChats.filter((chat) => chat.agentId === agent.id) : []),
    [agent, recentChats]
  );
  const pinnedAgents = state.agents.filter((item) => item.pinned);
  const unpinnedAgents = state.agents.filter((item) => !item.pinned);
  const pinnedWorkspaces = state.workspaces.filter((item) => item.pinned);
  const unpinnedWorkspaces = state.workspaces.filter((item) => !item.pinned);

  useEffect(() => {
    if (!state.ui.selectedAgentId && state.agents[0]) patchUi({ selectedAgentId: state.agents[0].id });
  }, [patchUi, state.agents, state.ui.selectedAgentId]);

  useEffect(() => {
    if (state.ui.selectedWorkspaceId && !state.workspaces.some((item) => item.id === state.ui.selectedWorkspaceId)) {
      patchUi({ selectedWorkspaceId: state.workspaces[0]?.id || null });
    }
  }, [patchUi, state.ui.selectedWorkspaceId, state.workspaces]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'k') {
        event.preventDefault();
        patchUi({ commandPaletteOpen: !state.ui.commandPaletteOpen, notificationsOpen: false });
        setDestOpen(false);
        return;
      }
      if (mod && key === 'n' && !event.shiftKey) {
        event.preventDefault();
        if (!agent) {
          setAgentModal(true);
          return;
        }
        const chat = createChat(agent.id);
        patchUi({ mode: state.ui.mode === 'thread' ? 'thread' : 'agent', view: 'workspace', selectedChatId: chat.id });
        return;
      }
      if (mod && key === 'n' && event.shiftKey) {
        event.preventDefault();
        setWorkspaceModal(true);
        return;
      }
      if (mod && key === '/') {
        event.preventDefault();
        patchUi({ promptsOpen: !state.ui.promptsOpen, notificationsOpen: false });
        setDestOpen(false);
        return;
      }
      if (mod && key === ',') {
        event.preventDefault();
        patchUi({ view: 'settings', settingsTab: 'general' });
        return;
      }
      if (event.key === 'Escape') {
        patchUi({ commandPaletteOpen: false, promptsOpen: false, notificationsOpen: false });
        setDestOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [agent, createChat, patchUi, state.ui.commandPaletteOpen, state.ui.mode, state.ui.promptsOpen, state.ui.selectedWorkspaceId]);

  const goMode = (mode: Mode) => {
    patchUi({ mode, view: 'workspace' });
    setDestOpen(false);
  };

  const go = (view: ViewName) => {
    patchUi({ view });
    setDestOpen(false);
  };

  const pickAgent = (agentId: string) => {
    const target = state.agents.find((item) => item.id === agentId);
    if (!target) return;
    const chat = recentChats.find((item) => item.agentId === agentId);
    patchUi({
      selectedAgentId: agentId,
      mode: 'agent',
      view: 'workspace',
      selectedChatId: chat?.id || null,
    });
  };

  const pickWorkspace = (workspaceId: string) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((item) =>
        item.id === workspaceId ? { ...item, lastOpenedAt: Date.now() } : item
      ),
    }));
    patchUi({ selectedWorkspaceId: workspaceId, mode: 'code', view: 'workspace' });
  };

  const pickThread = (chat: ChatThread) => {
    patchUi({
      selectedChatId: chat.id,
      selectedAgentId: chat.agentId,
      mode: 'thread',
      view: 'workspace',
    });
  };

  const startChat = () => {
    if (!agent) {
      setAgentModal(true);
      return;
    }
    const chat = createChat(agent.id);
    patchUi({ view: 'workspace', mode: state.ui.mode === 'thread' ? 'thread' : 'agent', selectedChatId: chat.id });
  };

  if (loading) {
    return (
      <div className="boot-screen" data-testid="boot-screen">
        <LogoMark size={52} />
        <div className="boot-brand">Reverse<span>Mind</span></div>
        <p>Loading your local workspace…</p>
        <Spinner size={18} />
      </div>
    );
  }

  const settingsOpen = state.ui.view === 'settings';

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="titlebar">
        <div className="titlebar-left">
          <Brand />
          <IconButton
            label={state.ui.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            active={!state.ui.sidebarVisible}
            onClick={() => patchUi({ sidebarVisible: !state.ui.sidebarVisible })}
            data-testid="toggle-sidebar"
          >
            <PanelLeft size={15} />
          </IconButton>
        </div>
        <div className="titlebar-center">
          <div className="mode-switch" role="tablist" aria-label="Workspace mode">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={state.ui.mode === mode.id && state.ui.view !== 'settings'}
                className={state.ui.mode === mode.id && !settingsOpen ? 'active' : ''}
                onClick={() => goMode(mode.id)}
                data-testid={`mode-${mode.id}`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <div className="titlebar-right">
          <IconButton
            label="Search and commands (Ctrl+K)"
            onClick={() => patchUi({ commandPaletteOpen: true, notificationsOpen: false, promptsOpen: false })}
            data-testid="open-palette"
          >
            <Search size={15} />
          </IconButton>
          <IconButton
            label="Prompt library"
            active={state.ui.promptsOpen}
            onClick={() => patchUi({ promptsOpen: !state.ui.promptsOpen, notificationsOpen: false })}
            data-testid="open-prompts"
          >
            <BookOpen size={15} />
          </IconButton>
          <button
            type="button"
            className={`icon-button titlebar-bell ${state.ui.notificationsOpen ? 'is-active' : ''}`}
            aria-label="Notifications"
            title="Notifications"
            onClick={() => patchUi({ notificationsOpen: !state.ui.notificationsOpen, promptsOpen: false })}
            data-testid="open-notifications"
          >
            <Bell size={15} />
            {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <IconButton
            label="Workspace tools"
            active={destOpen}
            onClick={() => {
              setDestOpen((value) => !value);
              patchUi({ notificationsOpen: false, promptsOpen: false });
            }}
            data-testid="open-destinations"
          >
            <LayoutGrid size={15} />
          </IconButton>
          <div className="window-controls">
            <button type="button" aria-label="Minimize" onClick={() => window.rm.window.control('minimize')}>
              <Minus size={14} />
            </button>
            <button type="button" aria-label="Maximize" onClick={() => window.rm.window.control('maximize')}>
              <Square size={11} />
            </button>
            <button type="button" className="close" aria-label="Close" onClick={() => window.rm.window.control('close')}>
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className={`rail ${state.ui.sidebarVisible ? '' : 'collapsed'}`} data-testid="sidebar">
          {settingsOpen ? (
            <>
              <div className="rail-head">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Back to app"
                  onClick={() => patchUi({ view: 'workspace' })}
                  data-testid="settings-back"
                >
                  <ArrowLeft size={15} />
                </button>
                <h2>Settings</h2>
                <span className="spacer" />
              </div>
              <div className="rail-scroll settings-rail">
                {SETTINGS_SECTIONS.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    className={`settings-nav-item ${state.ui.settingsTab === section.id ? 'active' : ''}`}
                    onClick={() => patchUi({ settingsTab: section.id })}
                    data-testid={`settings-tab-${section.id}`}
                  >
                    {section.icon}
                    {section.label}
                    {section.id === 'providers' && state.settings.providers.length > 0 && (
                      <span className="rail-count" style={{ marginLeft: 'auto' }}>{state.settings.providers.length}</span>
                    )}
                    {section.id === 'connections' && state.mcpServers.length > 0 && (
                      <span className="rail-count" style={{ marginLeft: 'auto' }}>{state.mcpServers.length}</span>
                    )}
                  </button>
                ))}
                <div className="settings-nav-sep" />
                <button type="button" className="settings-nav-item" onClick={() => patchUi({ view: 'workspace' })}>
                  <ArrowLeft size={14} /> Back to app
                </button>
              </div>
              <div className="rail-footer">
                <div className="credits-pill">
                  <span className="local-dot" />
                  <b>Local-first</b>
                  <span className="faint">no account</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rail-head">
                <h2>{state.ui.mode === 'agent' ? 'Agents' : state.ui.mode === 'code' ? 'Workspaces' : 'Threads'}</h2>
                <span className="rail-count">
                  {state.ui.mode === 'agent'
                    ? state.agents.length
                    : state.ui.mode === 'code'
                      ? state.workspaces.length
                      : state.chats.length}
                </span>
                <span className="spacer" />
                <div className="rail-head-actions">
                  {state.ui.mode === 'agent' && (
                    <IconButton label="New agent" onClick={() => setAgentModal(true)} data-testid="new-agent">
                      <Plus size={14} />
                    </IconButton>
                  )}
                  {state.ui.mode === 'code' && (
                    <IconButton label="New workspace" onClick={() => setWorkspaceModal(true)} data-testid="new-workspace-rail">
                      <Plus size={14} />
                    </IconButton>
                  )}
                  {state.ui.mode === 'thread' && (
                    <IconButton label="New thread" onClick={startChat} data-testid="new-thread-rail">
                      <MessageSquare size={14} />
                    </IconButton>
                  )}
                </div>
              </div>
              <div className="rail-scroll">
                {state.ui.mode === 'agent' && (
                  <>
                    <div className="rail-group">
                      <div className="rail-group-label">Pinned</div>
                      {pinnedAgents.map((item) => (
                        <AgentRailRow
                          key={item.id}
                          agent={item}
                          active={state.ui.mode === 'agent' && state.ui.selectedAgentId === item.id && state.ui.view === 'workspace'}
                          onClick={() => pickAgent(item.id)}
                        />
                      ))}
                      {pinnedAgents.length === 0 && <div className="rail-empty">Pin an agent to keep it close.</div>}
                    </div>
                    <div className="rail-group">
                      <div className="rail-group-label">All agents</div>
                      {unpinnedAgents.map((item) => (
                        <AgentRailRow
                          key={item.id}
                          agent={item}
                          active={state.ui.mode === 'agent' && state.ui.selectedAgentId === item.id && state.ui.view === 'workspace'}
                          onClick={() => pickAgent(item.id)}
                        />
                      ))}
                      {unpinnedAgents.length === 0 && pinnedAgents.length > 0 && (
                        <div className="rail-empty">All agents are pinned.</div>
                      )}
                      {state.agents.length === 0 && (
                        <div className="rail-empty">
                          Create an agent to start a conversation.
                          <div style={{ marginTop: 8 }}>
                            <button type="button" className="rail-create" onClick={() => setAgentModal(true)}>
                              <Plus size={12} /> New agent
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {agent && (
                      <div className="rail-group">
                        <div className="rail-group-label">
                          {agent.name} conversations
                          <span>{agentChats.length}</span>
                        </div>
                        {agentChats.slice(0, 8).map((chat) => (
                          <button
                            type="button"
                            className={`rail-item chat-rail-item ${chat.id === state.ui.selectedChatId ? 'active' : ''}`}
                            key={chat.id}
                            onClick={() => patchUi({ selectedChatId: chat.id, mode: 'agent', view: 'workspace' })}
                          >
                            <MessageSquare size={13} className="faint" />
                            <span className="rail-item-main">
                              <span className="rail-item-title">{chat.title}</span>
                              <span className="rail-item-meta">
                                {chat.messages.length} message{chat.messages.length === 1 ? '' : 's'} ·{' '}
                                {new Date(chat.updatedAt).toLocaleDateString()}
                              </span>
                            </span>
                            {chat.status === 'running' && <span className="running-dot" />}
                          </button>
                        ))}
                        {agentChats.length === 0 && <div className="rail-empty">No conversations yet.</div>}
                      </div>
                    )}
                  </>
                )}

                {state.ui.mode === 'code' && (
                  <>
                    <div className="rail-group">
                      <div className="rail-group-label">Pinned</div>
                      {pinnedWorkspaces.map((item) => (
                        <WorkspaceRailRow
                          key={item.id}
                          workspace={item}
                          active={state.ui.mode === 'code' && state.ui.selectedWorkspaceId === item.id && state.ui.view === 'workspace'}
                          onClick={() => pickWorkspace(item.id)}
                        />
                      ))}
                      {pinnedWorkspaces.length === 0 && <div className="rail-empty">Pin a folder to keep it here.</div>}
                    </div>
                    <div className="rail-group">
                      <div className="rail-group-label">Folders</div>
                      {unpinnedWorkspaces.map((item) => (
                        <WorkspaceRailRow
                          key={item.id}
                          workspace={item}
                          active={state.ui.mode === 'code' && state.ui.selectedWorkspaceId === item.id && state.ui.view === 'workspace'}
                          onClick={() => pickWorkspace(item.id)}
                        />
                      ))}
                      {state.workspaces.length === 0 && (
                        <div className="rail-empty">
                          A workspace gives agents a real repository for files, terminals and diffs.
                          <div style={{ marginTop: 8 }}>
                            <button type="button" className="rail-create" onClick={() => setWorkspaceModal(true)}>
                              <Plus size={12} /> New workspace
                            </button>
                          </div>
                        </div>
                      )}
                      {state.workspaces.length > 0 && unpinnedWorkspaces.length === 0 && pinnedWorkspaces.length > 0 && (
                        <div className="rail-empty">All workspaces are pinned.</div>
                      )}
                    </div>
                    <div className="rail-group">
                      <div className="rail-group-label">Remote</div>
                      <button
                        type="button"
                        className={`rail-item ${state.ui.view === 'remote' ? 'active' : ''}`}
                        onClick={() => go('remote')}
                      >
                        <Server size={14} />
                        <span className="rail-item-main">
                          <span className="rail-item-title">SSH machines</span>
                          <span className="rail-item-meta">
                            {state.workspaces.filter((item) => item.kind === 'ssh').length} connected workspace
                            {state.workspaces.filter((item) => item.kind === 'ssh').length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <ChevronRight size={12} className="faint" />
                      </button>
                    </div>
                  </>
                )}

                {state.ui.mode === 'thread' && (
                  <>
                    <div className="rail-group">
                      <div className="rail-group-label">Conversations</div>
                      {recentChats.slice(0, 16).map((chat) => {
                        const chatAgent = state.agents.find((item) => item.id === chat.agentId);
                        return (
                          <button
                            type="button"
                            className={`rail-item chat-rail-item ${chat.id === state.ui.selectedChatId && state.ui.view === 'workspace' ? 'active' : ''}`}
                            key={chat.id}
                            onClick={() => pickThread(chat)}
                          >
                            <AgentAvatar name={chatAgent?.name || 'RM'} color={chatAgent?.color || '#8b5cf6'} size={22} />
                            <span className="rail-item-main">
                              <span className="rail-item-title">{chat.title}</span>
                              <span className="rail-item-meta">
                                {chatAgent?.name || 'Agent'} · {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                            {chat.status === 'running' && <span className="running-dot" />}
                          </button>
                        );
                      })}
                      {recentChats.length === 0 && <div className="rail-empty">No conversations yet. Start one below.</div>}
                    </div>
                    <div className="rail-group">
                      <div className="rail-group-label">Start with</div>
                      {state.agents.map((item) => (
                        <button
                          type="button"
                          className="rail-item"
                          key={item.id}
                          onClick={() => {
                            const chat = createChat(item.id);
                            patchUi({ selectedChatId: chat.id, selectedAgentId: item.id, mode: 'thread', view: 'workspace' });
                          }}
                        >
                          <AgentAvatar name={item.name} color={item.color} size={22} />
                          <span className="rail-item-main">
                            <span className="rail-item-title">New thread · {item.name}</span>
                            <span className="rail-item-meta">{ENGINE_META[item.engine]?.label || item.engine}</span>
                          </span>
                          <Plus size={12} className="faint" />
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {state.ui.mode !== 'agent' && state.ui.mode !== 'code' && state.ui.mode !== 'thread' && (
                  <div className="rail-empty">Pick a mode to get started.</div>
                )}
              </div>
              <div className="rail-footer">
                <div className="credits-pill" title="Everything runs on this machine">
                  <span className="local-dot" />
                  <b>Local</b>
                  <span className="faint">{state.usage.length} calls</span>
                </div>
                <div className="rail-nav">
                  <IconButton
                    label="Tickets"
                    active={state.ui.view === 'tickets'}
                    onClick={() => go('tickets')}
                    data-testid="nav-tickets"
                  >
                    <KanbanSquare size={14} />
                  </IconButton>
                  <IconButton
                    label="Routines"
                    active={state.ui.view === 'routines'}
                    onClick={() => go('routines')}
                    data-testid="nav-routines"
                  >
                    <Clock3 size={14} />
                  </IconButton>
                  <IconButton
                    label="Usage"
                    active={state.ui.view === 'usage'}
                    onClick={() => go('usage')}
                    data-testid="nav-usage"
                  >
                    <BarChart3 size={14} />
                  </IconButton>
                  <IconButton
                    label="Settings"
                    active={settingsOpen}
                    onClick={() => patchUi({ view: 'settings', settingsTab: 'general' })}
                    data-testid="nav-settings"
                  >
                    <Settings size={14} />
                  </IconButton>
                </div>
              </div>
            </>
          )}
        </aside>

        <main className="main" data-testid="main-area">
          {state.ui.view === 'settings' && <SettingsView />}
          {state.ui.view === 'tickets' && <TicketsView />}
          {state.ui.view === 'routines' && <RoutinesView />}
          {state.ui.view === 'plugins' && <PluginsView />}
          {state.ui.view === 'skills' && <SkillsView />}
          {state.ui.view === 'prompts' && <PromptsView />}
          {state.ui.view === 'usage' && <UsageView />}
          {state.ui.view === 'remote' && <RemoteView />}
          {state.ui.view === 'workspace' && state.ui.mode === 'agent' && <AgentView />}
          {state.ui.view === 'workspace' && state.ui.mode === 'code' && <CodeView />}
          {state.ui.view === 'workspace' && state.ui.mode === 'thread' && <ThreadView />}
          <PromptDrawer open={state.ui.promptsOpen} onClose={() => patchUi({ promptsOpen: false })} />
        </main>
      </div>

      {destOpen && (
        <>
          <div className="popover-backdrop" onMouseDown={() => setDestOpen(false)} />
          <div className="popover dest-menu" data-testid="destinations-menu">
            <div className="popover-head">
              <LayoutGrid size={14} />
              <h3>Workspace tools</h3>
              <span className="spacer" />
              <IconButton label="Close menu" onClick={() => setDestOpen(false)}>
                <X size={14} />
              </IconButton>
            </div>
            <div className="popover-body">
              <div className="dest-grid">
                {DESTINATIONS.map((destination) => (
                  <button
                    type="button"
                    className={`dest-item ${state.ui.view === destination.id ? 'active' : ''}`}
                    key={destination.id}
                    onClick={() => go(destination.id)}
                    data-testid={`dest-${destination.id}`}
                  >
                    <span className="dest-icon">{destination.icon}</span>
                    <span className="dest-main">
                      <span className="dest-title">{destination.label}</span>
                      <span className="dest-desc">{destination.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="settings-nav-sep" />
              <div className="dest-actions">
                <button type="button" className="dest-action" onClick={() => { setDestOpen(false); setWorkspaceModal(true); }}>
                  <Plus size={14} /> New workspace
                </button>
                <button type="button" className="dest-action" onClick={() => { setDestOpen(false); setAgentModal(true); }}>
                  <Bot size={14} /> New agent
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <NotificationsPopover open={state.ui.notificationsOpen} onClose={() => patchUi({ notificationsOpen: false })} />
      <CommandPalette
        open={state.ui.commandPaletteOpen}
        onClose={() => patchUi({ commandPaletteOpen: false })}
        onNewWorkspace={() => setWorkspaceModal(true)}
        onNewAgent={() => setAgentModal(true)}
      />
      <Toasts />

      {workspaceModal && (
        <WorkspaceModal
          onClose={() => setWorkspaceModal(false)}
          onCreated={() => {
            /* the modal surfaces the created workspace toast */
          }}
        />
      )}
      {agentModal && <AgentModal onClose={() => setAgentModal(false)} />}
    </div>
  );
}

function AgentRailRow({
  agent,
  active,
  onClick,
}: {
  agent: Agent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rail-item ${active ? 'active' : ''}`}
      onClick={onClick}
      data-testid={`rail-agent-${agent.id}`}
    >
      <AgentAvatar name={agent.name} color={agent.color} size={27} status={agent.autopilot ? 'running' : 'online'} />
      <span className="rail-item-main">
        <span className="rail-item-title">{agent.name}</span>
        <span className="rail-item-meta">{ENGINE_META[agent.engine]?.label || agent.engine}</span>
      </span>
      {agent.autopilot && <span className="engine-chip engine-chip-mini">A</span>}
    </button>
  );
}

function WorkspaceRailRow({
  workspace,
  active,
  onClick,
}: {
  workspace: Workspace;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rail-item ${active ? 'active' : ''}`}
      onClick={onClick}
      title={workspace.path}
      data-testid={`rail-workspace-${workspace.id}`}
    >
      <FolderGit2 size={15} className={active ? '' : 'faint'} style={{ flex: '0 0 auto' }} />
      <span className="rail-item-main">
        <span className="rail-item-title">{workspace.name}</span>
        <span className="rail-item-meta">{workspace.kind === 'ssh' ? workspace.ssh?.host : workspace.path}</span>
      </span>
      {workspace.kind === 'ssh' ? <Server size={11} className="faint" /> : <span className="workspace-dot" style={{ background: workspace.color }} />}
    </button>
  );
}
