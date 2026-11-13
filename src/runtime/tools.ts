import type { AppState, ChatThread, ToolCall, ToolCallKind, Workspace } from '../types';
import { toolAllowed } from '../plugins';
import type { ProviderToolDef } from './provider';

export const READ_ONLY_TOOLS = new Set<ToolCallKind>(['read_file', 'list_files', 'git_status', 'git_diff']);
export const TOOL_KINDS = new Set<string>([
  'read_file',
  'write_file',
  'list_files',
  'run_command',
  'git_status',
  'git_diff',
  'git_commit',
  'git_stage',
  'mcp_tool',
]);

/** Ask is read-only, Plan proposes without acting, and Agent may use any allowed tool. */
export function modeAllowsTool(mode: ChatThread['mode'], kind: ToolCallKind): boolean {
  if (mode === 'agent') return true;
  if (mode === 'plan') return false;
  return READ_ONLY_TOOLS.has(kind);
}

export function mcpToolContext(state: AppState): string {
  const lines: string[] = [];
  let omitted = 0;
  for (const server of state.mcpServers) {
    if (!server.enabled || server.status !== 'connected') continue;
    const plugin = state.plugins.find((item) => item.kind === 'mcp' && item.serverId === server.id);
    if (plugin && !plugin.enabled) continue;
    for (const tool of server.tools) {
      if (lines.length >= 40) {
        omitted += 1;
        continue;
      }
      let schema = '{}';
      try {
        schema = JSON.stringify(tool.inputSchema ?? {});
      } catch {
        schema = '{}';
      }
      if (schema.length > 1200) schema = `${schema.slice(0, 1200)}…`;
      const description = (tool.description || 'No description').replace(/\s+/g, ' ').trim();
      lines.push(`- serverId ${server.id} · ${server.name} · ${tool.name}: ${description} · args ${schema}`);
    }
  }
  if (!lines.length) return '';
  return [
    'MCP tools available on connected servers. Call one with the mcp_tool tool, passing serverId, tool and args:',
    ...lines,
    omitted ? `(${omitted} more MCP tools omitted to keep context bounded.)` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function toolKindLabel(kind: ToolCallKind): string {
  switch (kind) {
    case 'read_file':
      return 'Read file';
    case 'write_file':
      return 'Write file';
    case 'list_files':
      return 'List files';
    case 'run_command':
      return 'Run command';
    case 'git_status':
      return 'Git status';
    case 'git_diff':
      return 'Git diff';
    case 'git_commit':
      return 'Git commit';
    case 'git_stage':
      return 'Git stage';
    case 'mcp_tool':
      return 'MCP tool';
    default:
      return String(kind);
  }
}

export function makeTool(kind: ToolCallKind, title: string, args: Record<string, unknown>, id?: string): ToolCall {
  return { id: id || crypto.randomUUID(), kind, title, args, status: 'pending' };
}

export function toolTitle(kind: ToolCallKind, args: Record<string, unknown>): string {
  if (kind === 'write_file') return `Write ${args.path ?? ''}`;
  if (kind === 'read_file') return `Read ${args.path ?? ''}`;
  if (kind === 'run_command') return `Run: ${args.command ?? ''}`;
  if (kind === 'git_stage') return `Stage ${args.path ?? ''}`;
  if (kind === 'git_commit') return `Commit: ${args.message ?? ''}`;
  if (kind === 'mcp_tool') return `MCP: ${args.tool ?? ''}`;
  return toolKindLabel(kind);
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

const ALL_TOOLS: ProviderToolDef[] = [
  {
    name: 'read_file',
    description: 'Read a text file inside the workspace. Paths are relative to the workspace root.',
    input_schema: obj({ path: { type: 'string' } }, ['path']),
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a text file inside the workspace with the full new contents.',
    input_schema: obj({ path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  },
  { name: 'list_files', description: 'List files and folders in the workspace.', input_schema: obj({}) },
  {
    name: 'run_command',
    description: 'Run a shell command in the workspace root with bash and return stdout, stderr and the exit code.',
    input_schema: obj({ command: { type: 'string' } }, ['command']),
  },
  { name: 'git_status', description: 'Show the current branch and changed files.', input_schema: obj({}) },
  { name: 'git_diff', description: 'Show the unstaged diff of the working tree.', input_schema: obj({}) },
  {
    name: 'git_stage',
    description: 'Stage a file (or "." for everything) for the next commit.',
    input_schema: obj({ path: { type: 'string' } }, ['path']),
  },
  {
    name: 'git_commit',
    description:
      'Commit what is staged. Pass "paths" to stage specific files first. Fails if nothing is staged.',
    input_schema: obj({ message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } }, ['message']),
  },
  {
    name: 'mcp_tool',
    description: 'Call a tool on a connected MCP server listed in the system prompt.',
    input_schema: obj(
      { serverId: { type: 'string' }, tool: { type: 'string' }, args: { type: 'object' } },
      ['serverId', 'tool']
    ),
  },
];

/** Native tool definitions for the model, filtered by chat mode and plugin gating. */
export function toolDefinitions(state: AppState, mode: ChatThread['mode']): ProviderToolDef[] {
  const hasMcp = mcpToolContext(state) !== '';
  return ALL_TOOLS.filter((tool) => {
    const kind = tool.name as ToolCallKind;
    if (!modeAllowsTool(mode, kind)) return false;
    if (kind === 'mcp_tool') return hasMcp;
    return toolAllowed(state.plugins, kind);
  });
}

export async function executeTool(workspace: Workspace | null, call: ToolCall): Promise<{ output: string; error?: string }> {
  if (!workspace) return { output: '', error: 'No workspace selected' };
  const root = workspace.path;
  try {
    if (call.kind === 'write_file') {
      const path = String(call.args.path || '');
      const content = String(call.args.content ?? '');
      const res = await window.rm.fs.write(root, path, content);
      return { output: `Wrote ${res.path} (${formatBytes(content.length)})` };
    }
    if (call.kind === 'read_file') {
      const path = String(call.args.path || '');
      const res = await window.rm.fs.read(root, path);
      if (res.binary) return { output: '', error: `${path} is a binary file (${formatBytes(res.size)})` };
      return { output: `${path}\n\n${res.content.slice(0, 20000)}` };
    }
    if (call.kind === 'list_files') {
      const res = await window.rm.fs.tree(root);
      const flat: string[] = [];
      const walk = (nodes: any[], prefix = '') => {
        for (const node of nodes) {
          flat.push(`${prefix}${node.name}${node.type === 'directory' ? '/' : ''}`);
          if (node.children) walk(node.children, `${prefix}${node.name}/`);
        }
      };
      walk(res.entries);
      return { output: flat.slice(0, 400).join('\n') };
    }
    if (call.kind === 'run_command') {
      const res = await window.rm.shell.run(root, String(call.args.command || ''), 120000);
      const output = [
        `$ ${call.args.command}`,
        res.stdout.trim(),
        res.stderr.trim() ? `stderr:\n${res.stderr.trim()}` : '',
        `exit code: ${res.code} · ${res.durationMs}ms`,
      ]
        .filter(Boolean)
        .join('\n');
      return { output, error: res.code === 0 ? undefined : `Command exited with code ${res.code}` };
    }
    if (call.kind === 'git_status') {
      const status = await window.rm.git.status(root);
      if (!status.isRepo) return { output: '', error: 'This workspace is not a Git repository' };
      const lines = (status.files as { staged: boolean; untracked: boolean; path: string }[]).map(
        (f) => `${f.staged ? 'staged' : f.untracked ? 'new' : 'modified'}  ${f.path}`
      );
      return { output: `branch: ${status.branch}\n${lines.join('\n') || 'working tree clean'}` };
    }
    if (call.kind === 'git_diff') {
      const diff = await window.rm.git.diff(root);
      return { output: diff.slice(0, 60000) || 'No unstaged changes' };
    }
    if (call.kind === 'git_commit') {
      const message = String(call.args.message || 'Update workspace');
      const paths = Array.isArray(call.args.paths) ? call.args.paths.map(String) : [];
      for (const path of paths) {
        const staged = await window.rm.git.stage(root, path);
        if (!staged.ok) return { output: staged.output, error: `Could not stage ${path}` };
      }
      if (call.args.all === true) {
        const all = await window.rm.shell.run(root, 'git add -A', 30000);
        if (all.code !== 0) return { output: all.stdout + all.stderr, error: 'Could not stage files' };
      }
      const status = await window.rm.git.status(root);
      if (!status.isRepo) return { output: '', error: 'This workspace is not a Git repository' };
      if (!(status.files as { staged: boolean }[]).some((f) => f.staged)) {
        return { output: '', error: 'Nothing is staged. Stage files with git_stage, or pass "paths".' };
      }
      const res = await window.rm.git.commit(root, message);
      return { output: res.output, error: res.ok ? undefined : 'Commit failed' };
    }
    if (call.kind === 'git_stage') {
      const res = await window.rm.git.stage(root, String(call.args.path || '.'));
      return { output: res.output || 'Staged', error: res.ok ? undefined : 'Stage failed' };
    }
    if (call.kind === 'mcp_tool') {
      const res = await window.rm.mcp.call(
        String(call.args.serverId || ''),
        String(call.args.tool || ''),
        (call.args.args as Record<string, unknown>) || {}
      );
      return { output: res.text };
    }
    return { output: '', error: `Unsupported tool ${call.kind}` };
  } catch (error) {
    return { output: '', error: String((error as Error)?.message || error) };
  }
}
