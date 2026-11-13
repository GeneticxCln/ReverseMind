import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AppState, ChatMessage, ChatThread, UsageRecord } from './types';
import { createDefaultState, recommendedZoom } from './defaults';
import { playNotificationChime } from './chime';
import type { RmApi } from '../electron/preload';

declare global {
  interface Window {
    rm: RmApi;
  }
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface StoreValue {
  state: AppState;
  getState: () => AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  patchUi: (patch: Partial<AppState['ui']>) => void;
  toast: (title: string, body?: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  notify: (title: string, body: string, kind?: AppState['notifications'][number]['kind']) => void;
  addUsage: (record: Omit<UsageRecord, 'id' | 'createdAt'>) => void;
  mutateChat: (chatId: string, fn: (chat: ChatThread) => ChatThread) => void;
  deleteChat: (chatId: string) => void;
  createChat: (agentId: string, opts?: { workspaceId?: string | null; title?: string; mode?: ChatThread['mode'] }) => ChatThread;
  selectedAgent: () => AppState['agents'][number] | null;
  selectedWorkspace: () => AppState['workspaces'][number] | null;
  loading: boolean;
  info: {
    version: string;
    dataDir: string;
    browserHome: string;
    home: string;
    platform: string;
    display?: { width: number; height: number; scaleFactor: number };
    stateRecovery?: { backupPath: string; reason: string } | null;
  } | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setRawState] = useState<AppState>(() => createDefaultState());
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [info, setInfo] = useState<StoreValue['info']>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  // Every update goes through here so getState() sees it immediately, not after the next render.
  const setState = useCallback<React.Dispatch<React.SetStateAction<AppState>>>((value) => {
    const next = typeof value === 'function' ? (value as (prev: AppState) => AppState)(latest.current) : value;
    latest.current = next;
    setRawState(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [loaded, appInfo] = await Promise.all([window.rm.loadState(), window.rm.info()]);
        if (!mounted) return;
        const shouldAutoScale = !loaded.settings.zoomAutoApplied && loaded.settings.zoom === 100;
        const zoom = shouldAutoScale ? recommendedZoom(appInfo.display) : loaded.settings.zoom;
        setState({ ...loaded, settings: { ...loaded.settings, zoom, zoomAutoApplied: true } });
        setInfo(appInfo);
        if (appInfo.stateRecovery) {
          toast(
            'Saved data could not be read',
            `Started fresh. Your old file was kept at ${appInfo.stateRecovery.backupPath}`,
            'error'
          );
        }
        document.documentElement.dataset.theme = loaded.settings.theme;
        document.documentElement.dataset.accent = loaded.settings.accent;
        window.rm.setZoom(zoom);
      } catch (error) {
        console.error('Failed to load state', error);
      } finally {
        if (mounted) {
          hydrated.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const firstDirtyAt = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Debounce quick bursts, but never wait more than 5s so a crash mid-stream loses little.
    const now = Date.now();
    firstDirtyAt.current ??= now;
    const wait = Math.max(0, Math.min(450, firstDirtyAt.current + 5000 - now));
    saveTimer.current = setTimeout(() => {
      firstDirtyAt.current = null;
      window.rm.saveState(latest.current).catch((error) => console.error('save failed', error));
    }, wait);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  useEffect(() => {
    const onBeforeUnload = () => {
      window.rm.saveState(latest.current).catch(() => {});
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const patchUi = useCallback((patch: Partial<AppState['ui']>) => {
    setState((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, body?: string, tone: Toast['tone'] = 'info') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, title, body, tone }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5200);
    },
    []
  );

  const notify = useCallback(
    (title: string, body: string, kind: AppState['notifications'][number]['kind'] = 'info') => {
      const id = crypto.randomUUID();
      setState((prev) => ({
        ...prev,
        notifications: [
          { id, title, body, kind, read: false, createdAt: Date.now() },
          ...prev.notifications,
        ].slice(0, 200),
      }));
      if (latest.current.settings.notificationChime) playNotificationChime();
      if (latest.current.settings.notificationsEnabled && document.visibilityState !== 'visible') {
        window.rm.notify(title, body, latest.current.settings.notificationSound).catch(() => {});
      }
    },
    []
  );

  const addUsage = useCallback((record: Omit<UsageRecord, 'id' | 'createdAt'>) => {
    setState((prev) => ({
      ...prev,
      usage: [{ ...record, id: crypto.randomUUID(), createdAt: Date.now() }, ...prev.usage].slice(0, 5000),
    }));
  }, []);

  const mutateChat = useCallback((chatId: string, fn: (chat: ChatThread) => ChatThread) => {
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => (chat.id === chatId ? { ...fn(chat), updatedAt: Date.now() } : chat)),
    }));
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setState((prev) => {
      const chats = prev.chats.filter((chat) => chat.id !== chatId);
      const threadIds = prev.ui.threadIds.filter((id) => id !== chatId);
      return {
        ...prev,
        chats,
        ui: {
          ...prev.ui,
          selectedChatId: prev.ui.selectedChatId === chatId ? chats[0]?.id || null : prev.ui.selectedChatId,
          threadIds,
          activeThreadId: prev.ui.activeThreadId === chatId ? threadIds[threadIds.length - 1] || null : prev.ui.activeThreadId,
        },
      };
    });
  }, []);

  /** The configured default workspace, if it still exists. */
  const defaultWorkspaceId = () => {
    const id = latest.current.settings.defaultWorkspaceId;
    return id && latest.current.workspaces.some((w) => w.id === id) ? id : null;
  };

  const createChat = useCallback(
    (agentId: string, opts: { workspaceId?: string | null; title?: string; mode?: ChatThread['mode'] } = {}) => {
      const agent = latest.current.agents.find((a) => a.id === agentId) || latest.current.agents[0];
      const chat: ChatThread = {
        id: crypto.randomUUID(),
        agentId,
        workspaceId: opts.workspaceId ?? defaultWorkspaceId() ?? latest.current.ui.selectedWorkspaceId ?? null,
        title: opts.title || 'New chat',
        provider: agent?.engine === 'reversemind' ? 'reversemind' : agent?.engine || 'reversemind',
        model: agent?.model || null,
        mode: opts.mode || 'agent',
        messages: [],
        status: 'idle',
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tabOrder: 0,
      };
      setState((prev) => ({
        ...prev,
        chats: [chat, ...prev.chats],
        ui: {
          ...prev.ui,
          selectedChatId: chat.id,
          threadIds: prev.ui.threadIds.includes(chat.id) ? prev.ui.threadIds : [...prev.ui.threadIds, chat.id].slice(-8),
          activeThreadId: chat.id,
        },
      }));
      return chat;
    },
    []
  );

  const selectedAgent = useCallback(() => {
    return state.agents.find((a) => a.id === state.ui.selectedAgentId) || state.agents[0] || null;
  }, [state.agents, state.ui.selectedAgentId]);

  const selectedWorkspace = useCallback(() => {
    return state.workspaces.find((w) => w.id === state.ui.selectedWorkspaceId) || null;
  }, [state.workspaces, state.ui.selectedWorkspaceId]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.settings.theme;
    root.dataset.accent = state.settings.accent;
  }, [state.settings.theme, state.settings.accent]);

  return (
    <StoreContext.Provider
      value={{
        state,
        getState: () => latest.current,
        setState,
        patchUi,
        toast,
        toasts,
        dismissToast,
        notify,
        addUsage,
        mutateChat,
        deleteChat,
        createChat,
        selectedAgent,
        selectedWorkspace,
        loading,
        info,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider');
  return context;
}

export function messageText(message: ChatMessage): string {
  return message.content || '';
}
