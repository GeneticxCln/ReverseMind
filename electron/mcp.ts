import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type { McpServer, McpTool } from '../src/types';

type Emit = (event: string, payload: unknown) => void;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class McpConnection {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private initialized = false;
  tools: McpTool[] = [];
  stderrTail = '';
  onExit: ((reason: string) => void) | null = null;
  private closing = false;
  serverInfo: { name?: string; version?: string } = {};

  constructor(public id: string, public config: Pick<McpServer, 'command' | 'args' | 'env'>) {}

  async connect(timeoutMs = 15000): Promise<{ tools: McpTool[]; serverInfo: unknown }> {
    const [cmd, ...rest] = [this.config.command, ...(this.config.args || [])];
    if (!cmd) throw new Error('MCP command is required');
    const proc = spawn(cmd, rest, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.config.env || {}) },
    }) as ChildProcessWithoutNullStreams;
    this.proc = proc;
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(msg.error.message || 'MCP error'));
        else pending.resolve(msg.result);
      }
    });
    proc.stderr.on('data', (d) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-2000);
    });
    proc.on('exit', (code) => {
      const detail = this.stderrTail.trim().split('\n').slice(-3).join(' ').slice(0, 400);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server exited (code ${code})${detail ? `: ${detail}` : ''}`));
      }
      this.pending.clear();
      this.proc = null;
      this.initialized = false;
      if (!this.closing) this.onExit?.(`Server exited (code ${code})${detail ? `: ${detail}` : ''}`);
    });
    proc.on('error', (err) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });

    const init = (await this.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ReverseMind', version: '0.1.0' },
      },
      timeoutMs
    )) as any;
    this.serverInfo = init?.serverInfo || {};
    this.notify('notifications/initialized', {});
    this.initialized = true;
    const listed = (await this.request('tools/list', {}, timeoutMs)) as any;
    this.tools = Array.isArray(listed?.tools)
      ? listed.tools.map((t: any) => ({
          name: String(t.name),
          description: String(t.description || ''),
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        }))
      : [];
    return { tools: this.tools, serverInfo: this.serverInfo };
  }

  private request(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    const proc = this.proc;
    if (!proc) return Promise.reject(new Error('MCP server is not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  private notify(method: string, params: unknown): void {
    try {
      this.proc?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    } catch {
      // ignore
    }
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 60000): Promise<{ text: string; raw: unknown }> {
    if (!this.initialized) throw new Error('MCP server is not connected');
    const result = (await this.request('tools/call', { name, arguments: args }, timeoutMs)) as any;
    const parts: string[] = [];
    if (Array.isArray(result?.content)) {
      for (const item of result.content) {
        if (item?.type === 'text') parts.push(String(item.text ?? ''));
        else parts.push(`[${item?.type || 'content'}]`);
      }
    }
    if (result?.isError) throw new Error(parts.join('\n') || 'MCP tool returned an error');
    return { text: parts.join('\n') || JSON.stringify(result, null, 2), raw: result };
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.initialized = false;
    const proc = this.proc;
    this.proc = null;
    if (!proc) return;
    try {
      proc.stdin.end();
    } catch {}
    setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch {}
    }, 100);
  }
}

export class McpManager {
  private connections = new Map<string, McpConnection>();
  constructor(private emit: Emit) {}

  async connect(server: McpServer): Promise<{ tools: McpTool[]; serverInfo: unknown }> {
    await this.disconnect(server.id);
    this.emit('mcp:status', { id: server.id, status: 'connecting' });
    const conn = new McpConnection(server.id, server);
    try {
      conn.onExit = (reason) => {
        if (this.connections.get(server.id) === conn) this.connections.delete(server.id);
        this.emit('mcp:status', { id: server.id, status: 'error', error: reason });
      };
      const result = await conn.connect();
      this.connections.set(server.id, conn);
      this.emit('mcp:status', { id: server.id, status: 'connected', tools: result.tools });
      return result;
    } catch (error) {
      await conn.disconnect();
      const detail = conn.stderrTail.trim().split('\n').slice(-3).join(' ').slice(0, 400);
      const message = `${String((error as Error).message || error)}${detail ? ` · ${detail}` : ''}`;
      this.emit('mcp:status', { id: server.id, status: 'error', error: message });
      throw new Error(message);
    }
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    this.connections.delete(id);
    if (conn) await conn.disconnect();
    this.emit('mcp:status', { id, status: 'disconnected' });
  }

  async callTool(serverId: string, tool: string, args: Record<string, unknown>): Promise<{ text: string; raw: unknown }> {
    const conn = this.connections.get(serverId);
    if (!conn) throw new Error('Connect the MCP server first');
    return conn.callTool(tool, args);
  }

  async shutdown(): Promise<void> {
    for (const [id] of this.connections) await this.disconnect(id);
  }
}
