import fs from 'node:fs';
import path from 'node:path';

/** Folders the user has explicitly registered as workspaces. The renderer cannot add to this set. */
export class RootRegistry {
  private roots = new Set<string>();

  register(dir: string): void {
    try {
      this.roots.add(fs.realpathSync(dir));
    } catch {
      // folder missing; nothing to register
    }
  }

  /** Resolve a renderer-supplied workspace path to a registered real path, or throw. */
  resolve(root: unknown): string {
    if (typeof root !== 'string' || !root || !path.isAbsolute(root)) throw new Error('A workspace folder is required');
    let real: string;
    try {
      real = fs.realpathSync(root);
    } catch {
      throw new Error('Workspace folder is not available');
    }
    if (!this.roots.has(real)) throw new Error('That folder is not a registered workspace');
    return real;
  }

  /** True when target is a registered root or lives inside one. */
  contains(target: string): boolean {
    let real: string;
    try {
      real = fs.realpathSync(target);
    } catch {
      return false;
    }
    for (const root of this.roots) {
      if (real === root || real.startsWith(root + path.sep)) return true;
    }
    return false;
  }
}

/** Navigation allowed for the app window itself: bundled files, the app protocol, or the dev server origin. */
export function isAllowedAppNavigation(url: string, devOrigin: string | null): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:' || parsed.protocol === 'rm:') return true;
    return !!devOrigin && parsed.origin === devOrigin;
  } catch {
    return false;
  }
}

/** URLs the embedded browser pane may load. */
export function isAllowedGuestUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'rm:' || url === 'about:blank';
  } catch {
    return false;
  }
}

/** Branch names must not look like options or contain git-special characters. */
export function isSafeRefName(name: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock');
}
