export type Mode = 'agent' | 'code' | 'thread';
export type ViewName =
  | 'workspace'
  | 'tickets'
  | 'routines'
  | 'plugins'
  | 'skills'
  | 'prompts'
  | 'usage'
  | 'remote'
  | 'settings';

export type AgentEngine =
  | 'reversemind'
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'github-copilot'
  | 'opencode'
  | 'deepseek'
  | 'grok'
  | 'kimi'
  | 'aider'
  | 'terminal';

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  engine: AgentEngine;
  brief: string;
  color: string;
  createdAt: number;
  pinned: boolean;
  memory: string;
  userMemory: string;
  skills: Skill[];
  autopilot: boolean;
  autopilotMaxSteps: number;
  reflectionMode: 'ask' | 'auto' | 'off';
  model: string | null;
  approval: 'ask' | 'auto';
}

export interface SshConfig {
  host: string;
  user: string;
  path: string;
  port?: number;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number;
  pinned: boolean;
  isGit: boolean;
  color: string;
  ssh?: SshConfig;
  kind: 'local' | 'ssh';
}

export type ToolCallKind =
  | 'read_file'
  | 'write_file'
  | 'list_files'
  | 'run_command'
  | 'git_status'
  | 'git_diff'
  | 'git_commit'
  | 'git_stage'
  | 'mcp_tool';

export interface ToolCall {
  id: string;
  kind: ToolCallKind;
  title: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'denied';
  output?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  plan?: string[];
  error?: string;
  /** Produced by a hosted model, so settled tool calls continue the conversation. */
  agentLoop?: boolean;
  /** The user pressed Stop; do not continue after this message's tools settle. */
  loopStopped?: boolean;
}

export interface ChatThread {
  id: string;
  agentId: string;
  workspaceId: string | null;
  title: string;
  provider: string;
  model: string | null;
  mode: 'ask' | 'plan' | 'agent';
  messages: ChatMessage[];
  status: 'idle' | 'running' | 'waiting';
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  tabOrder: number;
}

export type PaneType = 'chat' | 'terminal' | 'editor' | 'browser' | 'git' | 'files';

export interface Pane {
  id: string;
  type: PaneType;
  title: string;
  chatId?: string;
  agentId?: string;
  engine?: string;
  filePath?: string;
  url?: string;
  cwd?: string;
  initialCommand?: string;
  tabs?: string[];
}

export interface WorkspaceLayout {
  workspaceId: string;
  panes: Pane[];
  activePaneId: string | null;
}

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  agentId: string | null;
  workspaceId: string | null;
  labels: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  agentId: string;
  schedule: 'manual' | 'hourly' | 'daily' | 'weekdays';
  time: string;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastResult?: string;
  createdAt: number;
}

export interface Prompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: McpTool[];
  error?: string;
  lastConnectedAt?: number;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  enabled: boolean;
  kind: 'builtin' | 'mcp';
  serverId?: string;
  icon: string;
}

export interface UsageRecord {
  id: string;
  agentId: string;
  chatId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: number;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  kind: 'info' | 'success' | 'warning' | 'error' | 'needs_input';
  read: boolean;
  createdAt: number;
  target?: { chatId?: string; taskId?: string; routineId?: string };
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
  /** USD per million tokens, entered by the user. Costs are estimates either way. */
  inputPricePerM?: number;
  outputPricePerM?: number;
}

export interface Settings {
  theme: 'dark' | 'light';
  accent: 'violet' | 'teal' | 'amber';
  zoom: number;
  zoomAutoApplied: boolean;
  autoSave: boolean;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationChime: boolean;
  voiceEnabled: boolean;
  voiceAutoSend: boolean;
  telemetry: boolean;
  defaultProvider: string;
  providers: ProviderConfig[];
  agentApproval: 'ask' | 'auto';
  defaultWorkspaceId: string | null;
  terminalShell: string;
  quitBehavior: 'keep' | 'stop';
  editorFontSize: number;
  wrapLines: boolean;
}

export interface UiState {
  mode: Mode;
  view: ViewName;
  selectedAgentId: string | null;
  selectedWorkspaceId: string | null;
  selectedChatId: string | null;
  sidebarVisible: boolean;
  settingsTab: string;
  agentInspectorTab: 'chat' | 'memory' | 'skills';
  promptsOpen: boolean;
  notificationsOpen: boolean;
  commandPaletteOpen: boolean;
  threadIds: string[];
  activeThreadId: string | null;
}

export interface AppState {
  version: number;
  settings: Settings;
  agents: Agent[];
  workspaces: Workspace[];
  chats: ChatThread[];
  layouts: WorkspaceLayout[];
  tasks: Task[];
  routines: Routine[];
  prompts: Prompt[];
  plugins: Plugin[];
  mcpServers: McpServer[];
  usage: UsageRecord[];
  notifications: NotificationRecord[];
  ui: UiState;
  browserHistory: { id: string; url: string; title: string; createdAt: number }[];
  createdAt: number;
  updatedAt: number;
}

export const ENGINE_META: Record<
  string,
  { label: string; color: string; command?: string; kind: 'agent' | 'terminal' }
> = {
  'reversemind': { label: 'ReverseMind Agent', color: '#8b5cf6', kind: 'agent' },
  'claude-code': { label: 'Claude Code', color: '#f97316', command: 'claude', kind: 'terminal' },
  'codex': { label: 'Codex', color: '#e2e8f0', command: 'codex', kind: 'terminal' },
  'cursor': { label: 'Cursor Agent', color: '#94a3b8', command: 'cursor-agent', kind: 'terminal' },
  'gemini': { label: 'Gemini CLI', color: '#60a5fa', command: 'gemini', kind: 'terminal' },
  'github-copilot': { label: 'GitHub Copilot', color: '#a78bfa', command: 'copilot', kind: 'terminal' },
  'opencode': { label: 'OpenCode', color: '#34d399', command: 'opencode', kind: 'terminal' },
  'deepseek': { label: 'DeepSeek CLI', color: '#38bdf8', command: 'deepseek', kind: 'terminal' },
  'grok': { label: 'Grok Build', color: '#e5e7eb', command: 'grok', kind: 'terminal' },
  'kimi': { label: 'Kimi Code', color: '#fda4af', command: 'kimi', kind: 'terminal' },
  'aider': { label: 'Aider', color: '#fbbf24', command: 'aider', kind: 'terminal' },
  'terminal': { label: 'Terminal', color: '#94a3b8', kind: 'terminal' },
};
