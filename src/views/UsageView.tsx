import React, { useMemo, useState } from 'react';
import { BarChart3, Coins, Cpu, Gauge, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Badge, Button, EmptyState } from '../components/ui';

export function UsageView() {
  const { state, setState, toast } = useStore();
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('30');
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 86_400_000;
  const records = state.usage.filter((record) => record.createdAt >= since);
  const totals = records.reduce(
    (acc, record) => {
      acc.input += record.inputTokens;
      acc.output += record.outputTokens;
      acc.cost += record.costUsd;
      return acc;
    },
    { input: 0, output: 0, cost: 0 }
  );
  const byAgent = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; calls: number }>();
    for (const record of records) {
      const current = map.get(record.agentId) || { tokens: 0, cost: 0, calls: 0 };
      current.tokens += record.inputTokens + record.outputTokens;
      current.cost += record.costUsd;
      current.calls += 1;
      map.set(record.agentId, current);
    }
    return Array.from(map.entries())
      .map(([agentId, value]) => ({
        agentId,
        ...value,
        name: state.agents.find((agent) => agent.id === agentId)?.name || 'Deleted agent',
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [records, state.agents]);
  const maxTokens = Math.max(1, ...byAgent.map((row) => row.tokens));
  const byModel = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const record of records) {
      const key = `${record.provider} · ${record.model}`;
      const current = map.get(key) || { calls: 0, tokens: 0, cost: 0 };
      current.calls += 1;
      current.tokens += record.inputTokens + record.outputTokens;
      current.cost += record.costUsd;
      map.set(key, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens);
  }, [records]);

  return (
    <div className="page" data-testid="usage-page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Usage</h1>
          <p>Token and cost accounting for every local or hosted model call.</p>
        </div>
        <div className="page-head-actions">
          <select className="input" style={{ width: 120, height: 30 }} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={12} />}
            onClick={() => {
              setState((prev) => ({ ...prev, usage: [] }));
              toast('Usage cleared', 'Metering history removed from local state.', 'info');
            }}
            testId="usage-clear"
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="page-body narrow">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total cost</div>
            <div className="stat-value">${totals.cost.toFixed(4)}</div>
            <div className="stat-sub">Local runtime is free</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Input tokens</div>
            <div className="stat-value">{totals.input.toLocaleString()}</div>
            <div className="stat-sub">{records.length} requests</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Output tokens</div>
            <div className="stat-value">{totals.output.toLocaleString()}</div>
            <div className="stat-sub">Across {byModel.length} models</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg tokens / call</div>
            <div className="stat-value">
              {records.length ? Math.round((totals.input + totals.output) / records.length).toLocaleString() : '0'}
            </div>
            <div className="stat-sub">All providers</div>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="empty-state">
            <Gauge size={30} />
            <h3>No usage in this period</h3>
            <p>Send a message or run a routine. The offline runtime records local token estimates at zero cost.</p>
          </div>
        ) : (
          <>
            <div className="page-section">
              <h2>
                <BarChart3 size={13} /> Tokens by agent
              </h2>
              <div className="card card-pad">
                <div className="bar-chart">
                  {byAgent.map((row) => (
                    <div className="bar-row" key={row.agentId}>
                      <div className="bar-label" title={row.name}>{row.name}</div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(2, (row.tokens / maxTokens) * 100)}%` }} />
                      </div>
                      <div className="bar-value">{row.tokens.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="page-section">
              <h2>By provider and model</h2>
              <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th className="num">Calls</th>
                        <th className="num">Tokens</th>
                        <th className="num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byModel.map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td className="num">{value.calls}</td>
                          <td className="num">{value.tokens.toLocaleString()}</td>
                          <td className="num">${value.cost.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="page-section">
              <h2><Coins size={13} /> Recent calls</h2>
              <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                  <table className="data-table" data-testid="usage-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Agent</th>
                        <th>Provider</th>
                        <th className="num">In</th>
                        <th className="num">Out</th>
                        <th className="num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 60).map((record) => (
                        <tr key={record.id}>
                          <td className="faint">{new Date(record.createdAt).toLocaleString()}</td>
                          <td>{state.agents.find((agent) => agent.id === record.agentId)?.name || '—'}</td>
                          <td>
                            {record.provider} <span className="faint">· {record.model}</span>
                          </td>
                          <td className="num">{record.inputTokens}</td>
                          <td className="num">{record.outputTokens}</td>
                          <td className="num">${record.costUsd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="hint-box">
          <Cpu size={12} /> Hosted model calls are billed by your provider, not ReverseMind. Offline runs use a
          deterministic local rules engine and are recorded at $0. <Sparkles size={12} /> No usage leaves this machine.
        </div>
      </div>
    </div>
  );
}
