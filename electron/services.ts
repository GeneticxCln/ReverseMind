import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { isSafeRefName } from './security';
import { shellQuote, validateSshConfig } from '../src/ssh';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  children?: FileNode[];
}

const IGNORED = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'dist-renderer', '.cache', '__pycache__', '.venv', 'target']);

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Resolve target inside root. Rejects lexical escapes and symlinks that lead outside.
 * With nofollow, the final component may itself be a symlink (for rename/delete of the link).
 */
export function assertInside(root: string, target: string, opts: { nofollow?: boolean } = {}): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, target);
  if (!isInside(resolvedRoot, resolved)) throw new Error('Path escapes the workspace root');
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch {
    throw new Error('Workspace folder is not available');
  }
  let probe = opts.nofollow && resolved !== resolvedRoot ? path.dirname(resolved) : resolved;
  for (;;) {
    try {
      if (!isInside(realRoot, fs.realpathSync(probe))) throw new Error('Path escapes the workspace root');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return resolved;
}

export interface TreeResult {
  entries: FileNode[];
  /** True when the listing was cut short by the entry or depth limits. */
  truncated: boolean;
}

const TREE_MAX_ENTRIES = 5000;
const TREE_MAX_DEPTH = 8;
const TREE_PER_DIR = 400;

/** Directory listing that never blocks the main process and stays bounded on huge repos. */
export async function tree(root: string): Promise<TreeResult> {
  const base = assertInside(root, '');
  let count = 0;
  let truncated = false;
  const walk = async (dir: string, rel: string, depth: number): Promise<FileNode[]> => {
    if (depth > TREE_MAX_DEPTH) {
      truncated = true;
      return [];
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    entries = entries
      .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith('.DS_Store'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    if (entries.length > TREE_PER_DIR) {
      truncated = true;
      entries = entries.slice(0, TREE_PER_DIR);
    }
    const out: FileNode[] = [];
    for (const e of entries) {
      if (count >= TREE_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      count += 1;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push({ name: e.name, path: childRel, type: 'directory', children: await walk(abs, childRel, depth + 1) });
      } else {
        let size = 0;
        let mtimeMs = 0;
        try {
          const st = await fs.promises.stat(abs);
          size = st.size;
          mtimeMs = st.mtimeMs;
        } catch {
          // dangling link or removed while listing
        }
        out.push({ name: e.name, path: childRel, type: 'file', size, mtimeMs });
      }
    }
    return out;
  };
  const entries = await walk(base, '', 0);
  return { entries, truncated };
}

export function readText(root: string, rel: string): { content: string; size: number; binary: boolean } {
  const abs = assertInside(root, rel);
  const buf = fs.readFileSync(abs);
  const binary = buf.subarray(0, 8000).includes(0);
  return { content: binary ? '' : buf.toString('utf8'), size: buf.length, binary };
}

export function writeText(root: string, rel: string, content: string): { ok: true; path: string } {
  const abs = assertInside(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return { ok: true, path: rel };
}

export function mkdir(root: string, rel: string): { ok: true } {
  fs.mkdirSync(assertInside(root, rel), { recursive: true });
  return { ok: true };
}

export function rename(root: string, from: string, to: string): { ok: true } {
  const a = assertInside(root, from, { nofollow: true });
  const b = assertInside(root, to);
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.renameSync(a, b);
  return { ok: true };
}

export function remove(root: string, rel: string): { ok: true } {
  const abs = assertInside(root, rel, { nofollow: true });
  if (abs === path.resolve(root)) throw new Error('Cannot delete the workspace root');
  const st = fs.lstatSync(abs);
  if (st.isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
  else fs.unlinkSync(abs);
  return { ok: true };
}

const SEARCH_MAX_FILES = 8000;
const SEARCH_MAX_MS = 4000;
const SEARCH_MAX_BYTES = 1024 * 1024;

export async function searchFiles(root: string, query: string, limit = 50): Promise<{ path: string; line: number; preview: string }[]> {
  const results: { path: string; line: number; preview: string }[] = [];
  const q = query.toLowerCase();
  if (!q.trim()) return results;
  const base = assertInside(root, '');
  const deadline = Date.now() + SEARCH_MAX_MS;
  let scanned = 0;
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > 6 || results.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= limit || scanned >= SEARCH_MAX_FILES || Date.now() > deadline) return;
      if (IGNORED.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs, childRel, depth + 1);
        continue;
      }
      if (!e.isFile()) continue; // skips symlinks, sockets and other specials
      scanned += 1;
      if (e.name.toLowerCase().includes(q)) results.push({ path: childRel, line: 1, preview: e.name });
      let text: string;
      try {
        const handle = await fs.promises.open(abs, 'r');
        try {
          const st = await handle.stat();
          if (st.size > SEARCH_MAX_BYTES) continue;
          const buf = await handle.readFile();
          if (buf.subarray(0, 4000).includes(0)) continue;
          text = buf.toString('utf8');
        } finally {
          await handle.close();
        }
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && results.length < limit; i += 1) {
        if (lines[i].toLowerCase().includes(q)) results.push({ path: childRel, line: i + 1, preview: lines[i].trim().slice(0, 200) });
      }
    }
  };
  await walk(base, '', 0);
  return results;
}

const MAX_CAPTURE = 400_000;

function run(cmd: string, args: string[], cwd: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; code: number; truncated: boolean }> {
  return new Promise((resolve) => {
    // detached puts the child in its own process group so a timeout can kill its whole tree.
    const child = spawn(cmd, args, { cwd, detached: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let settled = false;
    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const append = (current: string, chunk: Buffer) => {
      if (current.length >= MAX_CAPTURE) {
        truncated = true;
        return current;
      }
      return current + chunk.toString();
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        killTree();
        resolve({ stdout, stderr: stderr + '\nTimed out', code: -1, truncated });
      }
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout = append(stdout, d)));
    child.stderr.on('data', (d) => (stderr = append(stderr, d)));
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr: String(err), code: -1, truncated });
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? -1, truncated });
      }
    });
  });
}

