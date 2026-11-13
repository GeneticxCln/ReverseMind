import { app, BrowserWindow, ipcMain, dialog, shell, Notification, protocol, nativeTheme, screen, Menu, Tray, nativeImage, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { loadState, saveState, dataDir, stateRecovery } from './store';
import { RootRegistry, isAllowedAppNavigation, isAllowedGuestUrl } from './security';
import { validateSshConfig } from '../src/ssh';
import { tree, readText, writeText, mkdir, rename, remove, searchFiles, gitStatus, gitDiff, gitStage, gitUnstage, gitDiscard, gitCommit, gitLog, gitBranches, gitCheckout, gitWorktrees, gitWorktreeAdd, initRepo, shellRun, sshProbe } from './services';
import { TerminalService } from './terminal';
import { McpManager } from './mcp';
import { streamCompletion } from './provider';
import type { ProviderStreamRequest } from '../src/runtime/provider';
import type { AppState, McpServer, SshConfig } from '../src/types';

// Keep Chromium's own profile (and the single-instance lock) in the same place as the app state.
if (process.env.REVERSEMIND_USERDATA) app.setPath('userData', process.env.REVERSEMIND_USERDATA);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const BROWSER_PARTITION = 'persist:rm-browser';
const roots = new RootRegistry();

protocol.registerSchemesAsPrivileged([
  { scheme: 'rm', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;
let terminal: TerminalService;
let mcp: McpManager;
let tray: Tray | null = null;
let isQuitting = false;
let quitBehavior: 'keep' | 'stop' = 'keep';

const BROWSER_HOME = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>ReverseMind Browser Test</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; background:#0f1117; color:#e8eaf2; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 32px; letter-spacing:-0.02em; }
  .card { background:#171a24; border:1px solid #2a2f3d; border-radius:14px; padding:20px; margin:16px 0; }
  code { background:#232838; padding:2px 6px; border-radius:6px; }
  button { background:#8b5cf6; color:white; border:0; border-radius:9px; padding:10px 16px; cursor:pointer; }
  #count { font-variant-numeric: tabular-nums; font-weight:700; color:#5eead4; }
</style>
</head>
<body>
<main>
  <p style="color:#8b92a8;font-size:12px;letter-spacing:.18em;text-transform:uppercase">ReverseMind browser pane</p>
  <h1>Local browser sandbox</h1>
  <p>This page is served inside the app so browser threads work without a network connection.</p>
  <div class="card">
    <h2>Interactive counter</h2>
    <p>Click the button to prove the embedded page is live: <span id="count">0</span></p>
    <button id="bump">Increment</button>
  </div>
  <div class="card">
    <h2>Page reader target</h2>
    <p id="reader-target">The browser pane can extract this sentence with the Reader action.</p>
    <p>Marker: <code>REVERSEMIND_BROWSER_OK</code></p>
  </div>
  <script>
    let n = 0;
    document.getElementById('bump').addEventListener('click', () => {
      n += 1;
      document.getElementById('count').textContent = String(n);
    });
  </script>
</main>
</body>
</html>
`;

function emit(event: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('rm:event', { event, payload });
}

function windowBounds() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  return {
    width: Math.max(1200, Math.min(2400, Math.round(workAreaSize.width * 0.9))),
    height: Math.max(760, Math.min(1500, Math.round(workAreaSize.height * 0.9))),
  };
}

function createTrayIcon() {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const inside = Math.sqrt(dx * dx + dy * dy) < size / 2 - 1;
      bitmap[index] = inside ? 246 : 0;
      bitmap[index + 1] = inside ? 92 : 0;
      bitmap[index + 2] = inside ? 139 : 0;
      bitmap[index + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray(): boolean {
  if (tray) return true;
  try {
    const icon = createTrayIcon();
    const instance = new Tray(icon);
    instance.setToolTip('ReverseMind');
    instance.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show ReverseMind', click: showMainWindow },
        { type: 'separator' },
        {
          label: 'Quit ReverseMind',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ])
    );
    instance.on('click', showMainWindow);
    tray = instance;
    return true;
  } catch (error) {
    console.error('Unable to create the tray icon; closing will quit instead.', error);
    return false;
  }
}

function createWindow() {
  const bounds = windowBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#0a0b0f',
    title: 'ReverseMind',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('close', (event) => {
    if (isQuitting || quitBehavior === 'stop') return;
    if (!ensureTray()) {
      isQuitting = true;
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.REVERSEMIND_DEV_URL;
  const devOrigin = devUrl ? new URL(devUrl).origin : null;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url, devOrigin)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  // The browser pane is the only place web content may live, and it never gets Node or a preload.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isAllowedGuestUrl(params.src || 'about:blank')) {
      event.preventDefault();
      return;
    }
    delete (webPreferences as { preload?: string }).preload;
    delete (webPreferences as { preloadURL?: string }).preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    params.partition = BROWSER_PARTITION;
    params.allowpopups = undefined as unknown as string;
  });
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  if (process.env.REVERSEMIND_SHOW_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function lockDownSessions() {
  const appAllowed = new Set(['media', 'clipboard-sanitized-write', 'clipboard-read', 'notifications', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(appAllowed.has(permission)));
  // Web pages in the browser pane get no device or notification permissions.
  session.fromPartition(BROWSER_PARTITION).setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.fromPartition(BROWSER_PARTITION).setPermissionCheckHandler(() => false);
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedGuestUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAllowedGuestUrl(url)) event.preventDefault();
  });
});

if (gotLock) app.on('second-instance', () => showMainWindow());

if (gotLock) app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  lockDownSessions();
  const initialState = loadState();
  for (const workspace of initialState.workspaces) if (workspace.kind === 'local') roots.register(workspace.path);
  quitBehavior = initialState.settings.quitBehavior === 'stop' ? 'stop' : 'keep';
  terminal = new TerminalService(emit);
  mcp = new McpManager(emit);

  protocol.handle('rm', async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'home' || url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(BROWSER_HOME, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return new Response('<h1>Not found</h1>', { status: 404, headers: { 'content-type': 'text/html' } });
  });

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  terminal?.shutdown();
  mcp?.shutdown();
});

app.on('will-quit', () => {
  tray?.destroy();
  tray = null;
});

/** Only the app's own top-level window may call into the main process. */
function assertTrusted(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted IPC sender');
  }
}

function handle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrusted(event);
    return fn(event, ...args);
  });
}

function on(channel: string, fn: (event: IpcMainEvent, ...args: any[]) => void) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrusted(event);
    } catch {
      return;
    }
    fn(event, ...args);
  });
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: dataDir(),
    statePath: path.join(dataDir(), 'state.json'),
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    home: process.env.HOME || '',
    browserHome: 'rm://home/',
    stateRecovery,
    display: (() => {
      const primary = screen.getPrimaryDisplay();
      return { width: primary.size.width, height: primary.size.height, scaleFactor: primary.scaleFactor };
    })(),
  }));

  handle('state:load', () => loadState());
  handle('state:save', (_e, state: AppState) => {
    quitBehavior = state.settings.quitBehavior === 'stop' ? 'stop' : 'keep';
    return saveState(state);
  });

  handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('workspace:create', async (_e, { name, dir, git }: { name: string; dir: string; git: boolean }) => {
    const safeName = name.replace(/[^\w .-]/g, '').trim();
    if (!safeName || /^\.+$/.test(safeName)) throw new Error('Choose a different workspace name');
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('Choose an absolute parent folder');
    const root = path.resolve(dir, safeName);
    fs.mkdirSync(root, { recursive: true });
    roots.register(root);
    let gitMessage = '';
    if (git) {
      const res = await initRepo(root);
      gitMessage = res.output;
    }
    return { path: root, gitMessage };
  });

  handle('fs:tree', (_e, root: string) => tree(roots.resolve(root)));
  handle('fs:read', (_e, { root, path: rel }: { root: string; path: string }) => readText(roots.resolve(root), rel));
  handle('fs:write', (_e, { root, path: rel, content }: { root: string; path: string; content: string }) => writeText(roots.resolve(root), rel, content));
  handle('fs:mkdir', (_e, { root, path: rel }: { root: string; path: string }) => mkdir(roots.resolve(root), rel));
  handle('fs:rename', (_e, { root, from, to }: { root: string; from: string; to: string }) => rename(roots.resolve(root), from, to));
  handle('fs:delete', (_e, { root, path: rel }: { root: string; path: string }) => remove(roots.resolve(root), rel));
  handle('fs:search', (_e, { root, query }: { root: string; query: string }) => searchFiles(roots.resolve(root), query));

  handle('git:status', (_e, root: string) => gitStatus(roots.resolve(root)));
  handle('git:diff', (_e, { root, file, staged }: { root: string; file?: string; staged?: boolean }) => gitDiff(roots.resolve(root), file, staged));
  handle('git:stage', (_e, { root, file }: { root: string; file: string }) => gitStage(roots.resolve(root), file));
  handle('git:unstage', (_e, { root, file }: { root: string; file: string }) => gitUnstage(roots.resolve(root), file));
  handle('git:discard', (_e, { root, file }: { root: string; file: string }) => gitDiscard(roots.resolve(root), file));
  handle('git:commit', (_e, { root, message }: { root: string; message: string }) => gitCommit(roots.resolve(root), message));
  handle('git:log', (_e, root: string) => gitLog(roots.resolve(root)));
  handle('git:branches', (_e, root: string) => gitBranches(roots.resolve(root)));
  handle('git:checkout', (_e, { root, branch }: { root: string; branch: string }) => gitCheckout(roots.resolve(root), branch));
  handle('git:worktrees', (_e, root: string) => gitWorktrees(roots.resolve(root)));
  handle('git:worktreeAdd', (_e, { root, target, branch }: { root: string; target: string; branch: string }) => gitWorktreeAdd(roots.resolve(root), target, branch));

  handle('shell:run', (_e, { root, command, timeoutMs }: { root: string; command: string; timeoutMs?: number }) => shellRun(roots.resolve(root), command, timeoutMs));
  handle('ssh:probe', (_e, config: SshConfig) => {
    const invalid = validateSshConfig(config);
    return invalid ? { ok: false, output: invalid } : sshProbe(config);
  });
  handle('shell:openExternal', (_e, url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url);
    throw new Error('Only https links can be opened');
  });

  handle('term:create', (_e, { id, cwd, cols, rows, shell }: { id: string; cwd: string; cols?: number; rows?: number; shell?: string }) =>
    terminal.create(id, { cwd, cols, rows, shell })
  );
  on('term:write', (_e, { id, data }: { id: string; data: string }) => terminal.write(id, data));
  on('term:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => terminal.resize(id, cols, rows));
  on('term:close', (_e, id: string) => terminal.close(id));

  handle('window:control', (_e, action: string) => {
    if (!mainWindow) return null;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    else if (action === 'close') mainWindow.close();
    return { maximized: mainWindow.isMaximized() };
  });

  const inflight = new Map<string, AbortController>();
  handle('provider:stream', async (_e, request: ProviderStreamRequest) => {
    const provider = loadState().settings.providers.find((p) => p.id === request.providerId);
    if (!provider) throw new Error('Provider is not configured');
    if (provider.kind !== 'openai' && provider.kind !== 'anthropic') throw new Error('Unsupported provider');
    const controller = new AbortController();
    inflight.set(request.requestId, controller);
    try {
      return await streamCompletion(provider, request, (text) => emit('provider:delta', { requestId: request.requestId, text }), controller.signal);
    } finally {
      inflight.delete(request.requestId);
    }
  });
  handle('provider:abort', (_e, requestId: string) => {
    inflight.get(requestId)?.abort();
    return { ok: true };
  });

  handle('mcp:connect', async (_e, server: McpServer) => {
    const result = await mcp.connect(server);
    return { tools: result.tools, serverInfo: result.serverInfo };
  });
  handle('mcp:disconnect', (_e, id: string) => mcp.disconnect(id));
  handle('mcp:call', (_e, { serverId, tool, args }: { serverId: string; tool: string; args: Record<string, unknown> }) =>
    mcp.callTool(serverId, tool, args)
  );

  handle('notify:system', (_e, { title, body, sound }: { title: string; body: string; sound?: boolean }) => {
    const supported = Notification.isSupported();
    if (supported) new Notification({ title, body, silent: !sound }).show();
    return { ok: supported };
  });

  handle('app:setZoom', (_e, zoom: number) => {
    const win = mainWindow;
    if (win) win.webContents.setZoomFactor(Math.max(0.5, Math.min(3, zoom / 100)));
    return { ok: true };
  });

  handle('app:openPath', (_e, target: string) => {
    if (!roots.contains(target)) throw new Error('Only workspace folders can be opened');
    return shell.openPath(target);
  });
  handle('app:revealPath', (_e, target: string) => {
    if (!roots.contains(target) && path.resolve(target) !== path.resolve(dataDir())) throw new Error('Only workspace folders can be revealed');
    return shell.showItemInFolder(target);
  });

  handle('browser:reader-script', () => ({
    script: `(() => ({ title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, 12000) }))()`,
  }));

  handle('app:setQuitBehavior', (_e, behavior: string) => {
    quitBehavior = behavior === 'stop' ? 'stop' : 'keep';
    return { ok: true, quitBehavior };
  });

  handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });
}
