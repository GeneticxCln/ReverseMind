import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { app } from 'electron';

export interface TerminalOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string;
}

type Emit = (event: string, payload: unknown) => void;

export class TerminalService {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private emit: Emit;
  private ready: Promise<void> | null = null;
  private open = new Set<string>();

  constructor(emit: Emit) {
    this.emit = emit;
  }

  private hostPath(): string {
    const candidates = [
      path.join(process.resourcesPath || '', 'python', 'pty-host.py'),
      path.join(app.getAppPath(), 'python', 'pty-host.py'),
      path.join(process.cwd(), 'python', 'pty-host.py'),
      path.join(__dirname, '..', 'python', 'pty-host.py'),
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    return candidates[1];
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const script = this.hostPath();
      const proc = spawn(process.env.REVERSEMIND_PYTHON || 'python3', [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      }) as ChildProcessWithoutNullStreams;
      this.proc = proc;
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.op === 'data') this.emit('term:data', { id: msg.id, data: msg.data });
          else if (msg.op === 'opened') {
            this.emit('term:opened', { id: msg.id, pid: msg.pid });
            resolve();
          } else if (msg.op === 'exit') {
            this.open.delete(msg.id);
            this.emit('term:exit', { id: msg.id });
          }
          else if (msg.op === 'error') this.emit('term:error', { id: msg.id, error: msg.error });
        } catch {
          // ignore malformed host output
        }
      });
      proc.stderr.on('data', (d) => this.emit('term:hostlog', d.toString()));
      proc.on('error', (err) => {
        this.proc = null;
        this.ready = null;
        reject(new Error(`Could not start the terminal host (${process.env.REVERSEMIND_PYTHON || 'python3'}): ${err.message}`));
      });
      proc.on('exit', () => {
        if (this.proc === proc) this.proc = null;
        this.ready = null;
        for (const id of this.open) this.emit('term:exit', { id });
        this.open.clear();
      });
      setTimeout(resolve, 400);
    });
    return this.ready;
  }

  async create(id: string, opts: TerminalOptions): Promise<{ ok: boolean }> {
    await this.start();
    if (!this.proc) throw new Error('Terminal host is not running');
    this.open.add(id);
    this.send({ op: 'open', id, cwd: opts.cwd, cols: opts.cols || 100, rows: opts.rows || 28, shell: opts.shell || '' });
    return { ok: true };
  }

  write(id: string, data: string): void {
    this.send({ op: 'write', id, data });
  }

  resize(id: string, cols: number, rows: number): void {
    this.send({ op: 'resize', id, cols, rows });
  }

  close(id: string): void {
    this.open.delete(id);
    this.send({ op: 'close', id });
  }

  shutdown(): void {
    this.send({ op: 'shutdown' });
    setTimeout(() => this.proc?.kill('SIGKILL'), 500);
  }

  private send(payload: unknown): void {
    if (!this.proc) return;
    try {
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    } catch {
      // host died
    }
  }
}
