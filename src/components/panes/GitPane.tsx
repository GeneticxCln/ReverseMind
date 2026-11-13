import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleDot,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  History,
  Minus,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { Pane, Workspace } from '../../types';
import { useStore } from '../../store';
import { ConfirmDialog, IconButton, Spinner } from '../ui';

interface GitFile {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  untracked: boolean;
}

interface GitStatus {
  isRepo: boolean;
  branch: string;
  files: GitFile[];
  ahead: number;
  behind: number;
  error?: string;
}

interface LogEntry {
  hash: string;
  subject: string;
  date: string;
  author: string;
}

interface Worktree {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

export function GitPane({
  pane,
  workspace,
  onOpenFile,
  onOpenTerminal,
  onNewWorktree,
}: {
  pane: Pane;
  workspace: Workspace;
  onOpenFile: (path: string) => void;
  onOpenTerminal?: () => void;
  onNewWorktree?: () => void;
}) {
  const { toast, state, setState } = useStore();
  const [tab, setTab] = useState<'changes' | 'history' | 'worktrees'>('changes');
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (workspace.kind === 'ssh') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [nextStatus, nextLog, nextBranches, nextWorktrees] = await Promise.all([
        window.rm.git.status(workspace.path),
        window.rm.git.log(workspace.path),
        window.rm.git.branches(workspace.path),
        window.rm.git.worktrees(workspace.path),
      ]);
      setStatus(nextStatus);
      setLog(nextLog);
      setBranches(nextBranches.branches);
      setCurrent(nextBranches.current);
      setWorktrees(nextWorktrees);
      setState((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((w) => (w.id === workspace.id ? { ...w, isGit: nextStatus.isRepo } : w)),
      }));
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, [setState, workspace.id, workspace.kind, workspace.path]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDiff = async (file: GitFile) => {
    setSelected(file.path);
    if (file.untracked) {
      try {
        const result = await window.rm.fs.read(workspace.path, file.path);
        setDiff((result.content as string).split('\n').map((line: string) => `+${line}`).join('\n'));
      } catch (err) {
        setDiff(String((err as Error)?.message || err));
      }
      return;
    }
    try {
      setDiff(await window.rm.git.diff(workspace.path, file.path, file.staged));
    } catch (err) {
      setDiff(String((err as Error)?.message || err));
    }
  };

