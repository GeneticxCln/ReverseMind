import React, { useMemo, useState } from 'react';
import {
  Check,
  FolderOpen,
  GitBranch,
  Loader2,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useStore } from '../store';
import { createAgent } from '../defaults';
import type {
  Agent,
  AgentEngine,
  McpServer,
  Plugin,
  Prompt,
  ProviderConfig,
  Routine,
  Skill,
  SshConfig,
  Task,
  TaskStatus,
  Workspace,
} from '../types';
import { ENGINE_META } from '../types';
import { nextRoutineRun } from '../routines';
import { validateSshConfig } from '../ssh';
import { Badge, Button, Field, IconButton, Modal, Select, TextArea, TextInput, Toggle } from './ui';

const uid = () => crypto.randomUUID();

const COLORS = ['#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#60a5fa', '#a78bfa'];

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export function WorkspaceModal({
  onClose,
  onCreated,
  initialTab = 'local',
}: {
  onClose: () => void;
  onCreated?: (workspace: Workspace) => void;
  initialTab?: 'local' | 'ssh';
}) {
  const { state, setState, patchUi, toast, info } = useStore();
  const [tab, setTab] = useState<'local' | 'ssh'>(initialTab);
  const [name, setName] = useState('my-workspace');
  const [parent, setParent] = useState(state.settings.defaultWorkspaceId ? info?.home || '' : info?.home || '');
  const [git, setGit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sshName, setSshName] = useState('remote-workspace');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [port, setPort] = useState('22');
  const [remotePath, setRemotePath] = useState('~');
  const [probe, setProbe] = useState<{ ok: boolean; output: string } | null>(null);
  const [probing, setProbing] = useState(false);

  const pathPreview = useMemo(() => {
    if (!parent) return '';
    return `${parent.replace(/\/+$/, '')}/${name.replace(/[^\w .-]/g, '').trim() || 'workspace'}`;
  }, [parent, name]);

  const pick = async () => {
    const dir = await window.rm.pickFolder();
    if (dir) setParent(dir);
  };

  const addWorkspace = (workspace: Workspace) => {
    setState((prev) => ({
      ...prev,
      workspaces: [workspace, ...prev.workspaces],
      layouts: prev.layouts.some((l) => l.workspaceId === workspace.id)
        ? prev.layouts
        : [...prev.layouts, { workspaceId: workspace.id, panes: [], activePaneId: null }],
      ui: { ...prev.ui, selectedWorkspaceId: workspace.id, mode: 'code', view: 'workspace' },
    }));
    onCreated?.(workspace);
  };

  const createLocal = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give the workspace a name.');
      return;
    }
    if (!parent.trim()) {
      setError('Choose a parent folder.');
      return;
    }
    setBusy(true);
    try {
      const result = await window.rm.createWorkspace({ name: name.trim(), dir: parent.trim(), git });
      const workspace: Workspace = {
        id: uid(),
        name: name.trim(),
        path: result.path,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        pinned: false,
        isGit: git,
        color: COLORS[state.workspaces.length % COLORS.length],
        kind: 'local',
      };
      addWorkspace(workspace);
      toast('Workspace created', `${workspace.name} is ready at ${workspace.path}`, 'success');
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const testSsh = async () => {
    setError('');
    if (!host.trim() || !user.trim() || !remotePath.trim()) {
      setError('Host, user and remote path are required.');
      return;
    }
    const invalid = validateSshConfig({ host: host.trim(), user: user.trim(), path: remotePath.trim(), port: port ? Number(port) : undefined });
    if (invalid) {
      setError(invalid);
      return;
    }
    setProbing(true);
    setProbe(null);
    try {
      const result = await window.rm.ssh.probe({
        host: host.trim(),
        user: user.trim(),
        path: remotePath.trim(),
        port: port ? Number(port) : undefined,
      });
      setProbe(result);
    } catch (err) {
      setProbe({ ok: false, output: String((err as Error)?.message || err) });
    } finally {
      setProbing(false);
    }
  };

  const createRemote = () => {
    setError('');
    if (!sshName.trim() || !host.trim() || !user.trim() || !remotePath.trim()) {
      setError('Name, host, user and remote path are required.');
      return;
    }
    const ssh: SshConfig = {
      host: host.trim(),
      user: user.trim(),
      path: remotePath.trim(),
      port: port ? Number(port) : 22,
    };
    const invalid = validateSshConfig(ssh);
    if (invalid) {
      setError(invalid);
      return;
    }
    const workspace: Workspace = {
      id: uid(),
      name: sshName.trim(),
      path: `ssh://${ssh.user}@${ssh.host}:${ssh.port}${ssh.path.startsWith('/') ? '' : '/'}${ssh.path}`,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      pinned: false,
      isGit: false,
      color: COLORS[state.workspaces.length % COLORS.length],
      kind: 'ssh',
      ssh,
    };
    addWorkspace(workspace);
    toast('Remote workspace added', `${workspace.name} · ${ssh.user}@${ssh.host}`, 'success');
    onClose();
  };

  return (
    <Modal
      title="New workspace"
      subtitle="Point an agent at a local folder or a machine over SSH."
      onClose={onClose}
      width={620}
      testId="workspace-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {tab === 'local' ? (
            <Button variant="primary" icon={busy ? <Loader2 size={13} className="spin" /> : <FolderOpen size={13} />} disabled={busy} onClick={createLocal} testId="workspace-create">
              Create workspace
            </Button>
          ) : (
            <Button variant="primary" icon={<Server size={13} />} onClick={createRemote} testId="workspace-create-remote">
              Add remote workspace
            </Button>
          )}
        </>
      }
    >
      <div className="modal-tabs">
        <button type="button" className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>
          Local folder
        </button>
        <button type="button" className={tab === 'ssh' ? 'active' : ''} onClick={() => setTab('ssh')}>
          Remote SSH
        </button>
      </div>
      {tab === 'local' ? (
        <>
          <Field label="Workspace name" hint="A folder with this name is created inside the parent folder.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="workspace-name" autoFocus />
          </Field>
          <Field label="Parent folder">
            <div className="row">
              <TextInput value={parent} onChange={(e) => setParent(e.target.value)} data-testid="workspace-parent" placeholder="/home/you/Projects" />
              <Button variant="subtle" icon={<FolderOpen size={13} />} onClick={pick}>
                Browse
              </Button>
            </div>
          </Field>
          {pathPreview && (
            <div className="hint-box" style={{ marginBottom: 12 }}>
              <b>Path</b> <span className="mono">{pathPreview}</span>
            </div>
          )}
          <div className="row" style={{ marginBottom: 14 }}>
            <Toggle checked={git} onChange={setGit} label="Initialize Git" />
            <div>
              <div style={{ fontSize: 12 }}>Initialize a Git repository</div>
              <div className="faint small">Creates an initial commit so the Git review pane has history.</div>
            </div>
          </div>
          {error && <div className="danger-box">{error}</div>}
        </>
      ) : (
        <>
          <Field label="Workspace name">
            <TextInput value={sshName} onChange={(e) => setSshName(e.target.value)} data-testid="ssh-name" autoFocus />
          </Field>
          <div className="modal-grid">
            <Field label="Host">
              <TextInput value={host} onChange={(e) => setHost(e.target.value)} placeholder="buildbox.local" data-testid="ssh-host" />
            </Field>
            <Field label="User">
              <TextInput value={user} onChange={(e) => setUser(e.target.value)} placeholder="quinton" data-testid="ssh-user" />
            </Field>
            <Field label="Port">
              <TextInput value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" data-testid="ssh-port" />
            </Field>
            <Field label="Remote path">
              <TextInput value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/srv/project" data-testid="ssh-path" />
            </Field>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <Button variant="subtle" icon={probing ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />} onClick={testSsh} disabled={probing} testId="ssh-probe">
              Test connection
            </Button>
            <span className="faint small">Uses your existing SSH keys. No credentials are stored.</span>
          </div>
          {probe && (
            <pre className={`tool-output ${probe.ok ? '' : 'tool-error'}`} data-testid="ssh-probe-output" style={{ marginBottom: 12 }}>
              {probe.output || (probe.ok ? 'Connection succeeded' : 'Connection failed')}
            </pre>
          )}
          <div className="hint-box">
            Remote workspaces open a terminal over SSH. The workspace path stays on the remote machine; agents can start
            coding CLIs there without copying the repo.
          </div>
          {error && <div className="danger-box" style={{ marginTop: 12 }}>{error}</div>}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Agent                                                               */
/* ------------------------------------------------------------------ */

export function AgentModal({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const { setState, toast, patchUi } = useStore();
  const [draft, setDraft] = useState<Agent>(() => agent || createAgent({ name: 'New agent', color: COLORS[Math.floor(Math.random() * COLORS.length)] }));
  const [tab, setTab] = useState<'profile' | 'memory' | 'skills' | 'autopilot'>('profile');
  const [skillDraft, setSkillDraft] = useState<{ name: string; description: string; body: string } | null>(null);

  const patch = (partial: Partial<Agent>) => setDraft((prev) => ({ ...prev, ...partial }));

  const save = () => {
    if (!draft.name.trim()) {
      toast('Name required', 'Give the agent a name before saving.', 'warning');
      return;
    }
    const clean = { ...draft, name: draft.name.trim() };
    setState((prev) => {
      const exists = prev.agents.some((a) => a.id === clean.id);
      return {
        ...prev,
        agents: exists ? prev.agents.map((a) => (a.id === clean.id ? clean : a)) : [...prev.agents, clean],
        ui: { ...prev.ui, selectedAgentId: clean.id, mode: 'agent' },
      };
    });
    patchUi({ selectedAgentId: clean.id });
    toast(agent ? 'Agent updated' : 'Agent created', clean.name, 'success');
    onClose();
  };

  const addSkill = () => {
    if (!skillDraft?.name.trim()) return;
    const skill: Skill = {
      id: uid(),
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      body: skillDraft.body.trim(),
      enabled: true,
      createdAt: Date.now(),
    };
    patch({ skills: [...draft.skills, skill] });
    setSkillDraft(null);
  };

  return (
    <Modal
      title={agent ? `Edit ${agent.name}` : 'Create an agent'}
      subtitle="Agents keep their own instructions, memory, skills and approval policy."
      onClose={onClose}
      width={680}
      testId="agent-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Check size={13} />} onClick={save} testId="agent-save">
            {agent ? 'Save agent' : 'Create agent'}
          </Button>
        </>
      }
    >
      <div className="modal-tabs">
        <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          Profile
        </button>
        <button type="button" className={tab === 'memory' ? 'active' : ''} onClick={() => setTab('memory')}>
          Memory
        </button>
        <button type="button" className={tab === 'skills' ? 'active' : ''} onClick={() => setTab('skills')}>
          Skills <span className="tab-count">{draft.skills.length}</span>
        </button>
        <button type="button" className={tab === 'autopilot' ? 'active' : ''} onClick={() => setTab('autopilot')}>
          Autopilot
        </button>
      </div>
      {tab === 'profile' && (
        <>
          <div className="modal-grid">
            <Field label="Name">
              <TextInput value={draft.name} onChange={(e) => patch({ name: e.target.value })} data-testid="agent-name" autoFocus />
            </Field>
            <Field
              label="Engine"
              hint="Agent chat uses the ReverseMind runtime. CLI engines add a Launch button that opens the real CLI in a terminal pane."
            >
              <Select value={draft.engine} onChange={(value) => patch({ engine: value as AgentEngine })} testId="agent-engine">
                {Object.entries(ENGINE_META)
                  .filter(([, meta]) => meta.kind === 'agent' || Boolean(meta.command))
                  .map(([id, meta]) => (
                    <option key={id} value={id}>
                      {meta.label}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field label="Brief" hint="This is always included in the agent's context.">
            <TextArea rows={3} value={draft.brief} onChange={(e) => patch({ brief: e.target.value })} data-testid="agent-brief" />
          </Field>
          <Field label="Color">
            <div className="color-row">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`color-dot ${draft.color === color ? 'active' : ''}`}
                  style={{ background: color }}
                  aria-label={color}
                  onClick={() => patch({ color })}
                />
              ))}
            </div>
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <Toggle
              checked={draft.approval === 'auto'}
              onChange={(value) => patch({ approval: value ? 'auto' : 'ask' })}
              label="Automatic approval"
            />
            <div>
              <div style={{ fontSize: 12 }}>Run workspace actions without asking</div>
              <div className="faint small">When off, every file edit and command waits for your approval.</div>
            </div>
          </div>
        </>
      )}
      {tab === 'memory' && (
        <>
          <Field label="Agent memory" hint="Facts and decisions the agent should carry between chats.">
            <TextArea rows={6} value={draft.memory} onChange={(e) => patch({ memory: e.target.value })} data-testid="agent-memory" />
          </Field>
          <Field label="Notes about you" hint="Preferences, stack choices and conventions.">
            <TextArea rows={4} value={draft.userMemory} onChange={(e) => patch({ userMemory: e.target.value })} />
          </Field>
        </>
      )}
      {tab === 'skills' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="muted small">Skills are reusable instructions injected into this agent's context when enabled.</span>
            <span className="spacer" />
            <Button variant="subtle" size="sm" icon={<Plus size={12} />} onClick={() => setSkillDraft({ name: '', description: '', body: '' })} testId="add-skill">
              Add skill
            </Button>
          </div>
          {draft.skills.map((skill) => (
            <div className="skill-mini" key={skill.id}>
              <div className="skill-mini-head">
                {skill.name}
                <span className="spacer" />
                <Toggle
                  checked={skill.enabled}
                  onChange={(enabled) =>
                    patch({ skills: draft.skills.map((s) => (s.id === skill.id ? { ...s, enabled } : s)) })
                  }
                />
                <IconButton
                  label="Remove skill"
                  onClick={() => patch({ skills: draft.skills.filter((s) => s.id !== skill.id) })}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
              <p>{skill.description || skill.body.slice(0, 140)}</p>
            </div>
          ))}
          {draft.skills.length === 0 && <div className="hint-box">No skills yet. Skills are specific procedures — release checklist, test recipe, review policy.</div>}
          {skillDraft && (
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <Field label="Skill name">
                <TextInput value={skillDraft.name} onChange={(e) => setSkillDraft({ ...skillDraft, name: e.target.value })} data-testid="skill-name" autoFocus />
              </Field>
              <Field label="Description">
                <TextInput value={skillDraft.description} onChange={(e) => setSkillDraft({ ...skillDraft, description: e.target.value })} data-testid="skill-description" />
              </Field>
              <Field label="Instructions">
                <TextArea rows={4} value={skillDraft.body} onChange={(e) => setSkillDraft({ ...skillDraft, body: e.target.value })} data-testid="skill-body" />
              </Field>
              <div className="row">
                <span className="spacer" />
                <Button variant="ghost" size="sm" onClick={() => setSkillDraft(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={addSkill} testId="save-skill">
                  Add skill
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {tab === 'autopilot' && (
        <>
          <div className="row" style={{ marginBottom: 14 }}>
            <Toggle checked={draft.autopilot} onChange={(autopilot) => patch({ autopilot })} label="Autopilot" testId="agent-autopilot" />
            <div>
              <div style={{ fontSize: 12 }}>Let the agent continue working between messages</div>
              <div className="faint small">It stops when it needs approval or when the step budget is spent.</div>
            </div>
          </div>
          <Field label="Maximum steps" hint="A hard budget per turn keeps local runs predictable.">
            <TextInput
              type="number"
              min={1}
              max={30}
              value={draft.autopilotMaxSteps}
              onChange={(e) => patch({ autopilotMaxSteps: Number(e.target.value) || 3 })}
            />
          </Field>
          <div className="hint-box">Autopilot runs up to the step budget without stopping. Actions beyond it wait for your approval, and every step is recorded in the transcript.</div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

export function TaskModal({
  task,
  defaultStatus = 'backlog',
  onClose,
}: {
  task?: Task;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}) {
  const { state, setState, toast } = useStore();
  const [draft, setDraft] = useState<Task>(
    () =>
      task || {
        id: uid(),
        title: '',
        description: '',
        status: defaultStatus,
        priority: 'medium',
        agentId: state.agents[0]?.id || null,
        workspaceId: state.ui.selectedWorkspaceId,
        labels: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
  );
  const [labels, setLabels] = useState(draft.labels.join(', '));

  const save = () => {
    if (!draft.title.trim()) {
      toast('Title required', 'Give the ticket a title.', 'warning');
      return;
    }
    const clean: Task = {
      ...draft,
      title: draft.title.trim(),
      labels: labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.some((t) => t.id === clean.id) ? prev.tasks.map((t) => (t.id === clean.id ? clean : t)) : [clean, ...prev.tasks],
    }));
    toast(task ? 'Ticket updated' : 'Ticket created', clean.title, 'success');
    onClose();
  };

  return (
    <Modal
      title={task ? 'Edit ticket' : 'New ticket'}
      onClose={onClose}
      width={600}
      testId="task-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} testId="task-save">
            Save ticket
          </Button>
        </>
      }
    >
      <Field label="Title">
        <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="task-title" autoFocus />
      </Field>
      <Field label="Description">
        <TextArea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="task-description" />
      </Field>
      <div className="modal-grid">
        <Field label="Status">
          <Select value={draft.status} onChange={(status) => setDraft({ ...draft, status: status as TaskStatus })} testId="task-status">
            <option value="backlog">Backlog</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority: priority as Task['priority'] })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Agent">
          <Select value={draft.agentId || ''} onChange={(agentId) => setDraft({ ...draft, agentId: agentId || null })} testId="task-agent">
            <option value="">Unassigned</option>
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Workspace">
          <Select value={draft.workspaceId || ''} onChange={(workspaceId) => setDraft({ ...draft, workspaceId: workspaceId || null })}>
            <option value="">No workspace</option>
            {state.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Labels" hint="Comma separated.">
        <TextInput value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="ui, urgent" />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Routine                                                             */
/* ------------------------------------------------------------------ */

export function RoutineModal({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const { state, setState, toast } = useStore();
  const [draft, setDraft] = useState<Routine>(
    () =>
      routine || {
        id: uid(),
        name: '',
        prompt: '',
        agentId: state.agents[0]?.id || '',
        schedule: 'manual',
        time: '09:00',
        enabled: true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: Date.now(),
      }
  );

  const save = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) {
      toast('Missing fields', 'A name and a prompt are required.', 'warning');
      return;
    }
    const scheduleChanged = !routine || routine.schedule !== draft.schedule || routine.time !== draft.time;
    const nextRunAt = !draft.enabled
      ? null
      : scheduleChanged || !draft.nextRunAt || draft.nextRunAt <= Date.now()
        ? nextRoutineRun(draft.schedule, draft.time || '09:00')
        : draft.nextRunAt;
    const clean: Routine = { ...draft, name: draft.name.trim(), time: draft.time || '09:00', nextRunAt };
    setState((prev) => ({
      ...prev,
      routines: prev.routines.some((r) => r.id === clean.id) ? prev.routines.map((r) => (r.id === clean.id ? clean : r)) : [clean, ...prev.routines],
    }));
    toast(routine ? 'Routine updated' : 'Routine created', clean.name, 'success');
    onClose();
  };

  return (
    <Modal
      title={routine ? 'Edit routine' : 'New routine'}
      subtitle="Routines create a chat and run the prompt on a schedule."
      onClose={onClose}
      width={600}
      testId="routine-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} testId="routine-save">
            Save routine
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="routine-name" autoFocus />
      </Field>
      <Field label="Prompt">
        <TextArea rows={5} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} data-testid="routine-prompt" />
      </Field>
      <div className="modal-grid">
        <Field label="Agent">
          <Select value={draft.agentId} onChange={(agentId) => setDraft({ ...draft, agentId })}>
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Schedule">
          <Select value={draft.schedule} onChange={(schedule) => setDraft({ ...draft, schedule: schedule as Routine['schedule'] })}>
            <option value="manual">Manual</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
          </Select>
        </Field>
      </div>
      {(draft.schedule === 'daily' || draft.schedule === 'weekdays') && (
        <Field label="Time" hint="Local time on this machine.">
          <TextInput type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        </Field>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

export function PromptModal({ prompt, onClose }: { prompt?: Prompt; onClose: () => void }) {
  const { setState, toast } = useStore();
  const [title, setTitle] = useState(prompt?.title || '');
  const [body, setBody] = useState(prompt?.body || '');
  const [tags, setTags] = useState((prompt?.tags || []).join(', '));

  const save = () => {
    if (!title.trim() || !body.trim()) {
      toast('Missing fields', 'A title and prompt body are required.', 'warning');
      return;
    }
    const clean: Prompt = {
      id: prompt?.id || uid(),
      title: title.trim(),
      body: body.trim(),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      createdAt: prompt?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      prompts: prev.prompts.some((p) => p.id === clean.id) ? prev.prompts.map((p) => (p.id === clean.id ? clean : p)) : [clean, ...prev.prompts],
    }));
    toast(prompt ? 'Prompt updated' : 'Prompt saved', clean.title, 'success');
    onClose();
  };

  return (
    <Modal
      title={prompt ? 'Edit prompt' : 'New prompt'}
      onClose={onClose}
      width={620}
      testId="prompt-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} testId="prompt-save">
            Save prompt
          </Button>
        </>
      }
    >
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} data-testid="prompt-title" autoFocus />
      </Field>
      <Field label="Prompt">
        <TextArea rows={8} value={body} onChange={(e) => setBody(e.target.value)} data-testid="prompt-body" />
      </Field>
      <Field label="Tags" hint="Comma separated.">
        <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="review, refactor" />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function ProviderModal({ onClose }: { onClose: () => void }) {
  const { setState, toast } = useStore();
  const [draft, setDraft] = useState<ProviderConfig>({
    id: uid(),
    name: 'OpenAI compatible',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
  });

  const save = () => {
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      toast('Missing fields', 'Name and base URL are required.', 'warning');
      return;
    }
    setState((prev) => {
      const providers = prev.settings.providers.some((p) => p.id === draft.id)
        ? prev.settings.providers.map((p) => (p.id === draft.id ? draft : p))
        : [...prev.settings.providers, draft];
      return {
        ...prev,
        settings: { ...prev.settings, providers, defaultProvider: draft.id },
      };
    });
    toast('Provider saved', `${draft.name} is now the default provider.`, 'success');
    onClose();
  };

  return (
    <Modal
      title="Add model provider"
      subtitle="Calls go directly from this machine to the endpoint you configure. ReverseMind never proxies them."
      onClose={onClose}
      width={620}
      testId="provider-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} testId="provider-save">
            Save provider
          </Button>
        </>
      }
    >
      <div className="modal-grid">
        <Field label="Display name">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="provider-name" autoFocus />
        </Field>
        <Field label="API shape">
          <Select value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind: kind as ProviderConfig['kind'] })}>
            <option value="openai">OpenAI compatible</option>
            <option value="anthropic">Anthropic Messages</option>
          </Select>
        </Field>
      </div>
      <Field label="Base URL">
        <TextInput value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} data-testid="provider-url" />
      </Field>
      <Field label="Model">
        <TextInput value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} data-testid="provider-model" />
      </Field>
      <Field label="API key" hint="Stored in ReverseMind's local state file only. Use a key scoped to this machine.">
        <TextInput type="password" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} data-testid="provider-key" />
      </Field>
      <div className="modal-grid">
        <Field label="Input price ($ per 1M tokens)" hint="Optional. Defaults to $3.">
          <TextInput
            type="number"
            min={0}
            step="any"
            value={draft.inputPricePerM ?? ''}
            onChange={(e) => setDraft({ ...draft, inputPricePerM: e.target.value === '' ? undefined : Number(e.target.value) })}
            data-testid="provider-price-in"
          />
        </Field>
        <Field label="Output price ($ per 1M tokens)" hint="Optional. Defaults to $15.">
          <TextInput
            type="number"
            min={0}
            step="any"
            value={draft.outputPricePerM ?? ''}
            onChange={(e) => setDraft({ ...draft, outputPricePerM: e.target.value === '' ? undefined : Number(e.target.value) })}
            data-testid="provider-price-out"
          />
        </Field>
      </div>
      <div className="hint-box">If the endpoint is unreachable, the offline runtime is still one click away in the agent settings.</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* MCP server                                                          */
/* ------------------------------------------------------------------ */

export function McpServerModal({
  server,
  onClose,
  onConnected,
}: {
  server?: McpServer;
  onClose: () => void;
  onConnected?: (id: string) => void;
}) {
  const { state, setState, toast } = useStore();
  const [name, setName] = useState(server?.name || 'Local MCP server');
  const [command, setCommand] = useState(server?.command || 'node');
  const [args, setArgs] = useState((server?.args || []).join(' '));
  const [env, setEnv] = useState(Object.entries(server?.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [connectNow, setConnectNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parseArgs = () => {
    const trimmed = args.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // fall through to space splitting
      }
    }
    return trimmed.split(/\s+/);
  };

  const parseEnv = () => {
    const result: Record<string, string> = {};
    for (const line of env.split('\n')) {
      const index = line.indexOf('=');
      if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return result;
  };

  const save = async () => {
    if (!name.trim() || !command.trim()) {
      setError('A name and a command are required.');
      return;
    }
    const id = server?.id || uid();
    const next: McpServer = {
      id,
      name: name.trim(),
      command: command.trim(),
      args: parseArgs(),
      env: parseEnv(),
      enabled,
      status: server?.status || 'disconnected',
      tools: server?.tools || [],
      error: undefined,
      lastConnectedAt: server?.lastConnectedAt,
    };
    setState((prev) => {
      const mcpServers = prev.mcpServers.some((s) => s.id === id)
        ? prev.mcpServers.map((s) => (s.id === id ? next : s))
        : [...prev.mcpServers, next];
      const plugin: Plugin = {
        id: `mcp-plugin-${id}`,
        name: next.name,
        description: `MCP connection · ${next.command} ${next.args.join(' ')}`.trim(),
        author: 'MCP',
        enabled,
        kind: 'mcp',
        serverId: id,
        icon: 'plug',
      };
      const plugins = prev.plugins.some((p) => p.id === plugin.id)
        ? prev.plugins.map((p) => (p.id === plugin.id ? plugin : p))
        : [...prev.plugins, plugin];
      return { ...prev, mcpServers, plugins };
    });
    if (connectNow) {
      setBusy(true);
      try {
        const result = await window.rm.mcp.connect(next);
        setState((prev) => ({
          ...prev,
          mcpServers: prev.mcpServers.map((s) =>
            s.id === id
              ? { ...s, status: 'connected', tools: result.tools, error: undefined, lastConnectedAt: Date.now() }
              : s
          ),
          plugins: prev.plugins.map((p) => (p.serverId === id ? { ...p, enabled } : p)),
        }));
        toast('MCP connected', `${next.name} · ${result.tools.length} tools available`, 'success');
        onConnected?.(id);
        onClose();
        return;
      } catch (err) {
        const message = String((err as Error)?.message || err);
        setState((prev) => ({
          ...prev,
          mcpServers: prev.mcpServers.map((s) => (s.id === id ? { ...s, status: 'error', error: message } : s)),
        }));
        setError(message);
      } finally {
        setBusy(false);
        return;
      }
    }
    toast('MCP server saved', next.name, 'success');
    onConnected?.(id);
    onClose();
  };

  return (
    <Modal
      title={server ? 'Edit MCP server' : 'Add MCP server'}
      subtitle="ReverseMind speaks stdio JSON-RPC. Commands run locally with the environment you define."
      onClose={onClose}
      width={660}
      testId="mcp-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={busy ? <Loader2 size={13} className="spin" /> : <Server size={13} />}
            onClick={() => void save()}
            disabled={busy}
            testId="mcp-save"
          >
            {connectNow ? 'Save & connect' : 'Save server'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="mcp-name" autoFocus />
      </Field>
      <div className="modal-grid">
        <Field label="Command">
          <TextInput value={command} onChange={(e) => setCommand(e.target.value)} data-testid="mcp-command" placeholder="node" />
        </Field>
        <Field label="Arguments" hint="Space separated. A JSON array works too.">
          <TextInput value={args} onChange={(e) => setArgs(e.target.value)} data-testid="mcp-args" placeholder="/path/to/server.mjs" />
        </Field>
      </div>
      <Field label="Environment" hint="One KEY=value per line.">
        <TextArea rows={3} value={env} onChange={(e) => setEnv(e.target.value)} />
      </Field>
      <div className="row" style={{ marginBottom: 10 }}>
        <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
        <span className="small">Enable this connection for agents and plugins</span>
      </div>
      <div className="row">
        <Toggle checked={connectNow} onChange={setConnectNow} label="Connect now" />
        <span className="small">Start the server and load its tool list</span>
      </div>
      {error && (
        <div className="danger-box" style={{ marginTop: 12 }} data-testid="mcp-error">
          {error}
        </div>
      )}
      <div className="hint-box" style={{ marginTop: 12 }}>
        Test server available in this build: <span className="mono">node {state.plugins.length ? '' : ''}resources/test-mcp-server.mjs</span>. It exposes echo, add and reverse tools.
      </div>
    </Modal>
  );
}

export function McpToolModal({ server, onClose }: { server: McpServer; onClose: () => void }) {
  const [tool, setTool] = useState(server.tools[0]?.name || '');
  const [args, setArgs] = useState('{}');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useStore();

  const run = async () => {
    setBusy(true);
    setOutput('');
    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(args || '{}');
      } catch {
        throw new Error('Arguments must be valid JSON');
      }
      const result = await window.rm.mcp.call(server.id, tool, parsed);
      setOutput(result.text);
      toast('Tool returned', tool, 'success');
    } catch (err) {
      setOutput(String((err as Error)?.message || err));
      toast('Tool call failed', String((err as Error)?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Test ${server.name}`}
      subtitle={`${server.status} · ${server.tools.length} tools`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy || !tool} testId="mcp-tool-run">
            Run tool
          </Button>
        </>
      }
    >
      <Field label="Tool">
        <Select value={tool} onChange={setTool} testId="mcp-tool-select">
          {server.tools.length === 0 && <option value="">No tools loaded</option>}
          {server.tools.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Arguments (JSON)">
        <TextArea rows={4} value={args} onChange={(e) => setArgs(e.target.value)} className="mono" data-testid="mcp-tool-args" />
      </Field>
      {output && (
        <pre className="tool-output" data-testid="mcp-tool-output">
          {output}
        </pre>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Worktree                                                            */
/* ------------------------------------------------------------------ */

export function WorktreeModal({
  workspace,
  onClose,
  onCreated,
}: {
  workspace: Workspace;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useStore();
  const [branch, setBranch] = useState('feature/');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!branch.trim() || !target.trim()) {
      setError('Branch and target folder are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await window.rm.git.worktreeAdd(workspace.path, target.trim(), branch.trim());
      if (!result.ok) throw new Error(result.output || 'Git worktree failed');
      toast('Worktree created', `${branch} at ${target}`, 'success');
      onCreated();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New worktree"
      subtitle={workspace.path}
      onClose={onClose}
      testId="worktree-modal"
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<GitBranch size={13} />} onClick={() => void create()} disabled={busy} testId="worktree-create">
            Create worktree
          </Button>
        </>
      }
    >
      <Field label="New branch">
        <TextInput value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="worktree-branch" autoFocus />
      </Field>
      <Field label="Target folder" hint="Absolute path for the new checkout.">
        <TextInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`${workspace.path}/../${branch || 'worktree'}`} data-testid="worktree-target" />
      </Field>
      {error && <div className="danger-box">{error}</div>}
    </Modal>
  );
}
