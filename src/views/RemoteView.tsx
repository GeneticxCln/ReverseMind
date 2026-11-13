import { disposeTerminal } from '../components/panes/TerminalPane';
import React, { useState } from 'react';
import { FolderGit2, Plus, Server, ShieldCheck, TerminalSquare, Trash2, Wifi } from 'lucide-react';
import { useStore } from '../store';
import type { Workspace } from '../types';
import { Badge, Button, EmptyState, IconButton } from '../components/ui';
import { WorkspaceModal } from '../components/Modals';

export function RemoteView() {
  const { state, setState, patchUi, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; output: string }>>({});

  const open = (workspace: Workspace) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) => (w.id === workspace.id ? { ...w, lastOpenedAt: Date.now() } : w)),
    }));
    patchUi({ selectedWorkspaceId: workspace.id, mode: 'code', view: 'workspace' });
  };

  const test = async (workspace: Workspace) => {
    if (!workspace.ssh) return;
    setTesting(workspace.id);
    try {
      const result = await window.rm.ssh.probe(workspace.ssh);
      setResults((prev) => ({ ...prev, [workspace.id]: result }));
      toast(result.ok ? 'SSH connection works' : 'SSH connection failed', workspace.name, result.ok ? 'success' : 'error');
    } catch (error) {
      const output = String((error as Error)?.message || error);
      setResults((prev) => ({ ...prev, [workspace.id]: { ok: false, output } }));
      toast('SSH connection failed', output, 'error');
    } finally {
      setTesting(null);
    }
  };

  const remove = (workspace: Workspace) => {
    state.layouts
      .find((l) => l.workspaceId === workspace.id)
      ?.panes.filter((pane) => pane.type === 'terminal')
      .forEach((pane) => disposeTerminal(pane.id));
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.filter((w) => w.id !== workspace.id),
      layouts: prev.layouts.filter((l) => l.workspaceId !== workspace.id),
      ui: { ...prev.ui, selectedWorkspaceId: prev.ui.selectedWorkspaceId === workspace.id ? null : prev.ui.selectedWorkspaceId },
    }));
    toast('Workspace removed', workspace.name, 'info');
  };

  const remote = state.workspaces.filter((workspace) => workspace.kind === 'ssh');
  const local = state.workspaces.filter((workspace) => workspace.kind === 'local');

  return (
    <div className="page" data-testid="remote-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Remote workspaces</h1>
          <p>Connect to a machine over SSH. Agents and CLIs run where the code lives.</p>
        </div>
        <div className="page-head-actions">
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)} testId="add-remote">
            Add remote workspace
          </Button>
        </div>
      </div>
      <div className="page-body narrow">
        <div className="page-section">
          <h2>SSH machines</h2>
          <p className="section-note">Uses the SSH keys already configured for your user. ReverseMind stores the host and path, never a password.</p>
          {remote.length === 0 ? (
            <EmptyState
              icon={<Server size={28} />}
              title="No remote workspaces yet"
              description="Add a host, user and remote project path. You can verify the connection before saving."
              actions={
                <Button variant="primary" icon={<Plus size={13} />} onClick={() => setAdding(true)}>
                  Add a machine
                </Button>
              }
            />
          ) : (
            <div className="remote-grid">
              {remote.map((workspace) => (
                <div className="remote-card" key={workspace.id} data-testid={`remote-workspace-${workspace.id}`}>
                  <div className="remote-card-head">
                    <span className="remote-icon">
                      <Server size={18} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <b>{workspace.name}</b>
                      <span className="mono">
                        {workspace.ssh?.user}@{workspace.ssh?.host}:{workspace.ssh?.port || 22}
                      </span>
                    </div>
                    <span className="spacer" />
                    <Badge tone="cyan">SSH</Badge>
                  </div>
                  <div className="remote-path">
                    <FolderGit2 size={12} /> <span className="mono">{workspace.ssh?.path}</span>
                  </div>
                  {results[workspace.id] && (
                    <pre className={`tool-output ${results[workspace.id].ok ? '' : 'tool-error'}`} data-testid={`remote-result-${workspace.id}`}>
                      {results[workspace.id].output || (results[workspace.id].ok ? 'Connection succeeded' : 'Connection failed')}
                    </pre>
                  )}
                  <div className="remote-card-foot">
                    <Button variant="primary" size="sm" icon={<TerminalSquare size={12} />} onClick={() => open(workspace)} data-testid={`remote-open-${workspace.id}`}>
                      Open
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      icon={<Wifi size={12} />}
                      onClick={() => void test(workspace)}
                      disabled={testing === workspace.id}
                      testId={`remote-test-${workspace.id}`}
                    >
                      {testing === workspace.id ? 'Testing…' : 'Test'}
                    </Button>
                    <span className="spacer" />
                    <IconButton label="Remove remote workspace" onClick={() => remove(workspace)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-section">
          <h2>Local workspaces</h2>
          <div className="list-stack">
            {local.map((workspace) => (
              <div className="list-row" key={workspace.id}>
                <span className="tile-icon" style={{ width: 30, height: 30 }}>
                  <FolderGit2 size={15} />
                </span>
                <div className="list-row-main">
                  <div className="list-row-title">{workspace.name}</div>
                  <div className="list-row-sub mono">{workspace.path}</div>
                </div>
                <div className="list-row-actions">
                  <Badge>{workspace.isGit ? 'Git' : 'Folder'}</Badge>
                  <Button variant="subtle" size="sm" onClick={() => open(workspace)}>
                    Open
                  </Button>
                </div>
              </div>
            ))}
            {local.length === 0 && (
              <div className="hint-box">No local workspaces yet. Create one from Code mode.</div>
            )}
          </div>
        </div>

        <div className="hint-box">
          <ShieldCheck size={12} /> A remote workspace opens a real SSH terminal. Files, Git review and agents stay
          disabled here by design until you launch an agent session on the remote host — this keeps remote paths from
          being mistaken for local ones. Use the workspace to start Claude Code, Codex or any local CLI on that machine.
        </div>
      </div>
      {adding && <WorkspaceModal initialTab="ssh" onClose={() => setAdding(false)} />}
    </div>
  );
}
