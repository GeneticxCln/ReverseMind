import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  X,
  Clock,
  FileText,
  PencilLine,
  FolderTree,
  TerminalSquare,
  GitBranch,
  GitCommitHorizontal,
  Plug,
  Copy,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import type { Agent, ChatMessage, ToolCall } from '../types';
import { AgentAvatar, Badge, Button, IconButton, Spinner } from './ui';
import { formatBytes, toolKindLabel } from '../agent';

function ToolIcon({ kind }: { kind: ToolCall['kind'] }) {
  if (kind === 'read_file') return <FileText size={12} />;
  if (kind === 'write_file') return <PencilLine size={12} />;
  if (kind === 'list_files') return <FolderTree size={12} />;
  if (kind === 'run_command') return <TerminalSquare size={12} />;
  if (kind === 'git_status') return <GitBranch size={12} />;
  if (kind === 'git_diff') return <GitBranch size={12} />;
  if (kind === 'git_commit') return <GitCommitHorizontal size={12} />;
  if (kind === 'mcp_tool') return <Plug size={12} />;
  return <ShieldCheck size={12} />;
}

function toolStatusLabel(status: ToolCall['status']) {
  if (status === 'pending') return 'Needs approval';
  if (status === 'running') return 'Running';
  if (status === 'done') return 'Done';
  if (status === 'error') return 'Failed';
  return 'Denied';
}

export function ToolCard({
  tool,
  onApprove,
  onDeny,
  busy,
}: {
  tool: ToolCall;
  onApprove: () => void;
  onDeny: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const args = tool.args || {};
  const primaryArg =
    tool.kind === 'write_file'
      ? String(args.path || '')
      : tool.kind === 'run_command'
        ? String(args.command || '')
        : tool.kind === 'read_file'
          ? String(args.path || '')
          : tool.kind === 'mcp_tool'
            ? `${args.serverId || ''}/${args.tool || ''}`
            : '';
  return (
    <div className="tool-card" data-testid={`tool-card-${tool.id}`}>
      <div className="tool-head" onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        <span className="tool-icon">
          <ToolIcon kind={tool.kind} />
        </span>
        <span className="tool-title" title={tool.title}>
          {tool.title}
        </span>
        <span className={`tool-status ${tool.status}`}>
          {tool.status === 'running' ? <Spinner size={11} /> : null}
          {tool.status === 'done' ? <Check size={11} /> : null}
          {tool.status === 'error' ? <X size={11} /> : null}
          {tool.status === 'pending' ? <Clock size={11} /> : null}
          {toolStatusLabel(tool.status)}
        </span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)', color: 'var(--faint)' }} />
      </div>
      {open && (
        <div className="tool-body">
          {primaryArg && <pre className="tool-args">{primaryArg}</pre>}
          {tool.kind === 'write_file' && args.content !== undefined && (
            <pre className="tool-args" style={{ marginTop: 5 }}>
              {String(args.content).slice(0, 1200)}
              {String(args.content).length > 1200 ? '\n…' : ''}
            </pre>
          )}
          {tool.output && <pre className="tool-output">{tool.output}</pre>}
          {tool.error && <div className="tool-error">{tool.error}</div>}
          {tool.kind === 'write_file' && typeof args.content === 'string' && (
            <div className="faint small" style={{ marginTop: 4 }}>
              {formatBytes((args.content as string).length)} payload
            </div>
          )}
        </div>
      )}
      {tool.status === 'pending' && (
        <div className="tool-actions">
          <Button size="sm" variant="primary" icon={<Check size={12} />} onClick={onApprove} disabled={busy} testId={`approve-${tool.id}`}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={onDeny} disabled={busy} testId={`deny-${tool.id}`}>
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageViewBase({
  message,
  agent,
  onApprove,
  onDeny,
  onApproveAll,
  onRegenerate,
  busy,
}: {
  message: ChatMessage;
  agent: Agent | null;
  onApprove: (toolId: string) => void;
  onDeny: (toolId: string) => void;
  onApproveAll: () => void;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const pending = (message.toolCalls || []).filter((t) => t.status === 'pending');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`} data-testid={`message-${message.role}`}>
      {isUser ? (
        <span className="message-avatar">You</span>
      ) : (
        <AgentAvatar name={agent?.name || 'RM'} color={agent?.color || '#8b5cf6'} size={27} />
      )}
      <div className="message-body">
        <div className="message-author">
          {isUser ? 'You' : agent?.name || 'ReverseMind'}
          <span className="meta">
            {message.provider ? `${message.provider}${message.model ? ` · ${message.model}` : ''}` : ''}
            {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <span className="message-actions">
            <IconButton label={copied ? 'Copied' : 'Copy message'} onClick={copy}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </IconButton>
            {!isUser && onRegenerate && (
              <IconButton label="Regenerate response" onClick={onRegenerate} disabled={busy} data-testid={`regenerate-${message.id}`}>
                <RefreshCw size={12} />
              </IconButton>
            )}
          </span>
        </div>
        <div className="message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (message.streaming ? '…' : '')}</ReactMarkdown>
          {message.streaming && <span className="stream-cursor" />}
        </div>
        {message.plan && message.plan.length > 0 && (
          <div className="plan-list">
            {message.plan.map((step, i) => (
              <div className="plan-item" key={i}>
                <span className="plan-num">{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        )}
        {(message.toolCalls || []).map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            busy={busy}
            onApprove={() => onApprove(tool.id)}
            onDeny={() => onDeny(tool.id)}
          />
        ))}
        {pending.length > 1 && (
          <div className="tool-actions" style={{ padding: 0, marginTop: 5 }}>
            <Button size="sm" variant="primary" onClick={onApproveAll} disabled={busy} testId="approve-all">
              Approve all {pending.length} actions
            </Button>
          </div>
        )}
        {message.tokensIn !== undefined && (
          <div className="faint" style={{ fontSize: 9, marginTop: 4 }}>
            {message.tokensIn} in · {message.tokensOut} out{message.costUsd ? ` · $${message.costUsd.toFixed(4)}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Only the message being streamed changes on each update, so skip re-rendering the rest of a long chat.
 * The handler props only close over ids and stable runtime functions, so they are safe to ignore.
 */
export const MessageView = React.memo(
  MessageViewBase,
  (a, b) => a.message === b.message && a.agent === b.agent && a.busy === b.busy && !!a.onRegenerate === !!b.onRegenerate
);
