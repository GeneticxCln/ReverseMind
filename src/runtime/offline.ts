import type { Agent, ChatThread, ToolCall, ToolCallKind, Workspace } from '../types';
import { makeTool, modeAllowsTool } from './tools';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function detectWrite(prompt: string): { path: string; content: string } | null {
  const patterns = [
    /(?:create|write|make|add|save)\s+(?:a\s+)?(?:new\s+)?file\s+(?:called\s+|named\s+)?[`"']?([^\s`"']+)[`"']?\s+(?:with\s+(?:the\s+)?content|containing|that\s+(?:says|contains)|with)\s*[:\-]?\s*([\s\S]+)/i,
    /write\s+([\s\S]+?)\s+(?:to|into)\s+(?:the\s+)?(?:file\s+)?[`"']?([^\s`"']+)[`"']?$/i,
  ];
  const m = prompt.match(patterns[0]);
  if (m) return { path: m[1].replace(/[.,;]$/, ''), content: stripQuotes(m[2].replace(/[.\s]+$/, '')) };
  const m2 = prompt.match(patterns[1]);
  if (m2) return { path: m2[2], content: stripQuotes(m2[1]) };
  return null;
}

function detectCommand(prompt: string): string | null {
  const m =
    prompt.match(/(?:run|execute)\s+(?:the\s+)?(?:command\s+)?[`"']([^`"']+)[`"']/i) ||
    prompt.match(/(?:run|execute)\s+(?:the\s+)?command\s*[:\-]?\s*([^\n]+)/i) ||
    prompt.match(/^\s*!\s*([^\n]+)/);
  if (!m) return null;
  return m[1].trim().replace(/[.\s]+$/, '');
}

function detectRead(prompt: string): string | null {
  const m = prompt.match(/(?:read|open|show)\s+(?:the\s+)?(?:file\s+)?[`"']?([^\s`"']+)[`"']?/i);
  if (m && /(?:file|read|open|show)/i.test(prompt)) return m[1];
  return null;
}

export function buildOfflineReply(
  prompt: string,
  agent: Agent,
  workspace: Workspace | null,
  mode: ChatThread['mode'],
  canUse: (kind: ToolCallKind) => boolean = () => true
): { content: string; tools: ToolCall[]; plan?: string[]; followUp?: string } {
  const tools: ToolCall[] = [];
  const allowTool = (kind: ToolCallKind) => modeAllowsTool(mode, kind) && canUse(kind);
  const wantsPlan = mode === 'plan' || /(?:^|\b)(plan|break (?:this|it) down|acceptance criteria|roadmap)\b/i.test(prompt);

  if (/what can you do|capabilities|help me get started|how do you work/i.test(prompt)) {
    return {
      content: [
        'I’m a local-first coding agent. I can:',
        '',
        '- Read and search files in the selected workspace',
        '- Create or edit files (with your approval, unless you switch to automatic)',
        '- Run shell commands and show the exact output',
        '- Review Git diffs, stage files and commit changes',
        '- Use MCP tools you connect in **Settings → Connections**',
        '- Keep memory and skills per agent so context survives restarts',
        '',
        'Try: **“Create a file named NOTES.md with content Hello from ReverseMind”** or **“Run the command npm test”**.',
      ].join('\n'),
      tools: [],
    };
  }

  if (wantsPlan) {
    const plan = [
      'Confirm the goal and edge cases with the current codebase in mind.',
      'Map the files and interfaces that need to change.',
      'Implement the smallest vertical slice and keep the diff reviewable.',
      'Run focused tests plus a manual smoke check.',
      'Summarize the result, risks and follow-ups.',
    ];
    return {
      content: [
        `I can own this end to end, ${agent.name} style. A plan I’d be comfortable executing:`,
        '',
        ...plan.map((step, i) => `${i + 1}. ${step}`),
        '',
        workspace
          ? `I have **${workspace.name}** selected and can start with the first step whenever you say go.`
          : 'Pick or create a workspace first so I can read the code and make real edits.',
        mode === 'plan' ? '\n_Plan mode only plans. Switch to Agent mode when you want me to execute._' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      tools: [],
      plan,
    };
  }

  const write = detectWrite(prompt);
  if (write && allowTool('write_file')) {
    tools.push(makeTool('write_file', `Write ${write.path}`, { path: write.path, content: write.content }));
  }
  const command = detectCommand(prompt);
  if (command && allowTool('run_command')) tools.push(makeTool('run_command', `Run: ${command}`, { command }));

  if (!tools.length && allowTool('git_status') && /git status|what changed|working tree|uncommitted/i.test(prompt)) {
    tools.push(makeTool('git_status', 'Inspect Git status', {}));
  }
  if (!tools.length && allowTool('git_diff') && /review (?:the )?(?:diff|changes)|show (?:the )?diff/i.test(prompt)) {
    tools.push(makeTool('git_diff', 'Read working tree diff', {}));
  }
  if (!tools.length && allowTool('git_commit') && /commit (?:the )?(?:changes|work)|make a commit/i.test(prompt)) {
    const message =
      prompt.match(/(?:message|msg)\s*[:\-]?\s*["']?([^"'\n]+)["']?/i)?.[1] ||
      prompt.match(/commit\s+(?:the\s+)?(?:changes|work)\s+(?:as|with)?\s*["']?([^"'\n]+)["']?/i)?.[1] ||
      'Update workspace';
    tools.push(makeTool('git_commit', `Commit: ${message}`, { message: message.trim(), all: true }));
  }
  if (!tools.length && allowTool('list_files') && /list (?:the )?(?:files|tree)|show (?:me )?(?:the )?files/i.test(prompt)) {
    tools.push(makeTool('list_files', 'List workspace files', {}));
  }
  if (!tools.length && allowTool('read_file') && /read|explain|open/i.test(prompt)) {
    const file = detectRead(prompt);
    if (file) tools.push(makeTool('read_file', `Read ${file}`, { path: file }));
  }

  if (tools.length) {
    const lines = tools.map((tool, i) => `${i + 1}. ${tool.title}`);
    return {
      content: [
        `Here is what I'd do${workspace ? ` in **${workspace.name}**` : ''}:`,
        '',
        ...lines,
        '',
        agent.approval === 'auto'
          ? 'Approval is set to automatic, so I’ll run these now.'
          : agent.autopilot
            ? `Autopilot is on, so I’ll run up to ${Math.max(1, agent.autopilotMaxSteps)} of these now and ask before anything beyond that.`
            : 'Approve the actions below and I’ll execute them. Nothing touches your files until you approve.',
      ].join('\n'),
      tools,
    };
  }

  return {
    content: [
      `I’m ready to work on this${workspace ? ` in **${workspace.name}**` : ''}.`,
      '',
      'Here’s how I read the request:',
      '',
      `> ${prompt.split('\n')[0].slice(0, 220)}`,
      '',
      workspace
        ? 'I can inspect the workspace, propose a plan, edit files or run a command. Tell me which path you want, or ask me to go ahead.'
        : 'Create or select a workspace first, then I can inspect the code and take real actions instead of guessing.',
      mode === 'ask' ? '\n_Ask mode is read-only. Switch to Agent mode to make changes._' : '',
      '',
      '_Offline runtime is active. Configure a provider in Settings → Providers to use a hosted model._',
    ]
      .filter(Boolean)
      .join('\n'),
    tools: [],
  };
}

