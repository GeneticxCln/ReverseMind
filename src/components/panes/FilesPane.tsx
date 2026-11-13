import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';
import type { Pane, Workspace } from '../../types';
import { useStore } from '../../store';
import { ConfirmDialog, IconButton, Spinner } from '../ui';
import { formatBytes } from '../../agent';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export function FilesPane({
  pane,
  workspace,
  onOpenFile,
  onOpenTerminal,
}: {
  pane: Pane;
  workspace: Workspace;
  onOpenFile: (path: string) => void;
  onOpenTerminal?: () => void;
}) {
  const { toast } = useStore();
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<string>(pane.filePath || '');
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (workspace.kind === 'ssh') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.rm.fs.tree(workspace.path);
      setEntries(result.entries);
      setTruncated(!!result.truncated);
      setExpanded((prev) => {
        if (prev.size) return prev;
        const next = new Set<string>();
        (result.entries as FileNode[]).filter((node) => node.type === 'directory').forEach((node) => next.add(node.path));
        return next;
      });
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, [workspace.kind, workspace.path]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    let files = 0;
    let folders = 0;
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'directory') {
          folders += 1;
          if (node.children) walk(node.children);
        } else files += 1;
      }
    };
    walk(entries);
    return { files, folders };
  }, [entries]);

  const search = async () => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const result = await window.rm.fs.search(workspace.path, query.trim());
      setHits(result);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!newName.trim()) {
      setCreating(null);
      return;
    }
    const path = newName.trim();
    try {
      if (creating === 'file') {
        await window.rm.fs.write(workspace.path, path, '');
      } else {
        await window.rm.fs.mkdir(workspace.path, path);
      }
      setCreating(null);
      setNewName('');
      await load();
      if (creating === 'file') {
        setSelected(path);
        onOpenFile(path);
      }
      toast(creating === 'file' ? 'File created' : 'Folder created', path, 'success');
    } catch (err) {
      toast('Could not create', String((err as Error)?.message || err), 'error');
    }
  };

  const rename = async () => {
    const from = renaming;
    const to = renameTo.trim();
    if (!from || !to || to === from) {
      setRenaming(null);
      return;
    }
    try {
      await window.rm.fs.rename(workspace.path, from, to);
      setRenaming(null);
      setSelected(to);
      await load();
      toast('Renamed', `${from} → ${to}`, 'success');
    } catch (err) {
      toast('Could not rename', String((err as Error)?.message || err), 'error');
    }
  };

  const removeSelected = async (path: string) => {
    try {
      await window.rm.fs.delete(workspace.path, path);
      setSelected('');
      await load();
      toast('Deleted', path, 'success');
    } catch (err) {
      toast('Could not delete', String((err as Error)?.message || err), 'error');
    }
  };

  const open = (node: FileNode) => {
    if (node.type === 'directory') {
      setSelected(node.path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
        return next;
      });
    } else {
      setSelected(node.path);
      onOpenFile(node.path);
    }
  };

  const renderNode = (node: FileNode, depth = 0) => {
    const isOpen = expanded.has(node.path);
    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <button
            type="button"
            className="tree-row"
            style={{ paddingLeft: 8 + depth * 13 }}
            onClick={() => open(node)}
            data-testid={`folder-${node.path}`}
          >
            {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {isOpen ? <FolderOpen size={13} className="tree-icon folder" /> : <Folder size={13} className="tree-icon folder" />}
            <span className="tree-name">{node.name}</span>
            {!isOpen && node.children && <span className="tree-size">{node.children.length}</span>}
          </button>
          {isOpen && node.children?.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }
    return (
      <button
        type="button"
        key={node.path}
        className={`tree-row ${selected === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: 22 + depth * 13 }}
        onClick={() => open(node)}
        data-testid={`file-${node.path}`}
      >
        <File size={12} className="tree-icon" />
        <span className="tree-name">{node.name}</span>
        <span className="tree-size">{node.size ? formatBytes(node.size) : ''}</span>
      </button>
    );
  };

  if (workspace.kind === 'ssh') {
    return (
      <div className="files-pane" data-testid="files-pane">
        <div className="files-toolbar">
          <Server size={13} />
          <span className="mono small">{workspace.ssh?.user}@{workspace.ssh?.host}</span>
          <span className="spacer" />
          {onOpenTerminal && (
            <button type="button" className="button button-subtle button-sm" onClick={onOpenTerminal}>
              Open SSH terminal
            </button>
          )}
        </div>
        <div className="file-preview">
          <div className="empty-state compact">
            <Server size={22} />
            <h3>Remote workspace</h3>
            <p>
              {workspace.ssh?.user}@{workspace.ssh?.host}:{workspace.ssh?.path}
            </p>
            <p className="faint small">
              Files live on the remote machine. Use an SSH terminal or launch a coding agent there. Local file actions are
              intentionally disabled for remote workspaces.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="files-pane" data-testid="files-pane">
      <div className="files-toolbar">
        <div className="search-row" style={{ flex: 1 }}>
          <Search size={12} />
          <input
            value={query}
            placeholder="Search in workspace…"
            data-testid="files-search"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
              if (e.key === 'Escape') {
                setQuery('');
                setHits([]);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setHits([]);
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
        <IconButton label="New file" onClick={() => { setCreating('file'); setNewName(''); }}>
          <FilePlus2 size={13} />
        </IconButton>
        <IconButton label="New folder" onClick={() => { setCreating('folder'); setNewName(''); }}>
          <FolderPlus size={13} />
        </IconButton>
        <IconButton label="Rename selected" disabled={!selected} onClick={() => { setRenaming(selected); setRenameTo(selected); setCreating(null); }}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label="Delete selected" disabled={!selected} onClick={() => setDeleting(selected)}>
          <Trash2 size={13} />
        </IconButton>
        <IconButton label="Refresh files" onClick={() => void load()}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
      {renaming && (
        <div className="files-toolbar" style={{ borderTop: 0 }}>
          <span className="faint small">Rename to</span>
          <input
            className="input"
            autoFocus
            value={renameTo}
            data-testid="files-rename-to"
            onChange={(e) => setRenameTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
          <button type="button" className="button button-primary button-sm" onClick={() => void rename()} data-testid="files-rename-confirm">
            Rename
          </button>
          <button type="button" className="button button-ghost button-sm" onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete from workspace?"
          message={<><b className="mono">{deleting}</b> will be deleted from disk. This cannot be undone.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => void removeSelected(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {creating && (
        <div className="files-toolbar" style={{ borderTop: 0 }}>
          <span className="faint small">{creating === 'file' ? 'New file path' : 'New folder path'}</span>
          <input
            className="input"
            autoFocus
            value={newName}
            placeholder={creating === 'file' ? 'src/example.ts' : 'src/components'}
            data-testid="files-new-name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
              if (e.key === 'Escape') setCreating(null);
            }}
          />
          <button type="button" className="button button-primary button-sm" onClick={() => void create()} data-testid="files-new-create">
            Create
          </button>
          <button type="button" className="button button-ghost button-sm" onClick={() => setCreating(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="file-tree" data-testid="file-tree">
        {loading && (
          <div className="faint small" style={{ padding: 10 }}>
            <Spinner size={12} /> Loading workspace…
          </div>
        )}
        {!loading && hits.length > 0 && (
          <div className="search-hits">
            <div className="rail-group-label">Search results · {hits.length}</div>
            {hits.map((hit, index) => (
              <button
                type="button"
                className="search-hit"
                key={`${hit.path}-${hit.line}-${index}`}
                onClick={() => {
                  setSelected(hit.path);
                  onOpenFile(hit.path);
                }}
              >
                <span className="mono small">{hit.path}:{hit.line}</span>
                <span>{hit.preview}</span>
              </button>
            ))}
          </div>
        )}
        {!loading && entries.length === 0 && !error && (
          <div className="empty-state compact">
            <Folder size={20} />
            <h3>Empty workspace</h3>
            <p>Create a file or pull a repo into this folder.</p>
          </div>
        )}
        {error && <div className="danger-box" style={{ margin: 10 }}>{error}</div>}
        {!loading && hits.length === 0 && entries.map((node) => renderNode(node))}
      </div>
      <div className="files-footer">
        <span>{counts.files} files</span>
        <span>·</span>
        <span>{counts.folders} folders</span>
        {truncated && <span title="Very large folder: the listing is capped">· list capped</span>}
        <span className="spacer" />
        <button
          type="button"
          className="tree-btn"
          title="Reveal workspace in file manager"
          onClick={() => window.rm.revealPath(workspace.path)}
        >
          <FolderOpen size={11} /> Reveal
        </button>
      </div>
    </div>
  );
}
