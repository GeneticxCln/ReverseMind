import type { SshConfig } from './types';

const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const USER_RE = /^[A-Za-z_][A-Za-z0-9._-]*$/;

/** Single-quote a value for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Returns an error message, or null when the SSH config is safe to pass to ssh. */
export function validateSshConfig(config: Partial<SshConfig>): string | null {
  const { host, user, path, port } = config;
  if (!host || !HOST_RE.test(host)) return 'Host may only contain letters, digits, dots and dashes.';
  if (!user || !USER_RE.test(user)) return 'User may only contain letters, digits, dots, dashes and underscores.';
  if (!path || /[\0\r\n]/.test(path)) return 'Remote path is empty or contains control characters.';
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) return 'Port must be between 1 and 65535.';
  return null;
}
