import { useEffect, useRef } from 'react';
import { useStore } from './store';
import type { McpTool } from './types';

/**
 * Keeps MCP server status in sync with the main process, and reconnects enabled servers once at startup.
 * Mount this once, high in the tree.
 */
export function useMcpSync() {
  const { setState, getState, loading, toast } = useStore();
  const started = useRef(false);

  useEffect(() => {
    return window.rm.onEvent((raw: unknown) => {
      const e = raw as { event?: string; payload?: { id: string; status: string; tools?: McpTool[]; error?: string } };
      if (e?.event !== 'mcp:status' || !e.payload) return;
      const { id, status, tools, error } = e.payload;
      setState((prev) => ({
        ...prev,
        mcpServers: prev.mcpServers.map((server) =>
          server.id === id
            ? {
                ...server,
                status: status as typeof server.status,
                error: status === 'error' ? error : undefined,
                tools: tools ?? server.tools,
                lastConnectedAt: status === 'connected' ? Date.now() : server.lastConnectedAt,
              }
            : server
        ),
      }));
    });
  }, [setState]);

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    const servers = getState().mcpServers.filter((server) => server.enabled);
    if (!servers.length) return;
    void Promise.allSettled(servers.map((server) => window.rm.mcp.connect(server))).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) toast('Some MCP servers did not start', `${failed} of ${servers.length} failed. See Plugins for details.`, 'warning');
    });
  }, [loading, getState, toast]);
}
