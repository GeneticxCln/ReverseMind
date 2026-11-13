import type { Pane, Workspace } from './types';
import { ENGINE_META } from './types';
import { shellQuote, validateSshConfig } from './ssh';


export function remoteCommand(workspace: Workspace, command?: string): string {
  const ssh = workspace.ssh;
  if (!ssh) return command || '';
  if (validateSshConfig(ssh)) return 'echo "Invalid SSH settings for this workspace"';
  const port = ssh.port ? ` -p ${ssh.port}` : '';
  const inner = command ? `cd ${shellQuote(ssh.path)} && exec ${command}` : `cd ${shellQuote(ssh.path)} && exec bash -l`;
  return `ssh -t${port} -- ${shellQuote(`${ssh.user}@${ssh.host}`)} ${shellQuote(inner)}`;
}

/** Builds a terminal pane that runs the given CLI engine in the workspace. */
export function engineTerminalPane(engine: string, workspace: Workspace): Pane | null {
  const meta = ENGINE_META[engine];
  if (!meta?.command) return null;
  return {
    id: crypto.randomUUID(),
    type: 'terminal',
    title: meta.label,
    engine,
    initialCommand: remoteCommand(workspace, meta.command),
    cwd: workspace.path,
  };
}
