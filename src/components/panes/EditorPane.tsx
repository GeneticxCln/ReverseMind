import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileText, FolderOpen, RotateCcw, Save, X } from 'lucide-react';
import type { Pane, Workspace } from '../../types';
import { useStore } from '../../store';
import { IconButton, Spinner } from '../ui';

interface Buffer {
  value: string;
  original: string;
  binary?: boolean;
  loading?: boolean;
  error?: string;
}

const EXT_LANG: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  js: 'JavaScript',
  jsx: 'JavaScript React',
  json: 'JSON',
  md: 'Markdown',
  css: 'CSS',
  html: 'HTML',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  sh: 'Shell',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  txt: 'Text',
};

export function EditorPane({
  pane,
  workspace,
  onPathChange,
  onTabsChange,
  onClosePane,
}: {
  pane: Pane;
  workspace: Workspace;
  onPathChange: (path: string) => void;
  onTabsChange: (tabs: string[]) => void;
  onClosePane: () => void;
}) {
  const { state, toast } = useStore();
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [manualPath, setManualPath] = useState('');
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const active = pane.filePath || '';
  const tabs = pane.tabs && pane.tabs.length ? pane.tabs : active ? [active] : [];
  const buffer = buffers[active];

  const load = useCallback(
    async (path: string) => {
      if (!path) return;
      setBuffers((prev) => ({ ...prev, [path]: { value: '', original: '', loading: true } }));
      try {
        const result = await window.rm.fs.read(workspace.path, path);
        setBuffers((prev) => ({
          ...prev,
          [path]: {
            value: result.content,
            original: result.content,
            binary: result.binary,
            loading: false,
          },
        }));
      } catch (error) {
        setBuffers((prev) => ({
          ...prev,
          [path]: {
            value: '',
            original: '',
            loading: false,
            error: String((error as Error)?.message || error),
          },
        }));
      }
    },
    [workspace.path]
  );

  useEffect(() => {
    if (!active) return;
    if (!buffers[active]) void load(active);
  }, [active, buffers, load]);

  const dirty = buffer ? buffer.value !== buffer.original : false;

  const save = async () => {
    if (!active || !buffer) return;
    try {
      await window.rm.fs.write(workspace.path, active, buffer.value);
      setBuffers((prev) => ({ ...prev, [active]: { ...prev[active], original: prev[active].value } }));
      toast('Saved', active, 'success');
    } catch (error) {
      toast('Save failed', String((error as Error)?.message || error), 'error');
    }
  };

  useEffect(() => {
    if (!state.settings.autoSave || !active || !buffer) return;
    if (buffer.loading || buffer.error || buffer.binary) return;
    if (buffer.value === buffer.original) return;
    const value = buffer.value;
    const timer = window.setTimeout(() => {
      window.rm.fs
        .write(workspace.path, active, value)
        .then(() => {
          setBuffers((prev) =>
            prev[active] ? { ...prev, [active]: { ...prev[active], original: value } } : prev
          );
        })
        .catch((error) => toast('Auto-save failed', String((error as Error)?.message || error), 'error'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state.settings.autoSave, active, workspace.path, buffer, toast]);

  const closeTab = (path: string) => {
    const remaining = tabs.filter((tab) => tab !== path);
    if (remaining.length === 0) {
      onTabsChange([]);
      onClosePane();
      return;
    }
    onTabsChange(remaining);
    if (path === active) onPathChange(remaining[remaining.length - 1]);
  };

  const lines = useMemo(() => (buffer?.value || '').split('\n').length, [buffer?.value]);
  const language = active ? EXT_LANG[active.split('.').pop() || ''] || 'Plain text' : '';

  if (!active) {
    return (
      <div className="editor-shell" data-testid="editor-pane">
        <div className="editor-empty">
          <FileText size={26} />
          <h3>Open a file</h3>
          <p>Pick a file from the workspace tree, or enter a path below.</p>
          <div className="row" style={{ width: 'min(420px, 90%)' }}>
            <input
              className="input"
              value={manualPath}
              placeholder="src/App.tsx"
              data-testid="editor-open-path"
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualPath.trim()) {
                  onTabsChange([manualPath.trim()]);
                  onPathChange(manualPath.trim());
                }
              }}
            />
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={() => {
                if (!manualPath.trim()) return;
                onTabsChange([manualPath.trim()]);
                onPathChange(manualPath.trim());
              }}
            >
              <FolderOpen size={12} /> Open
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell" data-testid="editor-pane">
      <div className="editor-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={`editor-tab ${tab === active ? 'active' : ''}`}
            onClick={() => onPathChange(tab)}
            title={tab}
          >
            <FileText size={11} />
            <span>{tab.split('/').pop()}</span>
            {buffers[tab] && buffers[tab].value !== buffers[tab].original && <span className="dirty" />}
            <span
              className="tab-close"
              role="button"
              aria-label={`Close ${tab}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab);
              }}
            >
              <X size={10} />
            </span>
          </button>
        ))}
        <span className="spacer" style={{ flex: 1 }} />
        <IconButton label="Save file" onClick={() => void save()} disabled={!dirty}>
          <Save size={13} />
        </IconButton>
        <IconButton
          label="Revert file"
          onClick={() => {
            if (!buffer) return;
            setBuffers((prev) => ({ ...prev, [active]: { ...buffer, value: buffer.original } }));
          }}
          disabled={!dirty}
        >
          <RotateCcw size={13} />
        </IconButton>
      </div>
      <div className="editor-main">
        {buffer?.loading ? (
          <div className="editor-empty">
            <Spinner size={18} /> <span className="muted">Loading {active}…</span>
          </div>
        ) : buffer?.error ? (
          <div className="editor-empty">
            <FileText size={24} />
            <h3>Could not open file</h3>
            <p className="mono">{buffer.error}</p>
          </div>
        ) : buffer?.binary ? (
          <div className="editor-empty">
            <FileText size={24} />
            <h3>Binary file</h3>
            <p>This file cannot be shown as text. Open it with its native app from the Files pane.</p>
          </div>
        ) : (
          <>
            <div className="editor-gutter" ref={gutterRef}>
              {Array.from({ length: lines }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textRef}
              className="editor-textarea"
              spellCheck={false}
              wrap={state.settings.wrapLines ? 'soft' : 'off'}
              style={{ fontSize: state.settings.editorFontSize, lineHeight: 1.6 }}
              value={buffer?.value || ''}
              data-testid="editor-textarea"
              onChange={(e) => {
                if (!buffer) return;
                setBuffers((prev) => ({ ...prev, [active]: { ...buffer, value: e.target.value } }));
              }}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  void save();
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const next = `${buffer?.value.slice(0, start)}  ${buffer?.value.slice(el.selectionEnd)}`;
                  setBuffers((prev) => ({ ...prev, [active]: { ...buffer!, value: next } }));
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
            />
          </>
        )}
      </div>
      <div className="editor-status">
        <FileText size={10} />
        <span className="mono">{active}</span>
        <span className="spacer" />
        <span>{language}</span>
        <span>Ln {lines}</span>
        <span>{buffer?.value.length || 0} chars</span>
        <span className={dirty ? 'modified' : ''}>
          {dirty ? <><span className="dirty-dot" /> Modified</> : <><Check size={10} /> Saved</>}
        </span>
        <span>{state.settings.editorFontSize}px</span>
      </div>
    </div>
  );
}
