import React, { useMemo, useState } from 'react';
import { BookOpen, Copy, Search, Send, X } from 'lucide-react';
import { useStore } from '../store';
import { Badge, IconButton } from './ui';

export function PromptDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, patchUi, toast } = useStore();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.prompts;
    return state.prompts.filter(
      (prompt) =>
        prompt.title.toLowerCase().includes(q) ||
        prompt.body.toLowerCase().includes(q) ||
        prompt.tags.some((tag) => tag.includes(q))
    );
  }, [query, state.prompts]);

  if (!open) return null;

  const insert = (body: string, title: string) => {
    window.dispatchEvent(new CustomEvent('rm:composer-draft', { detail: { text: body } }));
    toast('Prompt inserted', title, 'success');
    onClose();
  };

  const copy = async (body: string, title: string) => {
    try {
      await navigator.clipboard.writeText(body);
      toast('Copied', title, 'success');
    } catch {
      toast('Clipboard unavailable', 'Could not copy the prompt.', 'warning');
    }
  };

  return (
    <aside className="drawer" data-testid="prompt-drawer">
      <div className="drawer-head">
        <BookOpen size={15} />
        <h3>Prompt library</h3>
        <span className="spacer" />
        <IconButton label="Open prompt library" onClick={() => { patchUi({ view: 'prompts' }); onClose(); }}>
          <Send size={13} />
        </IconButton>
        <IconButton label="Close prompt drawer" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="drawer-search">
        <Search size={12} />
        <input
          value={query}
          placeholder="Search saved prompts…"
          aria-label="Search saved prompts"
          onChange={(event) => setQuery(event.target.value)}
          data-testid="drawer-prompt-search"
        />
      </div>
      <div className="drawer-body">
        {filtered.map((prompt) => (
          <div
            className="prompt-card"
            key={prompt.id}
            role="button"
            tabIndex={0}
            onClick={() => insert(prompt.body, prompt.title)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') insert(prompt.body, prompt.title);
            }}
            data-testid={`drawer-prompt-${prompt.id}`}
          >
            <div className="prompt-card-head">
              <span className="prompt-card-title">{prompt.title}</span>
              <span className="spacer" />
              <button
                type="button"
                className="icon-button"
                aria-label={`Copy ${prompt.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void copy(prompt.body, prompt.title);
                }}
              >
                <Copy size={11} />
              </button>
            </div>
            <div className="prompt-card-body">{prompt.body}</div>
            <div className="prompt-card-tags">
              {prompt.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state compact">
            <BookOpen size={20} />
            <h3>No prompts found</h3>
            <p>{query ? `Nothing matches “${query}”.` : 'Save reusable prompts from the prompt library.'}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
