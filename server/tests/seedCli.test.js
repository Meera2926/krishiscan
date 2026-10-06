import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.join(SERVER_ROOT, '..');

/** argv for a root npm script. On Windows npm is a .cmd, which execFile can only reach via cmd.exe. */
function npmScript(name, args) {
  const line = ['npm', 'run', name, '--', ...args].join(' ');
  return process.platform === 'win32'
    ? { command: 'cmd.exe', prefix: ['/d', '/s', '/c', line] }
    : { command: 'npm', prefix: ['run', name, '--'] };
}

/** Runs the seed CLI the way `npm run seed` does, with a controlled environment. */
async function seedCli(env, args = [], via = {}) {
  const { command = process.execPath, prefix = ['src/seed/seed.js'], cwd = SERVER_ROOT } = via;
  // The args are already baked into `prefix` when the command is cmd.exe.
  const argv = command === 'cmd.exe' ? prefix : [...prefix, ...args];
  try {
    const { stdout, stderr } = await run(command, argv, {
      cwd,
      env: { ...process.env, MONGO_URI: '', ...env },
      timeout: 110_000,
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

  it('forwards --demo through the root npm script', async () => {
    // `npm run seed -w server` swallows everything after `--`: the inner npm reads `--demo` as
    // its own config, the seed script never sees it, and the command exits 0 having created no
    // demo data at all. The trailing `--` in the root script is what forwards it, and this is
    // the only test that exercises the command the README actually tells people to run.
    // Production + --demo is the cheapest observable proof the flag arrived: the guard fires
    // before any connection is attempted, so nothing is dialled and no database is touched.
    const { code, stderr } = await seedCli(
      {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://127.0.0.1:1/never-dialled',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      },
      ['--demo'],
      { ...npmScript('seed', ['--demo']), cwd: REPO_ROOT },
    );

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to seed demo data');
  }, 120_000);

  it('forwards the email through the root reset-password script', async () => {
    // The seed script lost its --demo flag to exactly this missing `--`; reset-password takes an
    // email the same way, and silently dropping it would leave someone locked out with no clue.
    const { code, stdout, stderr } = await seedCli(
      { NODE_ENV: 'test', MONGO_URI: '' },
      ['nobody.at.all@example.test'],
      { ...npmScript('reset-password', ['nobody.at.all@example.test']), cwd: REPO_ROOT },
    );

    const output = stdout + stderr;
    expect(code).toBe(1);
    // It reached the script with the address, rather than printing the usage banner.
    expect(output).toContain('nobody.at.all@example.test');
    expect(output).not.toContain('Usage: npm run reset-password');
  }, 180_000);

  it('explains itself when run with no email at all', async () => {
    const { code, stdout, stderr } = await seedCli({ NODE_ENV: 'test', MONGO_URI: '' }, [], {
      ...npmScript('reset-password', []),
      cwd: REPO_ROOT,
    });
    expect(code).toBe(1);
    expect(stdout + stderr).toContain('Usage: npm run reset-password');
  }, 180_000);
});
