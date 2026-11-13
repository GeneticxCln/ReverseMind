import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { ProviderResult, ProviderStreamRequest } from '../src/runtime/provider';

type Listener = (payload: unknown) => void;

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state: unknown) => ipcRenderer.invoke('state:save', state),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  createWorkspace: (input: { name: string; dir: string; git: boolean }) => ipcRenderer.invoke('workspace:create', input),
  fs: {
    tree: (root: string) => ipcRenderer.invoke('fs:tree', root),
    read: (root: string, path: string) => ipcRenderer.invoke('fs:read', { root, path }),
    write: (root: string, path: string, content: string) => ipcRenderer.invoke('fs:write', { root, path, content }),
    mkdir: (root: string, path: string) => ipcRenderer.invoke('fs:mkdir', { root, path }),
    rename: (root: string, from: string, to: string) => ipcRenderer.invoke('fs:rename', { root, from, to }),
    delete: (root: string, path: string) => ipcRenderer.invoke('fs:delete', { root, path }),
    search: (root: string, query: string) => ipcRenderer.invoke('fs:search', { root, query }),
  },
  git: {
    status: (root: string) => ipcRenderer.invoke('git:status', root),
    diff: (root: string, file?: string, staged?: boolean) => ipcRenderer.invoke('git:diff', { root, file, staged }),
    stage: (root: string, file: string) => ipcRenderer.invoke('git:stage', { root, file }),
    unstage: (root: string, file: string) => ipcRenderer.invoke('git:unstage', { root, file }),
    discard: (root: string, file: string) => ipcRenderer.invoke('git:discard', { root, file }),
    commit: (root: string, message: string) => ipcRenderer.invoke('git:commit', { root, message }),
    log: (root: string) => ipcRenderer.invoke('git:log', root),
    branches: (root: string) => ipcRenderer.invoke('git:branches', root),
    checkout: (root: string, branch: string) => ipcRenderer.invoke('git:checkout', { root, branch }),
    worktrees: (root: string) => ipcRenderer.invoke('git:worktrees', root),
    worktreeAdd: (root: string, target: string, branch: string) => ipcRenderer.invoke('git:worktreeAdd', { root, target, branch }),
  },
  shell: {
    run: (root: string, command: string, timeoutMs?: number) => ipcRenderer.invoke('shell:run', { root, command, timeoutMs }),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  ssh: {
    probe: (config: { host: string; user: string; path: string; port?: number }) => ipcRenderer.invoke('ssh:probe', config),
  },
  term: {
    create: (id: string, cwd: string, cols?: number, rows?: number, shell?: string) =>
      ipcRenderer.invoke('term:create', { id, cwd, cols, rows, shell }),
    write: (id: string, data: string) => ipcRenderer.send('term:write', { id, data }),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('term:resize', { id, cols, rows }),
    close: (id: string) => ipcRenderer.send('term:close', id),
  },
  window: {
    control: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window:control', action),
  },
  provider: {
    stream: (request: ProviderStreamRequest) => ipcRenderer.invoke('provider:stream', request) as Promise<ProviderResult>,
    abort: (requestId: string) => ipcRenderer.invoke('provider:abort', requestId),
  },
  mcp: {
    connect: (server: unknown) => ipcRenderer.invoke('mcp:connect', server),
    disconnect: (id: string) => ipcRenderer.invoke('mcp:disconnect', id),
    call: (serverId: string, tool: string, args: Record<string, unknown>) => ipcRenderer.invoke('mcp:call', { serverId, tool, args }),
  },
  notify: (title: string, body: string, sound = false) => ipcRenderer.invoke('notify:system', { title, body, sound }),
  setQuitBehavior: (behavior: 'keep' | 'stop') => ipcRenderer.invoke('app:setQuitBehavior', behavior),
  setZoom: (zoom: number) => ipcRenderer.invoke('app:setZoom', zoom),
  openPath: (target: string) => ipcRenderer.invoke('app:openPath', target),
  revealPath: (target: string) => ipcRenderer.invoke('app:revealPath', target),
  browserReaderScript: () => ipcRenderer.invoke('browser:reader-script'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onEvent: (listener: Listener) => {
    const wrapped = (_e: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('rm:event', wrapped);
    return () => {
      ipcRenderer.removeListener('rm:event', wrapped);
    };
  },
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('rm', api);

export type RmApi = typeof api;
