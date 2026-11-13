import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { createDefaultState } from '../src/defaults';
import type { AppState } from '../src/types';

let cachedDir: string | null = null;
let backedUpThisRun = false;

/** Set when the last load had to set aside an unreadable state file. */
export let stateRecovery: { backupPath: string; reason: string } | null = null;

const ENC_PREFIX = 'enc:v1:';

/** safeStorage on Linux can silently fall back to a hard-coded key (basic_text); treat that as unavailable. */
function canEncrypt(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const backend = (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.();
    return backend !== 'basic_text' && backend !== 'unknown';
  } catch {
    return false;
  }
}

function encryptSecret(value: string): string {
  if (!value || value.startsWith(ENC_PREFIX) || !canEncrypt()) return value;
  return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    console.error('Could not decrypt a stored API key; it must be entered again.');
    return '';
  }
}

function mapProviderKeys(state: AppState, fn: (key: string) => string): AppState {
  const providers = state.settings?.providers;
  if (!Array.isArray(providers)) return state;
  return {
    ...state,
    settings: { ...state.settings, providers: providers.map((p) => ({ ...p, apiKey: typeof p.apiKey === 'string' ? fn(p.apiKey) : '' })) },
  };
}

/** Anything persisted as "in flight" cannot still be running after a restart. */
function clearInFlight(state: AppState): AppState {
  return {
    ...state,
    chats: state.chats.map((chat) => ({
      ...chat,
      status: 'idle',
      messages: (chat.messages || []).map((m) => ({
        ...m,
        streaming: false,
        toolCalls: m.toolCalls?.map((t) =>
          t.status === 'running' ? { ...t, status: 'error', error: 'Interrupted by restart', finishedAt: Date.now() } : t
        ),
      })),
    })),
    mcpServers: state.mcpServers.map((server) => ({ ...server, status: 'disconnected' })),
    routines: state.routines.map((r) => (r.lastResult === 'Running…' ? { ...r, lastResult: 'Interrupted' } : r)),
  };
}

export function dataDir(): string {
  if (cachedDir) return cachedDir;
  cachedDir = process.env.REVERSEMIND_USERDATA || app.getPath('userData');
  fs.mkdirSync(cachedDir, { recursive: true });
  return cachedDir;
}

export function statePath(): string {
  return path.join(dataDir(), 'state.json');
}

/** Move an unreadable state file aside so the next save cannot destroy it. */
function setAsideCorrupt(reason: string): void {
  try {
    const backupPath = path.join(dataDir(), `state.corrupt-${Date.now()}.json`);
    fs.renameSync(statePath(), backupPath); // moved, so later loads see a first run and do not back it up again
    fs.chmodSync(backupPath, 0o600);
    stateRecovery = { backupPath, reason };
    console.error(`state.json unreadable (${reason}); file moved to ${backupPath}`);
  } catch (error) {
    console.error('Could not back up unreadable state.json', error);
  }
}

export function loadState(): AppState {
  const fallback = createDefaultState();
  let raw: string;
  try {
    raw = fs.readFileSync(statePath(), 'utf8');
  } catch {
    return fallback; // first run: no file yet
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    const merged: AppState = {
      ...fallback,
      ...parsed,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      ui: { ...fallback.ui, ...(parsed.ui || {}) },
      agents: Array.isArray(parsed.agents) && parsed.agents.length ? parsed.agents : fallback.agents,
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      layouts: Array.isArray(parsed.layouts) ? parsed.layouts : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      routines: Array.isArray(parsed.routines) ? parsed.routines : [],
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts : fallback.prompts,
      plugins: Array.isArray(parsed.plugins) && parsed.plugins.length ? parsed.plugins : fallback.plugins,
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : [],
      usage: Array.isArray(parsed.usage) ? parsed.usage : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      browserHistory: Array.isArray(parsed.browserHistory) ? parsed.browserHistory : [],
    };
    if (!merged.ui.selectedAgentId && merged.agents[0]) merged.ui.selectedAgentId = merged.agents[0].id;
    return clearInFlight(mapProviderKeys(merged, decryptSecret));
  } catch (error) {
    setAsideCorrupt(String((error as Error)?.message || error));
    return fallback;
  }
}

export function saveState(state: AppState): { ok: true } {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = statePath();
  if (!backedUpThisRun && fs.existsSync(file)) {
    backedUpThisRun = true;
    try {
      fs.copyFileSync(file, `${file}.bak`);
      fs.chmodSync(`${file}.bak`, 0o600);
    } catch {
      // best effort
    }
  }
  const temp = `${file}.${process.pid}.tmp`;
  const payload = JSON.stringify({ ...mapProviderKeys(state, encryptSecret), updatedAt: Date.now() }, null, 0);
  fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
  return { ok: true };
}
