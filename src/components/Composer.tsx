import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  FolderGit2,
  Mic,
  MicOff,
  Paperclip,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { Agent, ChatThread } from '../types';
import { IconButton } from './ui';
import { DropMenu } from './DropMenu';

export interface ComposerProps {
  agent: Agent | null;
  workspaceId: string | null;
  busy: boolean;
  mode: ChatThread['mode'];
  onModeChange: (mode: ChatThread['mode']) => void;
  onWorkspaceChange: (workspaceId: string | null) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function Composer({
  agent,
  workspaceId,
  busy,
  mode,
  onModeChange,
  onWorkspaceChange,
  onSend,
  onStop,
  placeholder,
  compact = false,
}: ComposerProps) {
  const { state, toast, setState } = useStore();
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; path: string }[]>([]);
  const [listening, setListening] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recognition = useRef<any>(null);
  const draftRef = useRef(value);
  const latest = useRef({ busy, autoSend: state.settings.voiceAutoSend, send: (_text: string) => {} });
  const workspaces = state.workspaces;
  const workspace = workspaces.find((w) => w.id === workspaceId) || null;

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 210)}px`;
  }, [value]);

  useEffect(() => {
    draftRef.current = value;
  }, [value]);

  useEffect(() => {
    latest.current = { busy, autoSend: state.settings.voiceAutoSend, send: sendText };
  });

  useEffect(() => {
    if (!state.settings.voiceEnabled && listening) {
      recognition.current?.stop?.();
      setListening(false);
    }
  }, [state.settings.voiceEnabled, listening]);

  useEffect(() => {
    const onDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (detail?.text) {
        setValue((prev) => (prev ? `${prev}\n${detail.text}` : detail.text || ''));
        setTimeout(() => textarea.current?.focus(), 10);
      }
    };
    window.addEventListener('rm:composer-draft', onDraft as EventListener);
    return () => window.removeEventListener('rm:composer-draft', onDraft as EventListener);
  }, []);

  const sendText = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const suffix = attachments.length
      ? `\n\nAttached files:\n${attachments.map((a) => `- ${a.path}`).join('\n')}`
      : '';
    onSend(text + suffix);
    setValue('');
    setAttachments([]);
  };

  const submit = () => sendText(value);

  const toggleVoice = () => {
    if (!state.settings.voiceEnabled) {
      toast('Dictation is disabled', 'Enable it in Settings → Notifications to use the microphone.', 'info');
      return;
    }
    if (listening) {
      recognition.current?.stop?.();
      setListening(false);
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      toast('Voice input is unavailable', 'No speech recognition service is available on this computer. You can still type your message.', 'warning');
      return;
    }
    try {
      const rec = new Ctor();
      recognition.current = rec;
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0]?.transcript || '')
          .join(' ')
          .trim();
        if (!transcript) return;
        const next = draftRef.current ? `${draftRef.current} ${transcript}` : transcript;
        setValue(next);
        const current = latest.current;
        if (current.autoSend && !current.busy) current.send(next);
      };
      rec.onerror = (event: any) => {
        toast('Voice input stopped', String(event?.error || 'The microphone could not be reached.'), 'warning');
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      setListening(true);
    } catch (error) {
      toast('Voice input unavailable', String((error as Error)?.message || error), 'warning');
      setListening(false);
    }
  };

  const toggleApproval = () => {
    if (!agent) return;
    const next = agent.approval === 'auto' ? 'ask' : 'auto';
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === agent.id ? { ...a, approval: next } : a)),
    }));
    toast(
      next === 'auto' ? 'Automatic approval enabled' : 'Approval required',
      next === 'auto'
        ? `${agent.name} can run workspace actions without asking first.`
        : `${agent.name} will ask before touching files or running commands.`,
      next === 'auto' ? 'warning' : 'success'
    );
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files)
      .map((file) => ({ name: file.name, path: window.rm.getPathForFile(file) || file.name }))
      .filter((file) => !!file.path);
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 6));
  };

  return (
    <div className="composer-inner">
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((file, index) => (
            <span className="composer-chip" key={`${file.path}-${index}`} title={file.path}>
              <Paperclip size={10} />
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer" data-testid="composer">
        <textarea
          ref={textarea}
          value={value}
          placeholder={placeholder || `Message ${agent?.name || 'ReverseMind'}…`}
          aria-label="Message"
          data-testid="composer-input"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-bar">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <IconButton label="Attach files" onClick={() => fileInput.current?.click()}>
            <Paperclip size={14} />
          </IconButton>
          <DropMenu
            label="Workspace"
            testId="composer-workspace"
            icon={<FolderGit2 size={12} />}
            value={workspaceId || ''}
            onChange={(value) => onWorkspaceChange(value || null)}
            options={[
              { value: '', label: 'No workspace' },
              ...workspaces.map((item) => ({ value: item.id, label: `${item.name}${item.kind === 'ssh' ? ' (SSH)' : ''}` })),
            ]}
          />
          <div className="spacer" />
          <button
            type="button"
            className="composer-select"
            onClick={toggleApproval}
            title="Toggle action approval"
            data-testid="composer-approval"
          >
            <ShieldCheck size={12} />
            {agent?.approval === 'auto' ? 'Auto-approve' : 'Ask first'}
          </button>
          <DropMenu
            label="Agent mode"
            testId="composer-mode"
            align="right"
            value={mode}
            onChange={(value) => onModeChange(value as ChatThread['mode'])}
            options={[
              { value: 'ask', label: 'Ask', hint: 'Read-only: can look, not touch' },
              { value: 'plan', label: 'Plan', hint: 'Writes a plan, runs nothing' },
              { value: 'agent', label: 'Agent', hint: 'Can edit files and run commands' },
            ]}
          />
          {state.settings.voiceEnabled && (
            <IconButton
              label={listening ? 'Stop dictation' : 'Dictate'}
              onClick={toggleVoice}
              active={listening}
              className={listening ? 'is-listening' : ''}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </IconButton>
          )}
          <button
            type="button"
            className={`composer-send ${value.trim() && !busy ? 'ready' : ''}`}
            aria-label={busy ? 'Stop' : 'Send message'}
            title={busy ? 'Stop' : 'Send message'}
            data-testid="composer-send"
            onClick={busy ? onStop : submit}
            disabled={!busy && !value.trim()}
          >
            {busy ? <Square size={12} fill="currentColor" /> : <ArrowUp size={15} strokeWidth={2.4} />}
          </button>
        </div>
      </div>
    </div>
  );
}
