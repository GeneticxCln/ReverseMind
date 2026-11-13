import React, { useState } from 'react';
import {
  Boxes,
  Folder,
  GitBranch,
  Globe,
  KanbanSquare,
  Plug,
  Plus,
  RefreshCw,
  Settings2,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import { useStore } from '../store';
import type { McpServer, Plugin } from '../types';
import { Badge, Button, IconButton, Toggle } from '../components/ui';
import { McpServerModal, McpToolModal } from '../components/Modals';

function PluginIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  if (icon === 'git') return <GitBranch size={size} />;
  if (icon === 'terminal') return <TerminalSquare size={size} />;
  if (icon === 'globe') return <Globe size={size} />;
  if (icon === 'kanban') return <KanbanSquare size={size} />;
  if (icon === 'plug') return <Plug size={size} />;
  return <Folder size={size} />;
}

export function PluginsView() {
  const { state, setState, toast, patchUi } = useStore();
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<McpServer | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const toggle = (plugin: Plugin, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      plugins: prev.plugins.map((item) => (item.id === plugin.id ? { ...item, enabled } : item)),
      mcpServers: prev.mcpServers.map((server) => (server.id === plugin.serverId ? { ...server, enabled } : server)),
    }));
  };

  const connect = async (server: McpServer) => {
    setConnecting(server.id);
    try {
      const result = await window.rm.mcp.connect(server);
      setState((prev) => ({
        ...prev,
        mcpServers: prev.mcpServers.map((item) =>
          item.id === server.id
            ? { ...item, status: 'connected', tools: result.tools, error: undefined, lastConnectedAt: Date.now(), enabled: true }
            : item
        ),
        plugins: prev.plugins.map((item) => (item.serverId === server.id ? { ...item, enabled: true } : item)),
      }));
      toast('MCP connected', `${server.name} · ${result.tools.length} tools`, 'success');
    } catch (error) {
      setState((prev) => ({
        ...prev,
        mcpServers: prev.mcpServers.map((item) =>
          item.id === server.id ? { ...item, status: 'error', error: String((error as Error)?.message || error) } : item
        ),
      }));
      toast('MCP connection failed', String((error as Error)?.message || error), 'error');
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (server: McpServer) => {
    await window.rm.mcp.disconnect(server.id);
    setState((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.map((item) => (item.id === server.id ? { ...item, status: 'disconnected' } : item)),
    }));
    toast('MCP disconnected', server.name, 'info');
  };

  return (
    <div className="page" data-testid="plugins-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Plugins</h1>
          <p>Local capabilities and MCP connections available to your agents.</p>
        </div>
        <div className="page-head-actions">
          <Button variant="subtle" size="sm" icon={<Settings2 size={13} />} onClick={() => patchUi({ view: 'settings', settingsTab: 'connections' })}>
            Settings
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)} testId="add-plugin">
            Add MCP server
          </Button>
        </div>
      </div>
      <div className="page-body">
        <div className="page-section">
          <h2>Built-in capabilities</h2>
          <p className="section-note">These are implemented by ReverseMind itself. Turn one off to remove it from agent tools.</p>
          <div className="tile-grid">
            {state.plugins
              .filter((plugin) => plugin.kind === 'builtin')
              .map((plugin) => (
                <div className="tile" key={plugin.id} data-testid={`plugin-${plugin.id}`}>
                  <div className="tile-head">
                    <span className="tile-icon">
                      <PluginIcon icon={plugin.icon} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tile-title">{plugin.name}</div>
                      <div className="tile-sub">{plugin.author}</div>
                    </div>
                    <span className="spacer" />
                    <Toggle checked={plugin.enabled} onChange={(enabled) => toggle(plugin, enabled)} label={plugin.name} />
                  </div>
                  <p>{plugin.description}</p>
                  <div className="tile-foot">
                    <Badge tone={plugin.enabled ? 'green' : 'neutral'} dot>
                      {plugin.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <span className="spacer" />
                    <Badge tone="accent">local</Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="page-section">
          <h2>MCP connections</h2>
          <p className="section-note">Stdio JSON-RPC servers. Tool lists are loaded when you connect, and every call executes on this machine.</p>
          {state.mcpServers.length === 0 ? (
            <div className="hint-box">
              No MCP servers connected. Add the bundled test server with command <span className="mono">node</span> and
              argument <span className="mono">resources/test-mcp-server.mjs</span>.
              <div style={{ marginTop: 10 }}>
                <Button variant="primary" size="sm" icon={<Plug size={13} />} onClick={() => setAdding(true)}>
                  Add your first connection
                </Button>
              </div>
            </div>
          ) : (
            <div className="list-stack">
              {state.mcpServers.map((server) => (
                <div className="list-row" key={server.id} data-testid={`mcp-server-${server.id}`}>
                  <span className="tile-icon" style={{ width: 30, height: 30 }}>
                    <Plug size={15} />
                  </span>
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {server.name}
                      <Badge tone={server.status === 'connected' ? 'green' : server.status === 'error' ? 'red' : 'neutral'} dot>
                        {server.status}
                      </Badge>
                    </div>
                    <div className="list-row-sub mono">{server.command} {server.args.join(' ')}</div>
                    <div className="list-row-meta">
                      {server.tools.length > 0 ? `${server.tools.length} tools · ${server.tools.map((tool) => tool.name).join(', ')}` : 'No tools loaded'}
                      {server.error ? ` · ${server.error}` : ''}
                    </div>
                  </div>
                  <div className="list-row-actions">
                    {server.status === 'connected' ? (
                      <>
                        <Button variant="subtle" size="sm" icon={<Wrench size={12} />} onClick={() => setTesting(server)} data-testid={`mcp-test-${server.id}`}>
                          Test
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void disconnect(server)} data-testid={`mcp-disconnect-${server.id}`}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={connecting === server.id ? <RefreshCw size={12} className="spin" /> : <Plug size={12} />}
                        onClick={() => void connect(server)}
                        disabled={connecting === server.id}
                        testId={`mcp-connect-${server.id}`}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-section">
          <h2>How plugins work</h2>
          <div className="hint-box">
            <Boxes size={12} /> Built-ins cover files, Git, terminals, browser threads and the ticket board. MCP servers
            extend agents with extra tools — they are never installed from a marketplace and never run without your
            explicit command configuration.
          </div>
        </div>
      </div>
      {adding && <McpServerModal onClose={() => setAdding(false)} />}
      {testing && <McpToolModal server={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
