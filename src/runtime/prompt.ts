import type { Agent, AppState, ChatThread, Workspace } from '../types';
import { mcpToolContext } from './tools';

export function buildSystemPrompt(state: AppState, chat: ChatThread, agent: Agent, workspace: Workspace | null): string {
  const modeRules =
    chat.mode === 'ask'
      ? 'Mode: Ask. You may only use read-only tools (read_file, list_files, git_status, git_diff). Do not write files, run commands, stage or commit, or call MCP tools.'
      : chat.mode === 'plan'
        ? 'Mode: Plan. You have no tools. Return a concise numbered plan with acceptance criteria and file-level steps.'
        : 'Mode: Agent. Use the provided tools to act on the workspace. The user approves each action unless auto-approval is on, and you receive each result before continuing.';
  const loopRules =
    chat.mode === 'plan'
      ? ''
      : 'Work step by step: inspect before editing, run tests or checks when useful, and stop calling tools once the task is done. Finish with a short summary of what changed.';
  return [
    agent.brief,
    agent.memory ? `Agent memory:\n${agent.memory}` : '',
    agent.userMemory ? `User notes:\n${agent.userMemory}` : '',
    ...agent.skills.filter((s) => s.enabled).map((s) => `Skill ${s.name}:\n${s.body}`),
    workspace ? `Workspace: ${workspace.name} at ${workspace.path}` : 'No workspace is selected, so tools that need one will fail.',
    modeRules,
    loopRules,
    chat.mode === 'agent' ? mcpToolContext(state) : '',
    'Keep prose concise.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
