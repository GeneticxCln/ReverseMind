import React, { useMemo, useState } from 'react';
import { Copy, MessageSquare, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Prompt } from '../types';
import { Badge, Button, IconButton, LogoMark } from '../components/ui';
import { PromptModal } from '../components/Modals';

export function PromptsView() {
  const { state, setState, createChat, patchUi, toast, notify } = useStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Prompt | null>(null);

  const tags = useMemo(() => Array.from(new Set(state.prompts.flatMap((prompt) => prompt.tags))), [state.prompts]);

  const filtered = state.prompts.filter((prompt) => {
    if (tag !== 'all' && !prompt.tags.includes(tag)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return prompt.title.toLowerCase().includes(q) || prompt.body.toLowerCase().includes(q) || prompt.tags.some((t) => t.includes(q));
  });

  const usePrompt = (prompt: Prompt) => {
    const agent = state.agents.find((a) => a.id === state.ui.selectedAgentId) || state.agents[0];
    if (!agent) return;
    const chat = createChat(agent.id, { title: prompt.title });
    patchUi({ mode: 'agent', view: 'workspace', selectedChatId: chat.id });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('rm:composer-draft', { detail: { text: prompt.body } }));
    }, 220);
    notify('Prompt ready', `${agent.name} opened ${prompt.title}`, 'info');
  };

  const remove = (prompt: Prompt) => {
    setState((prev) => ({ ...prev, prompts: prev.prompts.filter((item) => item.id !== prompt.id) }));
    toast('Prompt deleted', prompt.title, 'info');
  };

  const copy = async (prompt: Prompt) => {
    try {
      await navigator.clipboard.writeText(prompt.body);
      toast('Copied', prompt.title, 'success');
    } catch {
      toast('Clipboard unavailable', 'Could not copy the prompt.', 'warning');
    }
  };

  return (
    <div className="page" data-testid="prompts-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Prompt library</h1>
          <p>Reusable prompts shared by all agents. Insert one into any conversation.</p>
        </div>
        <div className="page-head-actions">
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)} testId="new-prompt">
            New prompt
          </Button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar-row">
          <div className="search-row" style={{ maxWidth: 340, flex: 1 }}>
            <Search size={12} />
            <input value={query} placeholder="Search prompts…" onChange={(e) => setQuery(e.target.value)} data-testid="prompt-search" />
          </div>
          <select className="input" style={{ width: 160, height: 30 }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="all">All tags</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="faint small">{state.prompts.length} saved</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={30} />
            <h3>No prompts match</h3>
            <p>Save the instructions you reach for often — reviews, planning, test sweeps.</p>
            <Button variant="primary" onClick={() => setCreating(true)}>New prompt</Button>
          </div>
        ) : (
          <div className="tile-grid prompt-tiles">
            {filtered.map((prompt) => (
              <div className="tile prompt-tile" key={prompt.id} data-testid={`prompt-${prompt.id}`}>
                <div className="tile-head">
                  <span className="tile-icon">
                    <LogoMark size={17} />
                  </span>
                  <div className="tile-title">{prompt.title}</div>
                </div>
                <p className="prompt-body">{prompt.body}</p>
                <div className="prompt-tags">
                  {prompt.tags.map((item) => (
                    <Badge key={item} tone="accent">{item}</Badge>
                  ))}
                </div>
                <div className="tile-foot">
                  <button type="button" className="button button-primary button-sm" onClick={() => usePrompt(prompt)} data-testid={`use-prompt-${prompt.id}`}>
                    <Send size={11} /> Use
                  </button>
                  <span className="spacer" />
                  <IconButton label="Copy prompt" onClick={() => void copy(prompt)}>
                    <Copy size={12} />
                  </IconButton>
                  <IconButton label="Edit prompt" onClick={() => setEditing(prompt)}>
                    <Pencil size={12} />
                  </IconButton>
                  <IconButton label="Delete prompt" onClick={() => remove(prompt)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {creating && <PromptModal onClose={() => setCreating(false)} />}
      {editing && <PromptModal prompt={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