export { run };

export interface GitFile {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  untracked: boolean;
}

/** Parse the `## ...` header of `git status --porcelain=v1 --branch`. */
export function parseBranchLine(line: string): { branch: string; ahead: number; behind: number } {
  let rest = line.replace(/^## /, '');
  let ahead = 0;
  let behind = 0;
  const track = rest.match(/ \[([^\]]*)\]$/);
  if (track) {
    ahead = Number(/ahead (\d+)/.exec(track[1])?.[1] || 0);
    behind = Number(/behind (\d+)/.exec(track[1])?.[1] || 0);
    rest = rest.slice(0, track.index);
  }
  const fresh = rest.match(/^(?:No commits yet|Initial commit) on (.+)$/);
  if (fresh) return { branch: fresh[1], ahead, behind };
  const sep = rest.indexOf('...');
  return { branch: sep >= 0 ? rest.slice(0, sep) : rest, ahead, behind };
}

export async function gitStatus(root: string): Promise<{
  isRepo: boolean;
  branch: string;
  files: GitFile[];
  ahead: number;
  behind: number;
  error?: string;
}> {
  if (!fs.existsSync(root)) return { isRepo: false, branch: '', files: [], ahead: 0, behind: 0, error: 'Workspace missing' };
  const check = await run('git', ['rev-parse', '--is-inside-work-tree'], root, 8000);
  if (check.code !== 0) return { isRepo: false, branch: '', files: [], ahead: 0, behind: 0 };
  const status = await run('git', ['status', '--porcelain=v1', '--branch'], root, 15000);
  const lines = status.stdout.split('\n').filter(Boolean);
  const files: GitFile[] = [];
  let branch = '';
  let ahead = 0;
  let behind = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      ({ branch, ahead, behind } = parseBranchLine(line));
      continue;
    }
    const index = line[0];
    const worktree = line[1];
    let rest = line.slice(3);
    if (rest.includes(' -> ')) rest = rest.split(' -> ')[1];
    files.push({
      path: rest.replace(/^"|"$/g, ''),
      index,
      worktree,
      staged: index !== ' ' && index !== '?',
      untracked: index === '?',
    });
  }
  return { isRepo: true, branch, files, ahead, behind };
}

export async function gitDiff(root: string, file?: string, staged = false): Promise<string> {
  const args = ['diff', '--no-color'];
  if (staged) args.push('--cached');
  if (file) args.push('--', file);
  const res = await run('git', args, root, 20000);
  return res.stdout || res.stderr;
}

