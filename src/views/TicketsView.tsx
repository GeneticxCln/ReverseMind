import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, GripVertical, Plus, Send, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import type { Task, TaskStatus } from '../types';
import { AgentAvatar, Badge, Button, IconButton, SectionLabel } from '../components/ui';
import { TaskModal } from '../components/Modals';

const COLUMNS: { id: TaskStatus; label: string; hint: string }[] = [
  { id: 'backlog', label: 'Backlog', hint: 'Ideas and not-started work' },
  { id: 'in_progress', label: 'In progress', hint: 'An agent or you is on it' },
  { id: 'review', label: 'Review', hint: 'Done, waiting for a look' },
  { id: 'done', label: 'Done', hint: 'Shipped' },
];

const PRIORITY_TONE: Record<Task['priority'], 'neutral' | 'amber' | 'red'> = {
  low: 'neutral',
  medium: 'amber',
  high: 'red',
};

export function TicketsView() {
  const { state, setState, createChat, patchUi, notify, toast } = useStore();
  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingStatus, setCreatingStatus] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const tasksEnabled = state.plugins.find((plugin) => plugin.id === 'plugin-tasks')?.enabled ?? true;
  const visible = filter === 'all' ? state.tasks : state.tasks.filter((task) => task.agentId === filter);

  const move = (taskId: string, status: TaskStatus) => {
    if (!tasksEnabled) {
      toast('Task Board is disabled', 'Enable Task Board in Plugins to move tickets.', 'warning');
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((item) => (item.id === taskId ? { ...item, status, updatedAt: Date.now() } : item)),
    }));
    if (status === 'done') {
      notify('Ticket completed', task.title, 'success');
      toast('Ticket completed', task.title, 'success');
    }
  };

  const dispatch = (task: Task) => {
    if (!tasksEnabled) {
      toast('Task Board is disabled', 'Enable Task Board in Plugins to dispatch tickets.', 'warning');
      return;
    }
    const agent = state.agents.find((a) => a.id === task.agentId) || state.agents[0];
    const chat = createChat(agent.id, { workspaceId: task.workspaceId, title: `Ticket · ${task.title}` });
    patchUi({ selectedChatId: chat.id, mode: 'agent', view: 'workspace' });
    window.dispatchEvent(new CustomEvent('rm:composer-draft', {
      detail: { text: `Work on this ticket:\n\n${task.title}\n\n${task.description}` },
    }));
    notify('Ticket dispatched', `${agent.name} is ready in a new thread.`, 'info');
  };

  return (
    <div className="page" data-testid="tickets-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Tickets</h1>
          <p>Plan work, assign an agent and keep status flowing.</p>
        </div>
        <div className="page-head-actions">
          <select
            className="input"
            style={{ width: 150, height: 30 }}
            aria-label="Filter by agent"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All agents</option>
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={13} />}
            onClick={() => setCreatingStatus('backlog')}
            disabled={!tasksEnabled}
            testId="new-ticket"
          >
            New ticket
          </Button>
        </div>
      </div>
      <div className="page-body">
        {!tasksEnabled && (
          <div className="hint-box" data-testid="tasks-disabled-notice" style={{ marginBottom: 14 }}>
            <Sparkles size={12} /> Task Board is turned off. Enable it in Plugins to create, edit, move or dispatch
            tickets. The board stays visible in read-only mode.
          </div>
        )}
        <div className="board" data-testid="ticket-board">
          {COLUMNS.map((column) => {
            const tasks = visible.filter((task) => task.status === column.id);
            return (
              <div
                key={column.id}
                className={`board-col ${dragging ? 'can-drop' : ''}`}
                data-testid={`board-col-${column.id}`}
                onDragOver={(e) => {
                  if (!tasksEnabled) return;
                  e.preventDefault();
                  e.currentTarget.classList.add('drag-over');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  if (tasksEnabled && dragging) move(dragging, column.id);
                  setDragging(null);
                }}
              >
                <div className="board-col-head">
                  <h3>{column.label}</h3>
                  <span className="count">{tasks.length}</span>
                  <span className="spacer" />
                  <IconButton label={`Add ticket to ${column.label}`} onClick={() => setCreatingStatus(column.id)} disabled={!tasksEnabled}>
                    <Plus size={13} />
                  </IconButton>
                </div>
                <div className="board-cards">
                  {tasks.map((task) => {
                    const agent = state.agents.find((a) => a.id === task.agentId);
                    const workspace = state.workspaces.find((w) => w.id === task.workspaceId);
                    return (
                      <div
                        key={task.id}
                        className="task-card"
                        draggable={tasksEnabled}
                        data-testid={`task-${task.id}`}
                        onDragStart={(event) => {
                          if (!tasksEnabled) {
                            event.preventDefault();
                            return;
                          }
                          setDragging(task.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => tasksEnabled && setEditing(task)}
                      >
                        <div className="task-card-title">
                          <GripVertical size={11} className="faint" />
                          {task.title}
                        </div>
                        {task.description && <div className="task-card-desc">{task.description}</div>}
                        <div className="task-card-labels">
                          <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
                          {task.labels.slice(0, 2).map((label) => (
                            <Badge key={label}>{label}</Badge>
                          ))}
                          {workspace && <span className="faint small">{workspace.name}</span>}
                        </div>
                        <div className="task-card-foot">
                          {agent ? (
                            <span className="row" style={{ gap: 5 }}>
                              <AgentAvatar name={agent.name} color={agent.color} size={17} />
                              <span className="faint small">{agent.name}</span>
                            </span>
                          ) : (
                            <span className="faint small">Unassigned</span>
                          )}
                          <span className="spacer" />
                          <span onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 1 }}>
                            <IconButton label="Dispatch to agent" onClick={() => dispatch(task)} disabled={!tasksEnabled}>
                              <Send size={11} />
                            </IconButton>
                            {task.status !== 'done' ? (
                              <IconButton label="Mark done" onClick={() => move(task.id, 'done')} disabled={!tasksEnabled} data-testid={`complete-task-${task.id}`}>
                                <CheckCircle2 size={12} />
                              </IconButton>
                            ) : (
                              <span className="done-mark">
                                <CheckCircle2 size={11} /> done
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length === 0 && (
                    <div className="board-empty">
                      <Circle size={13} />
                      <span>No tickets</span>
                    </div>
                  )}
                </div>
                <button type="button" className="board-add" onClick={() => setCreatingStatus(column.id)} disabled={!tasksEnabled}>
                  <Plus size={12} /> Add ticket
                </button>
              </div>
            );
          })}
        </div>
        <div className="hint-box" style={{ marginTop: 16 }}>
          <Sparkles size={12} /> Tickets can be dragged between columns. Dispatch sends one to an agent with the details
          pre-filled — useful when a bug report needs a repo.
        </div>
      </div>
      {creatingStatus && <TaskModal defaultStatus={creatingStatus} onClose={() => setCreatingStatus(null)} />}
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
