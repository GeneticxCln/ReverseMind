import React, { useMemo, useState } from 'react';
import { BookOpenCheck, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Agent, Skill } from '../types';
import { AgentAvatar, Badge, Button, Field, IconButton, Modal, Select, TextArea, TextInput, Toggle } from '../components/ui';

const uid = () => crypto.randomUUID();

function SkillModal({
  agents,
  agentId,
  skill,
  onClose,
}: {
  agents: Agent[];
  agentId: string;
  skill?: Skill;
  onClose: () => void;
}) {
  const { setState, toast } = useStore();
  const [targetAgent, setTargetAgent] = useState(agentId);
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const [body, setBody] = useState(skill?.body || '');
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);

  const save = () => {
    if (!name.trim()) {
      toast('Skill name required', 'Give the skill a short name.', 'warning');
      return;
    }
    const clean: Skill = {
      id: skill?.id || uid(),
      name: name.trim(),
      description: description.trim(),
      body: body.trim(),
      enabled,
      createdAt: skill?.createdAt || Date.now(),
    };
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((agent) => {
        const without = agent.skills.filter((item) => item.id !== clean.id);
        if (agent.id !== targetAgent) return { ...agent, skills: without };
        return { ...agent, skills: [...without, clean] };
      }),
    }));
    toast(skill ? 'Skill updated' : 'Skill created', clean.name, 'success');
    onClose();
  };

  return (
    <Modal
      title={skill ? 'Edit skill' : 'New skill'}
      subtitle="Skills are injected into one agent's context when enabled."
      onClose={onClose}
      width={640}
      testId="skill-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} testId="skill-save">
            Save skill
          </Button>
        </>
      }
    >
      <div className="modal-grid">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="skill-modal-name" autoFocus />
        </Field>
        <Field label="Agent">
          <Select value={targetAgent} onChange={setTargetAgent}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on when to use this skill" data-testid="skill-modal-description" />
      </Field>
      <Field label="Instructions" hint="Markdown is fine. Be specific about the steps and the definition of done.">
        <TextArea rows={9} value={body} onChange={(e) => setBody(e.target.value)} data-testid="skill-modal-body" />
      </Field>
      <div className="row">
        <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
        <span className="small">Include this skill in the agent context</span>
      </div>
    </Modal>
  );
}

export function SkillsView() {
  const { state, setState, toast } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<{ agentId: string; skill: Skill } | null>(null);
  const [creating, setCreating] = useState(false);

  const all = useMemo(
    () =>
      state.agents.flatMap((agent) =>
        agent.skills.map((skill) => ({
          agent,
          skill,
        }))
      ),
    [state.agents]
  );

  const filtered = all.filter(({ agent, skill }) => {
    if (filter !== 'all' && agent.id !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q) || skill.body.toLowerCase().includes(q);
  });

  const remove = (agent: Agent, skill: Skill) => {
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((item) =>
        item.id === agent.id ? { ...item, skills: item.skills.filter((s) => s.id !== skill.id) } : item
      ),
    }));
    toast('Skill removed', skill.name, 'info');
  };

  const toggle = (agent: Agent, skill: Skill, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((item) =>
        item.id === agent.id
          ? { ...item, skills: item.skills.map((s) => (s.id === skill.id ? { ...s, enabled } : s)) }
          : item
      ),
    }));
  };

  return (
    <div className="page" data-testid="skills-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Skills</h1>
          <p>Reusable procedures that make an agent sharper at a specific job.</p>
        </div>
        <div className="page-head-actions">
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)} testId="new-skill">
            New skill
          </Button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar-row">
          <div className="search-row" style={{ maxWidth: 340, flex: 1 }}>
            <Search size={12} />
            <input value={query} placeholder="Search skills…" onChange={(e) => setQuery(e.target.value)} data-testid="skill-search" />
          </div>
          <select className="input" style={{ width: 170, height: 30 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by agent">
            <option value="all">All agents</option>
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="faint small">{all.length} skills total</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <BookOpenCheck size={30} />
            <h3>{all.length === 0 ? 'No skills yet' : 'No skills match'}</h3>
            <p>
              {all.length === 0
                ? 'A skill can be a release checklist, a test recipe or your team’s review policy.'
                : 'Try a different search or agent filter.'}
            </p>
            {all.length === 0 && (
              <Button variant="primary" icon={<Sparkles size={13} />} onClick={() => setCreating(true)}>
                Create a skill
              </Button>
            )}
          </div>
        ) : (
          <div className="tile-grid">
            {filtered.map(({ agent, skill }) => (
              <div className="tile" key={`${agent.id}-${skill.id}`} data-testid={`skill-${skill.id}`}>
                <div className="tile-head">
                  <span className="tile-icon" style={{ background: `${agent.color}24`, color: agent.color }}>
                    <BookOpenCheck size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tile-title">{skill.name}</div>
                    <div className="tile-sub">{skill.description || 'No description'}</div>
                  </div>
                  <span className="spacer" />
                  <Toggle checked={skill.enabled} onChange={(enabled) => toggle(agent, skill, enabled)} label={skill.name} />
                </div>
                <pre className="tile-body">{skill.body.slice(0, 300)}{skill.body.length > 300 ? '…' : ''}</pre>
                <div className="tile-foot">
                  <span className="row" style={{ gap: 5 }}>
                    <AgentAvatar name={agent.name} color={agent.color} size={16} />
                    <span className="small">{agent.name}</span>
                  </span>
                  <span className="spacer" />
                  <Badge tone={skill.enabled ? 'green' : 'neutral'}>{skill.enabled ? 'Enabled' : 'Off'}</Badge>
                  <IconButton label="Edit skill" onClick={() => setEditing({ agentId: agent.id, skill })}>
                    <Pencil size={12} />
                  </IconButton>
                  <IconButton label="Delete skill" onClick={() => remove(agent, skill)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {creating && <SkillModal agents={state.agents} agentId={state.ui.selectedAgentId || state.agents[0]?.id || ''} onClose={() => setCreating(false)} />}
      {editing && <SkillModal agents={state.agents} agentId={editing.agentId} skill={editing.skill} onClose={() => setEditing(null)} />}
    </div>
  );
}
