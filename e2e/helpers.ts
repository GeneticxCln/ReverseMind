import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultState } from '../src/defaults';
import type { AppState, McpServer, Pane, Settings } from '../src/types';

export const WORKSPACE_ID = 'ws-e2e';
export const CHAT_ID = 'chat-e2e';
export const TASK_ID = 'task-e2e';

export interface LaunchOptions {
  settings?: Partial<Settings>;
  disabledPlugins?: string[];
  mode?: AppState['ui']['mode'];
  view?: AppState['ui']['view'];
  browserPane?: boolean;
  panes?: Pane[];
  mcpServers?: McpServer[];
  /** Runs after the workspace folder exists, before the app starts. */
  prepare?: (workspacePath: string) => void;
  /** Display name for the seeded workspace (also switches the temp folder prefix). */
  workspaceName?: string;
  task?: boolean;
}

export interface Harness {
  app: ElectronApplication;
  page: Page;
  root: string;
  workspacePath: string;
  dataDir: string;
}

export async function launchApp(options: LaunchOptions = {}): Promise<Harness> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), options.workspaceName ? 'reversemind-demo-' : 'reversemind-e2e-'));
  const dataDir = path.join(root, 'data');
  const workspacePath = path.join(root, 'workspace');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'seed.txt'), 'seed');

  const state = createDefaultState();
  const agent = state.agents[0];
  const now = Date.now();
  state.settings = {
    ...state.settings,
    zoom: 100,
    zoomAutoApplied: true,
    autoSave: true,
    notificationChime: false,
    ...options.settings,
  };
  state.plugins = state.plugins.map((plugin) => ({
    ...plugin,
    enabled: options.disabledPlugins?.includes(plugin.id) ? false : plugin.enabled,
  }));
  state.workspaces = [
    {
      id: WORKSPACE_ID,
      name: options.workspaceName ?? 'E2E workspace',
      path: workspacePath,
      createdAt: now,
      lastOpenedAt: now,
      pinned: false,
      isGit: false,
      color: '#8b5cf6',
      kind: 'local',
    },
  ];
  state.chats = [
    {
      id: CHAT_ID,
      agentId: agent.id,
      workspaceId: WORKSPACE_ID,
      title: 'New chat',
      provider: 'offline',
      model: null,
      mode: 'agent',
      messages: [],
      status: 'idle',
      pinned: false,
      createdAt: now,
      updatedAt: now,
      tabOrder: 0,
    },
  ];
  state.ui = {
    ...state.ui,
    mode: options.mode ?? 'agent',
    view: options.view ?? 'workspace',
    selectedAgentId: agent.id,
    selectedWorkspaceId: WORKSPACE_ID,
    selectedChatId: CHAT_ID,
  };
  if (options.browserPane) {
    state.layouts = [
      {
        workspaceId: WORKSPACE_ID,
        panes: [{ id: 'pane-browser-e2e', type: 'browser', title: 'Browser', url: 'rm://home/' }],
        activePaneId: 'pane-browser-e2e',
      },
    ];
  }
  if (options.panes) {
    state.layouts = [{ workspaceId: WORKSPACE_ID, panes: options.panes, activePaneId: options.panes[0]?.id ?? null }];
  }
  if (options.mcpServers) state.mcpServers = options.mcpServers;
  options.prepare?.(workspacePath);
  if (options.task) {
    state.tasks = [
      {
        id: TASK_ID,
        title: 'Plugin board test',
        description: 'A seeded ticket.',
        status: 'backlog',
        priority: 'medium',
        agentId: agent.id,
        workspaceId: WORKSPACE_ID,
        labels: ['e2e'],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2));

  // RM_PACKAGED points at an unpacked build (release/linux-unpacked/reversemind) to test the shipped app.
  const packaged = process.env.RM_PACKAGED ? path.resolve(process.env.RM_PACKAGED) : null;
  const app = await _electron.launch({
    executablePath: packaged ?? path.join(process.cwd(), 'node_modules/electron/dist/electron'),
    args: packaged ? ['--no-sandbox'] : ['.', '--no-sandbox'],
    env: { ...process.env, REVERSEMIND_USERDATA: dataDir },
    timeout: 30_000,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="mode-agent"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="agent-view"], [data-testid="settings-view"], [data-testid="tickets-page"], [data-testid="code-view"]', {
    timeout: 20_000,
  });
  return { app, page, root, workspacePath, dataDir };
}

export async function waitForExit(app: ElectronApplication, timeout = 10_000): Promise<boolean> {
  if (app.process().exitCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout);
    app.process().once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function closeHarness(harness: Harness): Promise<void> {
  const { app, root } = harness;
  const proc = app.process();
  if (proc.exitCode === null) {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

export async function installFakeSpeech(page: Page, transcript: string): Promise<void> {
  await page.evaluate((text) => {
    (window as any).SpeechRecognition = class {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: text }]] });
          this.onend?.();
        }, 80);
      }

      stop() {
        this.onend?.();
      }

      abort() {}
    };
  }, transcript);
}
