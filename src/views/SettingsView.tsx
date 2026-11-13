import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Check,
  Cpu,
  Database,
  FolderGit2,
  Gauge,
  Info,
  Keyboard,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useStore } from '../store';
import { PROVIDER_OFFLINE } from '../defaults';
import type { McpServer, ProviderConfig, Settings } from '../types';
import { Badge, Button, Field, IconButton, Kbd, LogoMark, Segmented, Select, TextInput, Toggle } from '../components/ui';
import { McpServerModal, McpToolModal, ProviderModal } from '../components/Modals';

const ZOOM_OPTIONS = [90, 100, 110, 125, 150, 175, 200, 225, 250];

const TITLES: Record<string, { title: string; subtitle: string; icon: React.ReactNode }> = {
  general: { title: 'General', subtitle: 'Appearance, files, agents and local data.', icon: <SettingsIcon size={16} /> },
  appearance: { title: 'Appearance', subtitle: 'Theme, accent, scale and editor presentation.', icon: <Palette size={16} /> },
  providers: { title: 'Model providers', subtitle: 'Direct endpoints for hosted models, or stay fully offline.', icon: <Cpu size={16} /> },
  connections: { title: 'Connections', subtitle: 'MCP servers and terminals that extend your agents.', icon: <Plug size={16} /> },
  notifications: { title: 'Notifications', subtitle: 'How ReverseMind tells you when work finishes.', icon: <Bell size={16} /> },
  shortcuts: { title: 'Keyboard shortcuts', subtitle: 'Move through ReverseMind without the mouse.', icon: <Keyboard size={16} /> },
  about: { title: 'About ReverseMind', subtitle: 'A local-first build with no account behind it.', icon: <Info size={16} /> },
};

export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: <SettingsIcon size={14} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { id: 'providers', label: 'Model providers', icon: <Cpu size={14} /> },
  { id: 'connections', label: 'Connections', icon: <Plug size={14} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={14} /> },
  { id: 'about', label: 'About', icon: <Info size={14} /> },
];

