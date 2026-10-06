import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A directory this file owns and is free to delete.
 *
 * It must NOT be server/.mongo-data. An earlier version of this test pointed at exactly that and
 * removed it in afterAll, so every `npm test` silently deleted the database the developer was
 * using - every account in it gone, with the app looking like it had never saved anything. A
 * test that cleans up after itself has to clean up after itself only.
 */
const DB_PATH = path.join(os.tmpdir(), 'krishiscan-persistence-test-db');
const PORT = 5178;
const BASE = `http://localhost:${PORT}/api`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Boots the real server the way `npm run dev` does: no MONGO_URI, so it falls back to the local
 * database. NODE_ENV is development on purpose - under "test" the database is deliberately
 * thrown away, which is the behaviour this file exists to distinguish from a bug.
 */
function boot() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      MONGO_URI: '',
      // Keep this suite off the developer's real database.
      MONGO_DB_PATH: DB_PATH,
      // The classifier is irrelevant here and takes seconds to load.
      INFERENCE_DRIVER: 'mock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  return { child, log: () => log };
}

async function waitUp(timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok || res.status === 503) return true;
    } catch {}
    await sleep(400);
  }
  return false;
}

/**
 * Stops the server the blunt way. On Windows this is a TerminateProcess, so no shutdown hook
 * runs - which is exactly what a closed terminal or a stopped debugger does, and the case where
 * an acknowledged-but-unjournalled write would be lost.
 */
async function stop(server) {
  server.child.kill();
  const until = Date.now() + 30_000;
  while (Date.now() < until && server.child.exitCode === null) await sleep(150);
  await sleep(1200);
}

const started = [];
async function bootAndWait() {
  const s = boot();
  started.push(s);
  const up = await waitUp();
  if (!up) throw new Error(`server did not start:\n${s.log().slice(-1500)}`);
  return s;
}

afterAll(async () => {
  for (const s of started) if (s.child.exitCode === null) s.child.kill();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => {});
});

describe('the local development database', () => {
  it('still has the account after the server restarts', async () => {
    await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => {});

    const email = `restart.${Date.now()}@example.test`;
    const password = 'restart-check-pw-1';

    let server = await bootAndWait();
    const registered = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Restart Check', email, password }),
    });
    expect(registered.status).toBe(201);
    const { accessToken } = await registered.json();

    const plot = await fetch(`${BASE}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: 'Restart Plot', crop: 'tomato', lat: 19.99, lng: 73.78 }),
    });
    expect(plot.status).toBe(201);

    await stop(server);
    server = await bootAndWait();

    // Before the database kept its files, this came back 401: the account was real, the whole
    // database had simply been thrown away, so the farmer had to register again every session.
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);

    const session = await login.json();
    const plots = await fetch(`${BASE}/plots`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    const { plots: saved } = await plots.json();
    expect(saved.map((p) => p.name)).toContain('Restart Plot');

    // Re-seeding on every boot must leave the demo accounts alone rather than duplicate them.
    const demo = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@demo.in', password: 'demo1234' }),
    });
    expect(demo.status).toBe(200);

    await stop(server);
  }, 300_000);

  it('refuses to let a second server share the same database directory', async () => {
    // Two mongod processes on one dbPath corrupts it: in practice the first server kept serving
    // and then silently lost its database to the second. A refusal with a readable reason beats
    // a server that works for a minute and then starts returning 500s.
    const first = await bootAndWait();

    const second = boot();
    started.push(second);
    const until = Date.now() + 40_000;
    while (Date.now() < until && second.child.exitCode === null) await sleep(300);

    expect(second.child.exitCode).not.toBeNull();
    expect(second.log()).toContain('Another KrishiScan server');
    expect(second.log()).toContain('cannot share one database directory');

    // The server that got there first is untouched.
    const health = await fetch(`${BASE}/health`).then((r) => r.json());
    expect(health.database.state).toBe('connected');

    await stop(first);
  }, 180_000);
});
