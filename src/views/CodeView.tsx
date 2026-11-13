import React, { useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Code2,
  FileText,
  FolderGit2,
  FolderTree,
  GitBranch,
  Globe2,
  LayoutGrid,
  Plus,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { Pane, PaneType, Workspace } from '../types';
import { ENGINE_META } from '../types';
import { Badge, Button, EmptyState, IconButton, LogoMark } from '../components/ui';
import { WorkspaceModal, WorktreeModal } from '../components/Modals';
import { TerminalPane, disposeTerminal } from '../components/panes/TerminalPane';
import { EditorPane } from '../components/panes/EditorPane';
import { FilesPane } from '../components/panes/FilesPane';
import { GitPane } from '../components/panes/GitPane';
import { BrowserPane } from '../components/panes/BrowserPane';
import { ChatPane } from '../components/panes/ChatPane';
import { remoteCommand } from '../engines';

const LAUNCH_ENGINES = ['claude-code', 'codex', 'cursor', 'gemini', 'github-copilot', 'opencode', 'deepseek', 'grok', 'kimi', 'aider', 'terminal'];
const PANE_ICONS: Record<PaneType, React.ReactNode> = {
  chat: <Bot size={12} />,
  terminal: <TerminalSquare size={12} />,
  editor: <FileText size={12} />,
  files: <FolderTree size={12} />,
  git: <GitBranch size={12} />,
  browser: <Globe2 size={12} />,
};

export function CodeView() {
  const { state, setState, patchUi, createChat, toast, info } = useStore();
  const workspace = state.workspaces.find((w) => w.id === state.ui.selectedWorkspaceId) || null;
  const browserEnabled = state.plugins.find((plugin) => plugin.id === 'plugin-browser')?.enabled ?? true;
  const layout = state.layouts.find((l) => l.workspaceId === workspace?.id) || null;
  const panes = layout?.panes || [];
  const activePaneId = layout?.activePaneId || panes[0]?.id || null;
  const [workspaceModal, setWorkspaceModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);

  const updateLayout = (updater: (panes: Pane[], active: string | null) => { panes: Pane[]; activePaneId?: string | null }) => {
    if (!workspace) return;
    setState((prev) => {
      const existing = prev.layouts.find((l) => l.workspaceId === workspace.id);
      const currentPanes = existing?.panes || [];
      const currentActive = existing?.activePaneId || currentPanes[0]?.id || null;
      const next = updater(currentPanes, currentActive);
      const nextLayout = {
        workspaceId: workspace.id,
        panes: next.panes,
        activePaneId: next.activePaneId !== undefined ? next.activePaneId : currentActive,
      };
      return {
        ...prev,
        layouts: existing
          ? prev.layouts.map((l) => (l.workspaceId === workspace.id ? nextLayout : l))
          : [...prev.layouts, nextLayout],
      };
    });
  };

  const activate = (paneId: string) => updateLayout((list) => ({ panes: list, activePaneId: paneId }));

  const addPane = (type: PaneType, engine?: string) => {
    if (!workspace) return;
    if (type === 'browser' && !browserEnabled) {
      toast('Browser panes are disabled', 'Enable Browser Threads in Plugins to open a browser pane.', 'warning');
      setMenuOpen(false);
      return;
    }
    const id = crypto.randomUUID();
    let pane: Pane;
    if (type === 'chat') {
      if (workspace.kind === 'ssh') {
        toast('Agent chat is unavailable for SSH workspaces', 'Launch a CLI or terminal pane to work on the remote host.', 'warning');
        return;
      }
      const agent = state.agents.find((a) => a.id === state.ui.selectedAgentId) || state.agents[0];
      const chat = createChat(agent.id, { workspaceId: workspace.id, title: `${agent.name} · ${workspace.name}` });
      pane = { id, type, title: agent.name, chatId: chat.id, agentId: agent.id };
    } else if (type === 'terminal') {
      const meta = engine && engine !== 'terminal' ? ENGINE_META[engine] : null;
      const initialCommand =
        workspace.kind === 'ssh'
          ? remoteCommand(workspace, meta?.command)
          : meta?.command;
      pane = {
        id,
        type,
        title: meta ? meta.label : 'Terminal',
        engine: engine || 'terminal',
        initialCommand,
        cwd: workspace.path,
      };
    } else if (type === 'editor') {
      pane = { id, type, title: 'Editor', tabs: [] };
    } else if (type === 'files') {
      pane = { id, type, title: 'Files' };
    } else if (type === 'git') {
      pane = { id, type, title: 'Git' };
    } else {
      pane = { id, type, title: 'Browser', url: info?.browserHome || 'rm://home/' };
    }
    updateLayout((list) => ({ panes: [...list, pane], activePaneId: pane.id }));
    setMenuOpen(false);
    if (engine && engine !== 'terminal') {
      toast(`Launching ${ENGINE_META[engine]?.label || engine}`, workspace.kind === 'ssh' ? 'Starting a remote session over SSH.' : 'The CLI runs in a real terminal pane.', 'info');
    }
  };

  const closePane = (paneId: string) => {
    disposeTerminal(paneId);
    updateLayout((list) => {
      const remaining = list.filter((pane) => pane.id !== paneId);
      return { panes: remaining, activePaneId: remaining[remaining.length - 1]?.id || null };
    });
  };

  const updatePane = (paneId: string, patch: Partial<Pane>) => {
    updateLayout((list) => ({ panes: list.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)) }));
  };

  const openFile = (path: string) => {
    if (!workspace) return;
    const existing = panes.find((pane) => pane.type === 'editor');
    if (existing) {
      const tabs = existing.tabs && existing.tabs.length ? existing.tabs : existing.filePath ? [existing.filePath] : [];
      if (!tabs.includes(path)) tabs.push(path);
      updatePane(existing.id, { filePath: path, tabs, title: path.split('/').pop() });
      activate(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    updateLayout((list) => ({
      panes: [...list, { id, type: 'editor', title: path.split('/').pop() || 'Editor', filePath: path, tabs: [path] }],
      activePaneId: id,
    }));
  };

  const openTerminal = () => addPane('terminal');

  const chooseWorkspace = (id: string) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) => (w.id === id ? { ...w, lastOpenedAt: Date.now() } : w)),
    }));
    patchUi({ selectedWorkspaceId: id, view: 'workspace', mode: 'code' });
  };

  const resetLayout = () => {
    if (!workspace) return;
    updateLayout(() => ({ panes: [], activePaneId: null }));
  };

  const menu = useMemo(
    () =>
      menuOpen ? (
        <div className="pane-add-menu" data-testid="pane-add-menu">
          <div className="rail-group-label">Add a pane</div>
          {workspace?.kind !== 'ssh' && (
            <button type="button" onClick={() => addPane('chat')}>
              <Bot size={13} /> Agent chat
            </button>
          )}
          <button type="button" onClick={() => addPane('terminal')} data-testid="add-pane-terminal">
            <TerminalSquare size={13} /> Terminal
          </button>
          <button type="button" onClick={() => addPane('files')} data-testid="add-pane-files">
            <FolderTree size={13} /> Files
          </button>
          <button type="button" onClick={() => addPane('editor')} data-testid="add-pane-editor">
            <FileText size={13} /> Editor
          </button>
          <button type="button" onClick={() => addPane('git')} data-testid="add-pane-git">
            <GitBranch size={13} /> Git review
          </button>
          {browserEnabled && (
            <button type="button" onClick={() => addPane('browser')} data-testid="add-pane-browser">
              <Globe2 size={13} /> Browser
            </button>
          )}
        </div>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuOpen, workspace?.id, workspace?.kind, browserEnabled, panes.length]
  );

  if (!workspace) {
    return (
      <div className="code-view">
        <div className="code-toolbar">
          <span className="workspace-pill">
            <FolderGit2 size={13} /> No workspace
          </span>
          <span className="spacer" />
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setWorkspaceModal(true)} testId="new-workspace">
            New workspace
          </Button>
        </div>
        <div className="main-scroll">
          <div className="code-onboarding">
            <div className="hero-mark" style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
              <FolderGit2 size={26} />
            </div>
            <h2>Code mode starts with a workspace</h2>
            <p>Pick a folder to give agents a real repository. Files, terminals, diffs and browser threads stay scoped to it.</p>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setWorkspaceModal(true)}>
              Create a workspace
            </Button>
            {state.workspaces.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 26, width: 'min(460px, 100%)' }}>Recent workspaces</div>
                <div style={{ width: 'min(460px, 100%)', display: 'grid', gap: 6 }}>
                  {state.workspaces.map((item) => (
                    <button type="button" className="rail-item" key={item.id} onClick={() => chooseWorkspace(item.id)}>
                      <FolderGit2 size={15} />
                      <span className="rail-item-main">
                        <span className="rail-item-title">{item.name}</span>
                        <span className="rail-item-meta">{item.path}</span>
                      </span>
                      <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {workspaceModal && <WorkspaceModal onClose={() => setWorkspaceModal(false)} />}
      </div>
    );
  }

  return (
    <div className="code-view" data-testid="code-view">
      <div className="code-toolbar">
        <label className="workspace-pill" title={workspace.path}>
          <span className="dot" style={{ background: workspace.kind === 'ssh' ? 'var(--cyan)' : 'var(--green)' }} />
          <select
            className="bare-select"
            value={workspace.id}
            aria-label="Workspace"
            onChange={(e) => chooseWorkspace(e.target.value)}
            data-testid="code-workspace-select"
          >
            {state.workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={11} />
        </label>
        {workspace.isGit && (
          <span className="branch">
            <GitBranch size={11} /> git
          </span>
        )}
        {workspace.kind === 'ssh' && <Badge tone="cyan">SSH · {workspace.ssh?.host}</Badge>}
        <span className="spacer" />
        <div style={{ position: 'relative' }}>
          <Button variant="subtle" size="sm" icon={<Plus size={12} />} onClick={() => setMenuOpen((v) => !v)} testId="add-pane">
            Pane
          </Button>
          {menu}
        </div>
        {panes.length > 0 && (
          <IconButton label="Reset layout" onClick={resetLayout}>
            <LayoutGrid size={14} />
          </IconButton>
        )}
        <IconButton label="New workspace" onClick={() => setWorkspaceModal(true)}>
          <Plus size={14} />
        </IconButton>
      </div>

      {panes.length === 0 ? (
        <div className="pane-grid empty" data-testid="launch-screen">
          <div className="code-launch">
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 2 }}>
              <LogoMark size={42} />
            </div>
            <h2>Start building in {workspace.name}</h2>
            <p>
              {workspace.kind === 'ssh'
                ? 'Launch a coding CLI in a real terminal on the remote host.'
                : 'Launch a local agent or coding CLI. Everything runs in a real terminal inside this workspace.'}
            </p>
            <div className="launch-grid">
              {workspace.kind !== 'ssh' && (
                <button type="button" className="launch-card" onClick={() => addPane('chat')} data-testid="launch-agent">
                  <span className="engine-mark" style={{ background: 'linear-gradient(145deg,#8b5cf6,#0ea5e9)' }}>
                    <Sparkles size={13} />
                  </span>
                  ReverseMind Agent
                </button>
              )}
              {LAUNCH_ENGINES.map((engine) => {
                const meta = ENGINE_META[engine];
                return (
                  <button
                    type="button"
                    className="launch-card"
                    key={engine}
                    onClick={() => addPane('terminal', engine)}
                    data-testid={`launch-${engine}`}
                  >
                    <span className="engine-mark" style={{ background: meta.color }}>
                      {engine === 'terminal' ? <TerminalSquare size={12} /> : meta.label.slice(0, 2).toUpperCase()}
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <button type="button" className="launch-more" onClick={() => setMenuOpen(true)}>
              Launch more than one pane…
            </button>
          </div>
        </div>
      ) : (
        <div
          className="pane-grid"
          data-testid="pane-grid"
          style={{
            gridTemplateColumns: panes.length === 1 ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))',
            gridAutoRows: panes.length === 1 ? 'minmax(0,1fr)' : 'minmax(280px, 1fr)',
          }}
        >
          {panes.map((pane) => (
            <div
              className={`pane ${pane.id === activePaneId ? 'active' : ''}`}
              key={pane.id}
              onMouseDown={() => activate(pane.id)}
              data-testid={`pane-${pane.type}`}
            >
              <div className="pane-head">
                <div className="pane-title">
                  <span className="pane-dot" />
                  {PANE_ICONS[pane.type]}
                  {pane.title}
                </div>
                <div className="pane-head-actions">
                  <IconButton label="Close pane" onClick={() => closePane(pane.id)}>
                    <X size={12} />
                  </IconButton>
                </div>
              </div>
              <div className="pane-body">
                {pane.type === 'terminal' && <TerminalPane pane={pane} workspace={workspace} />}
                {pane.type === 'files' && (
                  <FilesPane pane={pane} workspace={workspace} onOpenFile={openFile} onOpenTerminal={openTerminal} />
                )}
                {pane.type === 'editor' && (
                  <EditorPane
                    pane={pane}
                    workspace={workspace}
                    onPathChange={(path) => updatePane(pane.id, { filePath: path, title: path.split('/').pop() || 'Editor' })}
                    onTabsChange={(tabs) => updatePane(pane.id, { tabs })}
                    onClosePane={() => closePane(pane.id)}
                  />
                )}
                {pane.type === 'git' && (
                  <GitPane
                    pane={pane}
                    workspace={workspace}
                    onOpenFile={openFile}
                    onOpenTerminal={openTerminal}
                    onNewWorktree={() => setWorktreeOpen(true)}
                  />
                )}
                {pane.type === 'browser' &&
                  (browserEnabled ? (
                    <BrowserPane pane={pane} workspace={workspace} />
                  ) : (
                    <div className="pane-empty" data-testid="browser-disabled">
                      <Globe2 size={18} />
                      <span>Browser panes are disabled. Enable Browser Threads in Plugins to use this pane.</span>
                    </div>
                  ))}
                {pane.type === 'chat' &&
                  (workspace.kind === 'ssh' ? (
                    <div className="pane-empty">
                      <Bot size={18} />
                      <span>Agent chat is disabled for SSH workspaces. Use a terminal pane to run a CLI on the remote host.</span>
                    </div>
                  ) : (
                    <ChatPane pane={pane} workspaceId={workspace.id} onChatChange={(chatId) => updatePane(pane.id, { chatId })} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {workspaceModal && <WorkspaceModal onClose={() => setWorkspaceModal(false)} />}
      {worktreeOpen && (
        <WorktreeModal workspace={workspace} onClose={() => setWorktreeOpen(false)} onCreated={() => toast('Worktree ready', 'Open it from the workspace switcher.', 'success')} />
      )}
    </div>
  );
}
