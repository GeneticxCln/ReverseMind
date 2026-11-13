import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { searchFiles, shellRun, tree } from '../electron/services';
import { nextRoutineRun } from '../src/routines';
import { DEFAULT_INPUT_PRICE_PER_M, estimateCostUsd } from '../src/pricing';

test('tree listing is async, bounded and skips ignored folders', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-big-'));
  try {
    fs.mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules/dep/x.js'), '');
    for (let d = 0; d < 30; d += 1) {
      const dir = path.join(root, `dir${String(d).padStart(2, '0')}`);
      fs.mkdirSync(dir);
      for (let f = 0; f < 300; f += 1) fs.writeFileSync(path.join(dir, `f${f}.txt`), 'x');
    }
    const started = Date.now();
    const result = await tree(root);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.entries.map((e) => e.name)).not.toContain('node_modules');
    const total = (nodes: typeof result.entries): number => nodes.reduce((n, e) => n + 1 + (e.children ? total(e.children) : 0), 0);
    expect(total(result.entries)).toBeLessThanOrEqual(5000);
    expect(result.truncated).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('search finds matches in names and contents, skips binary, big and linked files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-search-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-search-out-'));
  try {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'first line\nthe NEEDLE is here\n');
    fs.writeFileSync(path.join(root, 'needle-name.md'), 'nothing');
    fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([0, 1, 2, 110, 101, 101, 100, 108, 101]));
    fs.writeFileSync(path.join(root, 'big.txt'), 'needle' + 'x'.repeat(1024 * 1024 + 10));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'needle in the outside world');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'linked.txt'));
    const hits = await searchFiles(root, 'needle');
    const files = hits.map((h) => h.path).sort();
    expect(files).toEqual(['needle-name.md', 'notes.txt']);
    expect(hits.find((h) => h.path === 'notes.txt')).toMatchObject({ line: 2, preview: 'the NEEDLE is here' });
    expect(await searchFiles(root, '   ')).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a timed-out command takes its child processes down with it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-shell-'));
  const marker = path.join(root, 'survivor.txt');
  try {
    const started = Date.now();
    const result = await shellRun(root, `(sleep 2; echo alive > '${marker}') & sleep 30`, 700);
    expect(result.code).toBe(-1);
    expect(Date.now() - started).toBeLessThan(5000);
    await new Promise((r) => setTimeout(r, 2600));
    expect(fs.existsSync(marker)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('huge command output is capped instead of buffered forever', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-out-'));
  try {
    const result = await shellRun(root, 'head -c 3000000 /dev/zero | tr "\\0" "a"', 20000);
    expect(result.stdout.length).toBeLessThan(500_000);
    expect(result.stdout).toContain('output truncated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('routine schedules land on the right local time', () => {
  const from = new Date(2026, 10, 13, 10, 30, 0).getTime(); // Fri 13 Nov 2026 10:30
  const at = (t: number | null) => (t === null ? null : new Date(t));
  expect(nextRoutineRun('manual', '09:00', from)).toBeNull();
  const hourly = at(nextRoutineRun('hourly', '09:00', from))!;
  expect([hourly.getHours(), hourly.getMinutes()]).toEqual([11, 0]);
  const laterToday = at(nextRoutineRun('daily', '18:15', from))!;
  expect([laterToday.getDate(), laterToday.getHours(), laterToday.getMinutes()]).toEqual([13, 18, 15]);
  const tomorrow = at(nextRoutineRun('daily', '09:00', from))!;
  expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([14, 9]);
  const monday = at(nextRoutineRun('weekdays', '09:00', new Date(2026, 10, 13, 20, 0).getTime()))!; // Friday evening
  expect([monday.getDay(), monday.getDate()]).toEqual([1, 16]);
  const bad = at(nextRoutineRun('daily', 'nonsense', from))!;
  expect(bad.getHours()).toBe(9);
});

test('cost uses provider prices when set and a documented default otherwise', () => {
  expect(estimateCostUsd(undefined, 1_000_000, 0)).toBe(DEFAULT_INPUT_PRICE_PER_M);
  expect(estimateCostUsd({ inputPricePerM: 1, outputPricePerM: 2 }, 500_000, 500_000)).toBeCloseTo(1.5);
  expect(estimateCostUsd({ inputPricePerM: 0, outputPricePerM: 0 }, 1e9, 1e9)).toBe(0);
});
