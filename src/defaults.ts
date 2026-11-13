import type { Agent, AppState, Plugin, Prompt } from './types';

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const PROVIDER_OFFLINE = 'offline';

/**
 * Picks a comfortable interface scale for the primary display. Electron reports
 * display sizes in DIP, so a 4K panel at 100% OS scaling reports ~3840 wide and
 * needs a larger zoom than a 1080p panel or a HiDPI panel at 200%.
 */
export function recommendedZoom(display?: { width: number; height: number }): number {
  if (!display) return 100;
  const longEdge = Math.max(display.width, display.height);
  if (longEdge >= 3000) return 150;
  if (longEdge >= 2200) return 125;
  return 100;
}

export function createAgent(partial: Partial<Agent> = {}): Agent {
  return {
    id: uid(),
    name: 'Nova',
    engine: 'reversemind',
    brief: 'A local-first builder that plans, edits files and runs commands.',
    color: '#8b5cf6',
    createdAt: now(),
    pinned: true,
    memory: '',
    userMemory: '',
    skills: [],
    autopilot: false,
    autopilotMaxSteps: 3,
    reflectionMode: 'ask',
    model: null,
    approval: 'ask',
    ...partial,
  };
}

export function createDefaultState(): AppState {
  const agent = createAgent();
  const builtinPlugins: Plugin[] = [
    {
      id: 'plugin-files',
      name: 'Workspace Files',
      description: 'Read, write, search and organize files in local workspaces.',
      author: 'ReverseMind',
      enabled: true,
      kind: 'builtin',
      icon: 'folder',
    },
    {
      id: 'plugin-git',
      name: 'Git Review',
      description: 'Diffs, staging, commits, branches and worktrees for every workspace.',
      author: 'ReverseMind',
      enabled: true,
      kind: 'builtin',
      icon: 'git',
    },
    {
      id: 'plugin-terminal',
      name: 'Terminal Host',
      description: 'Persistent PTY terminals shared by agents and panes.',
      author: 'ReverseMind',
      enabled: true,
      kind: 'builtin',
      icon: 'terminal',
    },
    {
      id: 'plugin-browser',
      name: 'Browser Threads',
      description: 'Embedded browser panes with page reading and history.',
      author: 'ReverseMind',
      enabled: true,
      kind: 'builtin',
      icon: 'globe',
    },
    {
      id: 'plugin-tasks',
      name: 'Task Board',
      description: 'Plan, assign and dispatch tasks to agents.',
      author: 'ReverseMind',
      enabled: true,
      kind: 'builtin',
      icon: 'kanban',
    },
  ];
  const samplePrompts: Prompt[] = [
    {
      id: 'prompt-review',
      title: 'Review my changes',
      body: 'Review the current diff like a senior engineer. List the riskiest changes first, then concrete fixes. Do not rewrite unrelated code.',
      tags: ['review', 'git'],
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'prompt-plan',
      title: 'Plan before coding',
      body: 'Write a short plan with acceptance criteria and file-level steps. Wait for my approval before changing anything.',
      tags: ['plan'],
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'prompt-test',
      title: 'Add regression tests',
      body: 'Find the untested behavior in the files we just changed and add focused regression tests. Run them and report the result.',
      tags: ['tests'],
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  return {
    version: 1,
    settings: {
      theme: 'dark',
      accent: 'violet',
      zoom: 100,
      zoomAutoApplied: false,
      autoSave: true,
      notificationsEnabled: true,
      notificationSound: false,
      notificationChime: false,
      voiceEnabled: true,
      voiceAutoSend: false,
      telemetry: false,
      defaultProvider: PROVIDER_OFFLINE,
      providers: [],
      agentApproval: 'ask',
      defaultWorkspaceId: null,
      terminalShell: '',
      quitBehavior: 'keep',
      editorFontSize: 13,
      wrapLines: true,
    },
    agents: [agent],
    workspaces: [],
    chats: [],
    layouts: [],
    tasks: [],
    routines: [],
    prompts: samplePrompts,
    plugins: builtinPlugins,
    mcpServers: [],
    usage: [],
    notifications: [
      {
        id: uid(),
        title: 'Welcome to ReverseMind',
        body: 'Create a workspace, pick an agent and start building. Everything stays on this machine.',
        kind: 'info',
        read: false,
        createdAt: now(),
      },
    ],
    ui: {
      mode: 'agent',
      view: 'workspace',
      selectedAgentId: agent.id,
      selectedWorkspaceId: null,
      selectedChatId: null,
      sidebarVisible: true,
      settingsTab: 'general',
      agentInspectorTab: 'chat',
      promptsOpen: false,
      notificationsOpen: false,
      commandPaletteOpen: false,
      threadIds: [],
      activeThreadId: null,
    },
    browserHistory: [],
    createdAt: now(),
    updatedAt: now(),
  };
}
