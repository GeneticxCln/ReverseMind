import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Eraser, TerminalSquare } from 'lucide-react';
import type { Pane, Workspace } from '../../types';
import { useStore } from '../../store';
import { IconButton } from '../ui';

interface LiveTerminal {
  term: Terminal;
  fit: FitAddon;
  stop: () => void;
}

/**
 * Terminals outlive the React component: switching views or workspaces only detaches the xterm
 * element, and the PTY keeps running. Call disposeTerminal when the pane is closed for good.
 */
const live = new Map<string, LiveTerminal>();

export function disposeTerminal(paneId: string): void {
  const entry = live.get(paneId);
  live.delete(paneId);
  entry?.stop();
  entry?.term.dispose();
  window.rm.term.close(paneId);
}

function createLive(pane: Pane, cwd: string, shell: string | undefined): LiveTerminal {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.35,
    scrollback: 6000,
    allowTransparency: true,
      theme: {
        background: '#0b0d13',
        foreground: '#d7dbea',
        cursor: '#a78bfa',
        cursorAccent: '#0b0d13',
        selectionBackground: 'rgba(139,92,246,0.35)',
        black: '#1b1e2b',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#eef0f8',
        brightBlack: '#5f667b',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.write('\x1b[38;5;141mReverseMind\x1b[0m terminal · local PTY\r\n');

  let initialSent = false;
  const sendInitial = () => {
    if (initialSent) return;
    initialSent = true;
    if (pane.initialCommand) setTimeout(() => window.rm.term.write(pane.id, `${pane.initialCommand}\r`), 700);
  };

  const off = window.rm.onEvent((raw: unknown) => {
    const payload = raw as { event?: string; payload?: any };
    if (!payload || payload.payload?.id !== pane.id) return;
    if (payload.event === 'term:data') term.write(String(payload.payload.data || ''));
    else if (payload.event === 'term:opened') sendInitial();
    else if (payload.event === 'term:exit') term.write('\r\n\x1b[38;5;245m[process exited]\x1b[0m\r\n');
    else if (payload.event === 'term:error') term.write(`\r\n\x1b[31m${payload.payload.error}\x1b[0m\r\n`);
  });
  const dataSub = term.onData((data) => window.rm.term.write(pane.id, data));
  const fallback = setTimeout(sendInitial, 1400);

  void window.rm.term.create(pane.id, cwd, term.cols || 100, term.rows || 28, shell).catch((error: unknown) => {
    term.write(`\r\n\x1b[31mFailed to start PTY: ${String((error as Error)?.message || error)}\x1b[0m\r\n`);
  });

  const entry: LiveTerminal = {
    term,
    fit,
    stop: () => {
      clearTimeout(fallback);
      dataSub.dispose();
      off();
    },
  };
  live.set(pane.id, entry);
  return entry;
}

export function TerminalPane({ pane, workspace }: { pane: Pane; workspace: Workspace }) {
  const { state, info } = useStore();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<LiveTerminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cwd = workspace.kind === 'ssh' ? info?.home || '/tmp' : workspace.path;
    const entry = live.get(pane.id) ?? createLive(pane, cwd, state.settings.terminalShell || undefined);
    entryRef.current = entry;
    const { term, fit } = entry;
    if (term.element) host.appendChild(term.element);
    else term.open(host);

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return; // hidden or collapsed
      try {
        fit.fit();
        window.rm.term.resize(pane.id, term.cols, term.rows);
      } catch {
        // host may not be measured yet
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      term.element?.remove();
      entryRef.current = null;
    };
    // The PTY is created once per pane; later setting changes apply to new terminals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  return (
    <div className="terminal-pane" data-testid="terminal-pane">
      <div className="terminal-toolbar">
        <TerminalSquare size={12} />
        <span className="mono">{pane.title}</span>
        <span className="faint small">{workspace.kind === 'ssh' ? 'SSH session' : workspace.path}</span>
        <span className="spacer" />
        <IconButton
          label="Clear terminal"
          onClick={() => {
            entryRef.current?.term.clear();
            entryRef.current?.term.write('\x1b[38;5;141mReverseMind\x1b[0m terminal cleared\r\n');
          }}
        >
          <Eraser size={13} />
        </IconButton>
      </div>
      <div className="terminal-host" ref={hostRef} data-testid="terminal-host" />
    </div>
  );
}