  const act = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (success) toast('Git', success, 'success');
    } catch (err) {
      toast('Git action failed', String((err as Error)?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!message.trim()) {
      toast('Commit message required', 'Describe the change before committing.', 'warning');
      return;
    }
    setBusy(true);
    try {
      await window.rm.git.stage(workspace.path, '.');
      const result = await window.rm.git.commit(workspace.path, message.trim());
      if (!result.ok) throw new Error(result.output || 'Commit failed');
      setMessage('');
      setSelected(null);
      setDiff('');
      await load();
      toast('Committed', result.output.split('\n')[0] || 'Changes committed', 'success');
    } catch (err) {
      toast('Commit failed', String((err as Error)?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (branch: string) => {
    setBusy(true);
    try {
      const result = await window.rm.git.checkout(workspace.path, branch);
      if (!result.ok) throw new Error(result.output);
      await load();
      toast('Branch switched', branch, 'success');
    } catch (err) {
      toast('Checkout failed', String((err as Error)?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const initRepo = async () => {
    setBusy(true);
    try {
      await window.rm.shell.run(workspace.path, 'git init && git add -A && git -c user.email=agent@reversemind.local -c user.name=ReverseMind commit -m "Initial commit" || true');
      await load();
      toast('Repository ready', 'Git initialized in this workspace.', 'success');
    } catch (err) {
      toast('Could not initialize Git', String((err as Error)?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (workspace.kind === 'ssh') {
    return (
      <div className="git-pane" data-testid="git-pane">
        <div className="git-branch-row">
          <Server size={12} />
          <span className="branch-name">Remote workspace</span>
          <span className="spacer" style={{ flex: 1 }} />
          {onOpenTerminal && (
            <button type="button" className="button button-subtle button-sm" onClick={onOpenTerminal}>
              SSH terminal
            </button>
          )}
        </div>
        <div className="git-empty">
          Git actions for remote workspaces run inside the SSH terminal. Launch an agent there or open the terminal to
          review changes.
        </div>
      </div>
    );
  }

  return (
    <div className="git-pane" data-testid="git-pane">
      {discarding && (
        <ConfirmDialog
          title="Discard changes?"
          message={<><b className="mono">{discarding}</b> will be reverted to the last commit, or deleted if it is new. This cannot be undone.</>}
          confirmLabel="Discard"
          danger
          onConfirm={() => void act(() => window.rm.git.discard(workspace.path, discarding), `Discarded ${discarding}`)}
          onClose={() => setDiscarding(null)}
        />
      )}
      <div className="git-tabs">
        <button type="button" className={`git-tab ${tab === 'changes' ? 'active' : ''}`} onClick={() => setTab('changes')}>
          <CircleDot size={10} /> Changes
          {status?.files.length ? <span className="tab-count">{status.files.length}</span> : null}
        </button>
        <button type="button" className={`git-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <History size={10} /> History
        </button>
        <button type="button" className={`git-tab ${tab === 'worktrees' ? 'active' : ''}`} onClick={() => setTab('worktrees')}>
          <GitFork size={10} /> Worktrees
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        <IconButton label="Refresh Git" onClick={() => void load()}>
          <RefreshCw size={12} />
        </IconButton>
      </div>

      {loading && (
        <div className="git-empty">
          <Spinner size={13} /> Reading repository…
        </div>
      )}
      {!loading && error && <div className="danger-box" style={{ margin: 8 }}>{error}</div>}
      {!loading && !error && status && !status.isRepo && (
        <div className="git-empty" data-testid="git-not-repo">
          <GitBranch size={20} />
          <p>This workspace is not a Git repository yet.</p>
          <button type="button" className="button button-primary button-sm" onClick={() => void initRepo()} disabled={busy}>
            Initialize Git repository
          </button>
        </div>
      )}

      {!loading && status?.isRepo && (
        <>
          <div className="git-branch-row">
            <GitBranch size={11} />
            <select
              className="bare-select branch-name"
              value={current}
              onChange={(e) => void checkout(e.target.value)}
              aria-label="Current branch"
              data-testid="git-branch"
            >
              {Array.from(new Set([current, ...branches])).filter(Boolean).map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            {status.ahead > 0 && <span>↑{status.ahead}</span>}
            {status.behind > 0 && <span>↓{status.behind}</span>}
            <span className="spacer" style={{ flex: 1 }} />
            <span>{status.files.length} changes</span>
          </div>

          {tab === 'changes' && (
            <>
              <div className="git-content">
                {status.files.length === 0 && <div className="git-empty">Working tree clean. Nothing to review.</div>}
                {status.files.map((file) => (
                  <div
                    key={file.path}
                    className={`git-file ${selected === file.path ? 'selected' : ''}`}
                    onClick={() => void loadDiff(file)}
                    data-testid={`git-file-${file.path}`}
                  >
                    <span className={`git-status-letter ${file.untracked ? '??' : file.worktree !== ' ' ? file.worktree : file.index}`}>
                      {file.untracked ? '?' : file.worktree !== ' ' ? file.worktree : file.index}
                    </span>
                    <span className="git-path" title={file.path}>
                      {file.path}
                    </span>
                    <span className="git-file-actions" onClick={(e) => e.stopPropagation()}>
                      {file.staged ? (
                        <IconButton
                          label="Unstage file"
                          onClick={() => void act(() => window.rm.git.unstage(workspace.path, file.path), `Unstaged ${file.path}`)}
                        >
                          <Minus size={11} />
                        </IconButton>
                      ) : (
                        <IconButton
                          label="Stage file"
                          onClick={() => void act(() => window.rm.git.stage(workspace.path, file.path), `Staged ${file.path}`)}
                        >
                          <Plus size={11} />
                        </IconButton>
                      )}
                      <IconButton
                        label="Discard changes"
                        onClick={() => setDiscarding(file.path)}
                      >
                        <Undo2 size={11} />
                      </IconButton>
                      <IconButton label="Open file" onClick={() => onOpenFile(file.path)}>
                        <ArrowUpFromLine size={11} />
                      </IconButton>
                    </span>
                  </div>
                ))}
                {selected && diff && (
                  <div className="git-diff" data-testid="git-diff">
                    {diff.split('\n').map((line, index) => (
                      <div
                        key={index}
                        className={`git-diff-line ${line.startsWith('+') && !line.startsWith('+++') ? 'add' : ''} ${
                          line.startsWith('-') && !line.startsWith('---') ? 'del' : ''
                        } ${line.startsWith('@@') ? 'hunk' : ''}`}
                      >
                        {line || ' '}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="git-commit-box">
                <textarea
                  value={message}
                  placeholder="Commit message"
                  data-testid="git-commit-message"
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void commit();
                  }}
                />
                <div className="git-commit-row">
                  <button
                    type="button"
                    className="button button-subtle button-sm"
                    onClick={() => void act(() => window.rm.git.stage(workspace.path, '.'), 'Staged all changes')}
                    disabled={busy || status.files.length === 0}
                  >
                    <Plus size={11} /> Stage all
                  </button>
                  <span className="spacer" />
                  <span className="faint" style={{ fontSize: 9 }}>
                    {status.files.filter((f) => f.staged).length} staged
                  </span>
                  <button
                    type="button"
                    className="button button-primary button-sm"
                    onClick={() => void commit()}
                    disabled={busy || !message.trim()}
                    data-testid="git-commit-button"
                  >
                    <GitCommitHorizontal size={11} /> Commit
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="git-content" data-testid="git-history">
              {log.length === 0 && <div className="git-empty">No commits yet.</div>}
              {log.map((entry) => (
                <div className="git-log-row" key={entry.hash}>
                  <div className="git-log-hash">{entry.hash.slice(0, 8)}</div>
                  <div className="git-log-subject">{entry.subject}</div>
                  <div className="git-log-meta">
                    {entry.author} · {entry.date}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'worktrees' && (
            <div className="git-content" data-testid="git-worktrees">
              <div className="git-add-row">
                <button type="button" className="button button-subtle button-sm" onClick={onNewWorktree}>
                  <Plus size={11} /> New worktree
                </button>
                <span className="spacer" style={{ flex: 1 }} />
                <IconButton label="Refresh worktrees" onClick={() => void load()}>
                  <RefreshCw size={12} />
                </IconButton>
              </div>
              {worktrees.map((worktree) => (
                <div className="worktree-card" key={worktree.path}>
                  <b>{worktree.branch}</b>
                  <span>{worktree.path}</span>
                  <span>{worktree.head.slice(0, 10)}</span>
                </div>
              ))}
              {worktrees.length === 0 && <div className="git-empty">No worktrees. Create one to work on a branch in parallel.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
