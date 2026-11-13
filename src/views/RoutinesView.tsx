import React, { useState } from 'react';
import { CalendarClock, Clock3, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Routine } from '../types';
import { useRoutineRunner } from '../agent';
import { nextRoutineRun } from '../routines';
import { AgentAvatar, Badge, Button, IconButton, Toggle } from '../components/ui';
import { RoutineModal } from '../components/Modals';

function scheduleLabel(routine: Routine): string {
  if (routine.schedule === 'manual') return 'Manual';
  if (routine.schedule === 'hourly') return 'Every hour';
  if (routine.schedule === 'weekdays') return `Weekdays at ${routine.time}`;
  return `Daily at ${routine.time}`;
}

function relative(time: number | null): string {
  if (!time) return 'Never';
  const delta = Date.now() - time;
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(time).toLocaleDateString();
}

export function RoutinesView() {
  const { state, setState, toast, notify } = useStore();
  const { runRoutine } = useRoutineRunner();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const toggle = (routine: Routine, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      routines: prev.routines.map((item) =>
        item.id === routine.id
          ? {
              ...item,
              enabled,
              nextRunAt: enabled ? nextRoutineRun(item.schedule, item.time) : null,
            }
          : item
      ),
    }));
  };

  const run = async (routine: Routine) => {
    setRunningId(routine.id);
    try {
      await runRoutine(routine.id);
      notify('Routine finished', routine.name, 'success');
    } finally {
      setRunningId(null);
    }
  };

  const remove = (routine: Routine) => {
    setState((prev) => ({ ...prev, routines: prev.routines.filter((item) => item.id !== routine.id) }));
    toast('Routine deleted', routine.name, 'info');
  };

  return (
    <div className="page" data-testid="routines-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Routines</h1>
          <p>Recurring prompts that run while the app is open. Every run is a normal chat.</p>
        </div>
        <div className="page-head-actions">
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)} testId="new-routine">
            New routine
          </Button>
        </div>
      </div>
      <div className="page-body narrow">
        {state.routines.length === 0 ? (
          <div className="empty-state">
            <CalendarClock size={30} />
            <h3>No routines yet</h3>
            <p>Schedule a daily standup summary, a dependency audit or a recurring test sweep.</p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create your first routine
            </Button>
          </div>
        ) : (
          <div className="list-stack">
            {state.routines.map((routine) => {
              const agent = state.agents.find((a) => a.id === routine.agentId);
              return (
                <div className="list-row" key={routine.id} data-testid={`routine-${routine.id}`}>
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {routine.name}
                      <Badge tone={routine.schedule === 'manual' ? 'neutral' : 'cyan'}>
                        {routine.schedule === 'manual' ? 'Manual' : 'Scheduled'}
                      </Badge>
                    </div>
                    <div className="list-row-sub">{routine.prompt.slice(0, 140)}{routine.prompt.length > 140 ? '…' : ''}</div>
                    <div className="list-row-meta">
                      {agent && (
                        <span className="row" style={{ gap: 5 }}>
                          <AgentAvatar name={agent.name} color={agent.color} size={16} /> {agent.name}
                        </span>
                      )}
                      <span>·</span>
                      <span>
                        <Clock3 size={10} /> {scheduleLabel(routine)}
                      </span>
                      <span>·</span>
                      <span>Last run {relative(routine.lastRunAt)}</span>
                      {routine.lastResult && (
                        <>
                          <span>·</span>
                          <span>{routine.lastResult}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="list-row-actions">
                    <Toggle checked={routine.enabled} onChange={(enabled) => toggle(routine, enabled)} label="Enabled" testId={`routine-enabled-${routine.id}`} />
                    <IconButton label="Run now" onClick={() => void run(routine)} disabled={runningId === routine.id} data-testid={`run-routine-${routine.id}`}>
                      {runningId === routine.id ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                    </IconButton>
                    <IconButton label="Edit routine" onClick={() => setEditing(routine)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton label="Delete routine" onClick={() => remove(routine)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="hint-box" style={{ marginTop: 18 }}>
          Routines are local cron-style checks — no cloud scheduler, no account. If ReverseMind is closed, a routine
          simply waits until the next time the app is open.
        </div>
      </div>
      {creating && <RoutineModal onClose={() => setCreating(false)} />}
      {editing && <RoutineModal routine={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
