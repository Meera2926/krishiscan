import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Runs the seed CLI the way `npm run seed` does, with a controlled environment. */
async function seedCli(env, args = []) {
  try {
    const { stdout, stderr } = await run(process.execPath, ['src/seed/seed.js', ...args], {
      cwd: SERVER_ROOT,
      env: { ...process.env, MONGO_URI: '', ...env },
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('seed CLI', () => {
  it('refuses to seed a database that is thrown away on exit', async () => {
    const { code, stderr } = await seedCli({ MONGO_URI: '' });

    // Reporting success for 33 documents written into a memory server that is stopped a moment
    // later is the failure mode this guards: the command looked like it worked.
    expect(code).toBe(1);
    expect(stderr).toContain('MONGO_URI is not set');
    expect(stderr).not.toMatch(/\[seed] library/);
    // And it points at the command a developer actually wants locally.
    expect(stderr).toContain('npm run dev');
  }, 70_000);

  it('refuses demo data in production', async () => {
    // The guard must fire before any connection is attempted, so the URI here is never dialled.
    const { code, stderr } = await seedCli(
      {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://127.0.0.1:1/never-dialled',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      },
      ['--demo'],
    );

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to seed demo data');
  }, 70_000);
});