export async function gitStage(root: string, file: string): Promise<{ ok: boolean; output: string }> {
  const res = await run('git', ['add', '--', file], root);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export async function gitUnstage(root: string, file: string): Promise<{ ok: boolean; output: string }> {
  const res = await run('git', ['restore', '--staged', '--', file], root);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export async function gitDiscard(root: string, file: string): Promise<{ ok: boolean; output: string }> {
  const status = await gitStatus(root);
  const entry = status.files.find((f) => f.path === file);
  const args = entry?.untracked ? ['clean', '-f', '--', file] : ['checkout', '--', file];
  const res = await run('git', args, root);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export async function gitCommit(root: string, message: string): Promise<{ ok: boolean; output: string }> {
  const res = await run('git', ['commit', '-m', message], root, 30000);
  return { ok: res.code === 0, output: (res.stdout + res.stderr).trim() };
}

export async function gitLog(root: string): Promise<{ hash: string; subject: string; date: string; author: string }[]> {
  const res = await run('git', ['log', '--pretty=format:%H%x1f%s%x1f%ad%x1f%an', '--date=short', '-n', '40'], root);
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, date, author] = line.split('\x1f');
      return { hash, subject, date, author };
    });
}

export async function gitBranches(root: string): Promise<{ branches: string[]; current: string }> {
  const res = await run('git', ['branch', '--format=%(refname:short)'], root);
  const cur = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root);
  return {
    branches: res.stdout.split('\n').filter(Boolean),
    current: cur.stdout.trim(),
  };
}

export async function gitCheckout(root: string, branch: string): Promise<{ ok: boolean; output: string }> {
  if (!isSafeRefName(branch)) return { ok: false, output: 'Invalid branch name' };
  const res = await run('git', ['checkout', branch, '--'], root, 30000);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

export async function gitWorktrees(root: string): Promise<WorktreeInfo[]> {
  const res = await run('git', ['worktree', 'list', '--porcelain'], root);
  const list: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> = {};
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) cur.path = line.slice(9);
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line.startsWith('bare')) cur.bare = true;
    else if (line === '') {
      if (cur.path) list.push({ path: cur.path, branch: cur.branch || '(detached)', head: cur.head || '', bare: !!cur.bare });
      cur = {};
    }
  }
  return list;
}

export async function gitWorktreeAdd(root: string, target: string, branch: string): Promise<{ ok: boolean; output: string }> {
  if (!isSafeRefName(branch)) return { ok: false, output: 'Invalid branch name' };
  if (!path.isAbsolute(target)) return { ok: false, output: 'Worktree path must be absolute' };
  const res = await run('git', ['worktree', 'add', '-b', branch, '--', target], root, 30000);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export async function initRepo(root: string): Promise<{ ok: boolean; output: string }> {
  const res = await run('git', ['init'], root, 15000);
  await run('git', ['add', '-A'], root, 15000);
  const commit = await run('git', ['commit', '--allow-empty', '-m', 'Initial commit'], root, 30000);
  return { ok: res.code === 0 && commit.code === 0, output: res.stdout + res.stderr + commit.stderr };
}

export async function shellRun(
  root: string,
  command: string,
  timeoutMs = 120000
): Promise<{ stdout: string; stderr: string; code: number; durationMs: number }> {
  const started = Date.now();
  const res = await run('/bin/bash', ['-lc', command], root, timeoutMs);
  const cap = (s: string) => (res.truncated || s.length > MAX_CAPTURE ? s.slice(0, MAX_CAPTURE) + '\n… output truncated' : s);
  return { stdout: cap(res.stdout), stderr: cap(res.stderr), code: res.code, durationMs: Date.now() - started };
}

export async function sshProbe(config: { host: string; user: string; path: string; port?: number }): Promise<{ ok: boolean; output: string }> {
  const invalid = validateSshConfig(config);
  if (invalid) return { ok: false, output: invalid };
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=6'];
  if (config.port) args.push('-p', String(config.port));
  args.push('--', `${config.user}@${config.host}`, `echo REVERSEMIND_OK; cd ${shellQuote(config.path)} && pwd`);
  const res = await run('ssh', args, process.env.HOME || '/', 15000);
  return { ok: res.code === 0 && res.stdout.includes('REVERSEMIND_OK'), output: (res.stdout + res.stderr).trim() };
}
