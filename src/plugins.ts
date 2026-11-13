import type { Plugin, ToolCallKind } from './types';

const TOOL_PLUGINS: Partial<Record<ToolCallKind, string>> = {
  read_file: 'plugin-files',
  write_file: 'plugin-files',
  list_files: 'plugin-files',
  git_status: 'plugin-git',
  git_diff: 'plugin-git',
  git_stage: 'plugin-git',
  git_commit: 'plugin-git',
  run_command: 'plugin-terminal',
};

/** The plugin record for an MCP server, if one has been created. */
export function pluginForMcpServer(plugins: Plugin[], serverId: string): Plugin | null {
  if (!serverId) return null;
  return plugins.find((plugin) => plugin.kind === 'mcp' && plugin.serverId === serverId) || null;
}

/** The plugin that owns a tool call, if any. */
export function pluginForTool(
  plugins: Plugin[],
  kind: ToolCallKind,
  args: Record<string, unknown> = {}
): Plugin | null {
  if (kind === 'mcp_tool') return pluginForMcpServer(plugins, String(args.serverId || ''));
  const id = TOOL_PLUGINS[kind];
  if (!id) return null;
  return plugins.find((plugin) => plugin.id === id) || null;
}

/** Missing plugin records are allowed so older state files keep their tools. */
export function toolAllowed(
  plugins: Plugin[],
  kind: ToolCallKind,
  args: Record<string, unknown> = {}
): boolean {
  const plugin = pluginForTool(plugins, kind, args);
  return !plugin || plugin.enabled;
}