export function SettingsView() {
  const { state, setState, info, patchUi, toast } = useStore();
  const tab = TITLES[state.ui.settingsTab] ? state.ui.settingsTab : 'general';
  const meta = TITLES[tab];
  const [providerModal, setProviderModal] = useState(false);
  const [mcpModal, setMcpModal] = useState(false);
  const [testing, setTesting] = useState<McpServer | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const patchSettings = (patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    if (typeof patch.zoom === 'number') {
      window.rm.setZoom(patch.zoom);
      setState((prev) => ({ ...prev, settings: { ...prev.settings, zoomAutoApplied: true } }));
    }
    if (patch.quitBehavior) window.rm.setQuitBehavior(patch.quitBehavior).catch(() => {});
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
      }));
      toast('MCP connected', `${server.name} · ${result.tools.length} tools`, 'success');
    } catch (error) {
      const message = String((error as Error)?.message || error);
      setState((prev) => ({
        ...prev,
        mcpServers: prev.mcpServers.map((item) =>
          item.id === server.id ? { ...item, status: 'error', error: message } : item
        ),
      }));
      toast('MCP connection failed', message, 'error');
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (server: McpServer) => {
    await window.rm.mcp.disconnect(server.id);
    setState((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.map((item) =>
        item.id === server.id ? { ...item, status: 'disconnected', enabled: false } : item
      ),
    }));
    toast('MCP disconnected', server.name, 'info');
  };

  const removeProvider = (provider: ProviderConfig) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        providers: prev.settings.providers.filter((item) => item.id !== provider.id),
        defaultProvider: prev.settings.defaultProvider === provider.id ? PROVIDER_OFFLINE : prev.settings.defaultProvider,
      },
    }));
    toast('Provider removed', provider.name, 'info');
  };

  const accents: { id: Settings['accent']; color: string; label: string }[] = [
    { id: 'violet', color: '#8b5cf6', label: 'Violet' },
    { id: 'teal', color: '#14b8a6', label: 'Teal' },
    { id: 'amber', color: '#f59e0b', label: 'Amber' },
  ];

  return (
    <div className="settings-content" data-testid="settings-view">
      <div className="settings-content-inner">
        <div className="settings-title">
          <span className="settings-title-icon">{meta.icon}</span>
          <div>
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
        </div>

        {tab === 'general' && (
          <>
            <div className="settings-group-title">Application</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Appearance</div>
                  <div className="settings-row-desc">Dark or light. The accent color is shared across both modes.</div>
                </div>
                <div className="settings-row-control">
                  <Segmented
                    value={state.settings.theme}
                    onChange={(theme) => patchSettings({ theme })}
                    options={[
                      { value: 'dark', label: 'Dark' },
                      { value: 'light', label: 'Light' },
                    ]}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Accent</div>
                  <div className="settings-row-desc">Used for focus rings, active tabs and primary actions.</div>
                </div>
                <div className="settings-row-control">
                  <div className="color-row" style={{ margin: 0 }}>
                    {accents.map((accent) => (
                      <button
                        type="button"
                        key={accent.id}
                        className={`color-dot ${state.settings.accent === accent.id ? 'active' : ''}`}
                        style={{ background: accent.color }}
                        title={accent.label}
                        aria-label={accent.label}
                        onClick={() => patchSettings({ accent: accent.id })}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Interface scale</div>
                  <div className="settings-row-desc">Zoom the whole application, including terminals.</div>
                </div>
                <div className="settings-row-control">
                  <Select
                    value={String(state.settings.zoom)}
                    onChange={(value) => patchSettings({ zoom: Number(value) })}
                    testId="settings-zoom"
                  >
                    {ZOOM_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">When closing the window</div>
                  <div className="settings-row-desc">
                    Keep terminals and MCP servers running in the tray, or stop everything and quit.
                  </div>
                </div>
                <div className="settings-row-control">
                  <Select
                    value={state.settings.quitBehavior}
                    onChange={(value) => patchSettings({ quitBehavior: value as Settings['quitBehavior'] })}
                  >
                    <option value="keep">Keep running in the tray</option>
                    <option value="stop">Stop everything and quit</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="settings-group-title">Files and editor</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Auto-save</div>
                  <div className="settings-row-desc">Save editor changes shortly after you stop typing. Ctrl+S always saves now.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle
                    checked={state.settings.autoSave}
                    onChange={(autoSave) => patchSettings({ autoSave })}
                    label="Auto-save"
                    testId="settings-autosave"
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Editor font size</div>
                  <div className="settings-row-desc">Applies to the file editor and diff viewer.</div>
                </div>
                <div className="settings-row-control">
                  <TextInput
                    type="number"
                    min={10}
                    max={22}
                    value={state.settings.editorFontSize}
                    onChange={(event) => patchSettings({ editorFontSize: Number(event.target.value) || 13 })}
                    style={{ width: 78 }}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Wrap long lines</div>
                  <div className="settings-row-desc">Soft-wrap code and diffs at the editor width.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle
                    checked={state.settings.wrapLines}
                    onChange={(wrapLines) => patchSettings({ wrapLines })}
                    label="Wrap long lines"
                  />
                </div>
              </div>
            </div>

            <div className="settings-group-title">Agents</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Default approval</div>
                  <div className="settings-row-desc">Every file write and command waits for approval unless an agent opts into automatic approval.</div>
                </div>
                <div className="settings-row-control">
                  <Select
                    value={state.settings.agentApproval}
                    onChange={(value) => patchSettings({ agentApproval: value as Settings['agentApproval'] })}
                    testId="settings-approval"
                  >
                    <option value="ask">Ask first</option>
                    <option value="auto">Auto-approve</option>
                  </Select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Default model</div>
                  <div className="settings-row-desc">The offline runtime is free and deterministic. Hosted providers call your endpoint directly.</div>
                </div>
                <div className="settings-row-control" style={{ minWidth: 210 }}>
                  <Select
                    value={state.settings.defaultProvider}
                    onChange={(value) => patchSettings({ defaultProvider: value })}
                    testId="settings-default-provider"
                  >
                    <option value={PROVIDER_OFFLINE}>ReverseMind Offline</option>
                    {state.settings.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Default workspace</div>
                  <div className="settings-row-desc">New conversations start with this workspace selected.</div>
                </div>
                <div className="settings-row-control" style={{ minWidth: 210 }}>
                  <Select
                    value={state.settings.defaultWorkspaceId || ''}
                    onChange={(value) => patchSettings({ defaultWorkspaceId: value || null })}
                  >
                    <option value="">None</option>
                    {state.workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div className="settings-group-title">Local data</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">State and workspaces</div>
                  <div className="settings-row-desc mono" style={{ wordBreak: 'break-all' }}>{info?.dataDir || 'Loading local data directory…'}</div>
                </div>
                <div className="settings-row-control">
                  <Button
                    variant="subtle"
                    size="sm"
                    icon={<FolderGit2 size={12} />}
                    onClick={() => info?.dataDir && window.rm.revealPath(info.dataDir)}
                  >
                    Reveal
                  </Button>
                </div>
              </div>
            </div>
            <div className="settings-footer">ReverseMind {info?.version || '0.1.0'} · local-first desktop build · no telemetry</div>
          </>
        )}

        {tab === 'appearance' && (
          <>
            <div className="appearance-preview">
              <div className="appearance-preview-rail">
                <LogoMark size={22} />
                <span />
                <span />
                <span />
              </div>
              <div className="appearance-preview-main">
                <div className="appearance-preview-pill" />
                <div className="appearance-preview-title">Build something that stays on your machine.</div>
                <div className="appearance-preview-line" />
                <div className="appearance-preview-line short" />
                <div className="appearance-preview-card">
                  <Sparkles size={12} />
                  <span>Accent, surfaces and typography follow your choices.</span>
                </div>
              </div>
            </div>
            <div className="settings-group-title">Theme</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Mode</div>
                  <div className="settings-row-desc">A near-black interface for focused work, or a soft light theme.</div>
                </div>
                <div className="settings-row-control">
                  <Segmented
                    value={state.settings.theme}
                    onChange={(theme) => patchSettings({ theme })}
                    options={[
                      { value: 'dark', label: 'Dark' },
                      { value: 'light', label: 'Light' },
                    ]}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Accent color</div>
                  <div className="settings-row-desc">Violet is the ReverseMind default. Teal and amber are included.</div>
                </div>
                <div className="settings-row-control">
                  <div className="color-row" style={{ margin: 0 }}>
                    {accents.map((accent) => (
                      <button
                        type="button"
                        key={accent.id}
                        className={`color-dot ${state.settings.accent === accent.id ? 'active' : ''}`}
                        style={{ background: accent.color }}
                        title={accent.label}
                        aria-label={accent.label}
                        onClick={() => patchSettings({ accent: accent.id })}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Interface scale</div>
                  <div className="settings-row-desc">Everything scales together, including agent avatars and terminal text.</div>
                </div>
                <div className="settings-row-control">
                  <Select
                    value={String(state.settings.zoom)}
                    onChange={(value) => patchSettings({ zoom: Number(value) })}
                    testId="settings-zoom"
                  >
                    {ZOOM_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className="settings-group-title">Code presentation</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Editor font size</div>
                  <div className="settings-row-desc">Monospace text in the editor and diff viewer.</div>
                </div>
                <div className="settings-row-control">
                  <TextInput
                    type="number"
                    min={10}
                    max={22}
                    value={state.settings.editorFontSize}
                    onChange={(event) => patchSettings({ editorFontSize: Number(event.target.value) || 13 })}
                    style={{ width: 78 }}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Wrap lines</div>
                  <div className="settings-row-desc">Keep long lines visible without horizontal scrolling.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle checked={state.settings.wrapLines} onChange={(wrapLines) => patchSettings({ wrapLines })} />
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'providers' && (
          <>
            <div className="settings-group-title">Active model</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Default provider</div>
                  <div className="settings-row-desc">The offline runtime handles anything local. A hosted provider is called only when selected.</div>
                </div>
                <div className="settings-row-control" style={{ minWidth: 220 }}>
                  <Select
                    value={state.settings.defaultProvider}
                    onChange={(value) => patchSettings({ defaultProvider: value })}
                    testId="provider-default"
                  >
                    <option value={PROVIDER_OFFLINE}>ReverseMind Offline</option>
                    {state.settings.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Offline runtime</div>
                  <div className="settings-row-desc">Deterministic local rules. Plans, file edits and commands still require approval.</div>
                </div>
                <div className="settings-row-control">
                  <Badge tone="green" dot>Built in</Badge>
                </div>
              </div>
            </div>
            <div className="settings-group-title">
              <span>Your providers</span>
            </div>
            <div className="settings-card">
              {state.settings.providers.map((provider) => (
                <div className="provider-row" key={provider.id} data-testid={`provider-${provider.id}`}>
                  <span className="provider-icon">
                    {provider.kind === 'anthropic' ? <Sparkles size={15} /> : <Cpu size={15} />}
                  </span>
                  <div className="provider-main">
                    <div className="provider-name">
                      {provider.name}
                      {state.settings.defaultProvider === provider.id && <Badge tone="accent">Default</Badge>}
                    </div>
                    <div className="provider-url">{provider.baseUrl} · {provider.model}</div>
                  </div>
                  <div className="settings-row-control">
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={state.settings.defaultProvider === provider.id}
                      onClick={() => patchSettings({ defaultProvider: provider.id })}
                      testId={`provider-use-${provider.id}`}
                    >
                      {state.settings.defaultProvider === provider.id ? 'In use' : 'Use'}
                    </Button>
                    <IconButton label="Remove provider" onClick={() => removeProvider(provider)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))}
              {state.settings.providers.length === 0 && (
                <div className="empty-state compact">
                  <Cpu size={22} />
                  <h3>No hosted providers</h3>
                  <p>ReverseMind works fully offline. Add an OpenAI-compatible or Anthropic endpoint if you want hosted models.</p>
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setProviderModal(true)} testId="add-provider">
                Add provider
              </Button>
              <span className="spacer" />
              <span className="faint small">Keys stay in the local state file.</span>
            </div>
            <div className="hint-box" style={{ marginTop: 16 }}>
              <ShieldCheck size={12} /> Provider calls are made by the Electron main process directly to the base URL you
              configure. There is no ReverseMind gateway, proxy, account or billing layer in this build.
            </div>
          </>
        )}

        {tab === 'connections' && (
          <>
            <div className="settings-group-title">MCP connections</div>
            <div className="settings-card">
              {state.mcpServers.map((server) => (
                <div className="provider-row" key={server.id} data-testid={`settings-mcp-${server.id}`}>
                  <span className="provider-icon"><Server size={15} /></span>
                  <div className="provider-main">
                    <div className="provider-name">
                      {server.name}
                      <Badge tone={server.status === 'connected' ? 'green' : server.status === 'error' ? 'red' : 'neutral'} dot>
                        {server.status}
                      </Badge>
                    </div>
                    <div className="provider-url mono">{server.command} {server.args.join(' ')}</div>
                    {server.error && <div className="field-error">{server.error}</div>}
                  </div>
                  <div className="settings-row-control">
                    {server.status === 'connected' ? (
                      <>
                        <Button variant="subtle" size="sm" icon={<Wifi size={12} />} onClick={() => setTesting(server)}>
                          Test
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void disconnect(server)}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={connecting === server.id ? <RefreshCw size={12} className="spin" /> : <Plug size={12} />}
                        disabled={connecting === server.id}
                        onClick={() => void connect(server)}
                        testId={`settings-mcp-connect-${server.id}`}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {state.mcpServers.length === 0 && (
                <div className="empty-state compact">
                  <Plug size={22} />
                  <h3>No MCP servers</h3>
                  <p>Add a stdio JSON-RPC server. The bundled test server is at resources/test-mcp-server.mjs.</p>
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setMcpModal(true)} testId="settings-add-mcp">
                Add MCP server
              </Button>
              <span className="spacer" />
              <span className="faint small">{state.mcpServers.reduce((total, server) => total + server.tools.length, 0)} tools loaded</span>
            </div>

            <div className="settings-group-title">Terminal</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Shell override</div>
                  <div className="settings-row-desc">Leave empty to use your login shell. Otherwise enter an absolute path, such as /bin/zsh.</div>
                </div>
                <div className="settings-row-control">
                  <TextInput
                    value={state.settings.terminalShell}
                    placeholder={info?.home ? `${info.home}` : '/bin/bash'}
                    onChange={(event) => patchSettings({ terminalShell: event.target.value })}
                    style={{ width: 210 }}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">PTY host</div>
                  <div className="settings-row-desc">Terminals are real pseudo-terminals spawned by the Electron main process on this machine.</div>
                </div>
                <div className="settings-row-control"><Badge tone="green" dot>Ready</Badge></div>
              </div>
            </div>
            <div className="hint-box" style={{ marginTop: 16 }}>
              <TerminalSquare size={12} /> MCP tools appear to agents as callable actions but still require approval. A
              server process runs only while connected.
            </div>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <div className="settings-group-title">Delivery</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Desktop notifications</div>
                  <div className="settings-row-desc">Show a system notification when a run finishes or an agent needs input while the window is hidden.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle
                    checked={state.settings.notificationsEnabled}
                    onChange={(notificationsEnabled) => patchSettings({ notificationsEnabled })}
                    label="Desktop notifications"
                    testId="settings-notifications"
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Notification sound</div>
                  <div className="settings-row-desc">Play the system sound with each notification.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle
                    checked={state.settings.notificationSound}
                    onChange={(notificationSound) => patchSettings({ notificationSound })}
                    label="Notification sound"
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">In-app chime</div>
                  <div className="settings-row-desc">Play a short chime inside ReverseMind whenever a notification is recorded.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle
                    checked={state.settings.notificationChime}
                    onChange={(notificationChime) => patchSettings({ notificationChime })}
                    label="In-app chime"
                    testId="settings-chime"
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Test notification</div>
                  <div className="settings-row-desc">Confirm the desktop environment accepts notifications. Some Linux sessions require permission.</div>
                </div>
                <div className="settings-row-control">
                  <Button
                    variant="subtle"
                    size="sm"
                    icon={<Bell size={12} />}
                    onClick={() => {
                      window.rm
                        .notify('ReverseMind', 'Desktop notifications are working.', state.settings.notificationSound)
                        .then((result) => {
                          if (result?.ok) toast('Notification sent', 'Check your desktop notification area.', 'success');
                          else toast('Notifications are unavailable', 'This desktop environment does not support system notifications.', 'warning');
                        })
                        .catch((error) => toast('Notification failed', String(error), 'warning'));
                    }}
                  >
                    Send test
                  </Button>
                </div>
              </div>
            </div>

            <div className="settings-group-title">Voice</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Dictation</div>
                  <div className="settings-row-desc">Microphone dictation uses the speech recognition available in the Electron renderer. Unsupported machines show a clear warning instead of failing silently.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle checked={state.settings.voiceEnabled} onChange={(voiceEnabled) => patchSettings({ voiceEnabled })} label="Dictation" />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Send dictation automatically</div>
                  <div className="settings-row-desc">Insert only, or send the completed transcript. Insert-only is safer around other people.</div>
                </div>
                <div className="settings-row-control">
                  <Toggle checked={state.settings.voiceAutoSend} onChange={(voiceAutoSend) => patchSettings({ voiceAutoSend })} label="Send dictation automatically" />
                </div>
              </div>
            </div>
            <div className="hint-box" style={{ marginTop: 16 }}>
              <Bell size={12} /> Notifications are stored locally in the notification centre. ReverseMind does not use a
              push service.
            </div>
          </>
        )}

        {tab === 'shortcuts' && (
          <>
            <div className="settings-group-title">Global</div>
            <div className="settings-card">
              {[
                ['Command palette', '⌘K / Ctrl+K'],
                ['New chat', '⌘N / Ctrl+N'],
                ['New workspace', '⌘⇧N / Ctrl+Shift+N'],
                ['Prompt library drawer', '⌘/ / Ctrl+/'],
                ['Settings', '⌘, / Ctrl+,'],
                ['Close overlays', 'Esc'],
              ].map(([label, keys]) => (
                <div className="settings-row" key={label}>
                  <div className="settings-row-main"><div className="settings-row-title">{label}</div></div>
                  <div className="settings-row-control"><Kbd>{keys}</Kbd></div>
                </div>
              ))}
            </div>
            <div className="settings-group-title">Composer</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Send message</div>
                  <div className="settings-row-desc">Shift+Enter inserts a newline instead of sending.</div>
                </div>
                <div className="settings-row-control"><Kbd>Enter</Kbd></div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Save editor file</div>
                  <div className="settings-row-desc">Immediate save even when auto-save is disabled.</div>
                </div>
                <div className="settings-row-control"><Kbd>⌘S / Ctrl+S</Kbd></div>
              </div>
            </div>
          </>
        )}

        {tab === 'about' && (
          <>
            <div className="about-hero">
              <LogoMark size={46} />
              <div>
                <h2>ReverseMind</h2>
                <p>An independent, local-first coding workspace for Linux. No account, no gateway, no cloud requirement.</p>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <Badge tone="accent">v{info?.version || '0.1.0'}</Badge>
                  <Badge>Electron</Badge>
                  <Badge>React</Badge>
                  <Badge tone="green" dot>Offline ready</Badge>
                </div>
              </div>
            </div>

            <div className="settings-group-title">Not included in this build</div>
            <div className="settings-card">
              {[
                ['Account and sign-in', 'No account is required. ReverseMind opens directly into the workspace.', <Check size={13} />],
                ['Hosted model gateway', 'Model calls go directly from the main process to a provider you configure; the default is a local runtime.', <Check size={13} />],
                ['Credits and billing', 'No credit meter, checkout or remote entitlement exists in this build.', <Check size={13} />],
                ['Cloud workspaces', 'Local folders and your own SSH hosts replace hosted machines.', <Check size={13} />],
                ['Hosted update service', 'Packaging and updates are handled by the local build; no update endpoint is contacted.', <Check size={13} />],
              ].map(([title, body, icon]) => (
                <div className="settings-row" key={String(title)}>
                  <div className="settings-row-main">
                    <div className="settings-row-title">{title}</div>
                    <div className="settings-row-desc">{body}</div>
                  </div>
                  <div className="settings-row-control"><span className="status-ok">{icon}</span></div>
                </div>
              ))}
            </div>

            <div className="settings-group-title">Build information</div>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-main"><div className="settings-row-title">Version</div></div>
                <div className="settings-row-control"><span className="mono small">{info?.version || '0.1.0'}</span></div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main"><div className="settings-row-title">Platform</div></div>
                <div className="settings-row-control"><span className="mono small">{info?.platform || 'linux'}</span></div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main"><div className="settings-row-title">State directory</div></div>
                <div className="settings-row-control"><span className="mono small" style={{ maxWidth: 380, wordBreak: 'break-all' }}>{info?.dataDir || '—'}</span></div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Independent implementation</div>
                  <div className="settings-row-desc">ReverseMind reuses no proprietary source, assets, prompts or branding from any reference application.</div>
                </div>
                <div className="settings-row-control"><Badge tone="green">Original</Badge></div>
              </div>
            </div>
            <div className="settings-footer">
              <Gauge size={11} /> Local-first by design · <Database size={11} /> State stays on this machine · <BookOpen size={11} /> Prompt library included
            </div>
          </>
        )}
      </div>
      {providerModal && <ProviderModal onClose={() => setProviderModal(false)} />}
      {mcpModal && <McpServerModal onClose={() => setMcpModal(false)} />}
      {testing && <McpToolModal server={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
