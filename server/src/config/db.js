import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './env.js';

let memoryServer = null;
/** Set while we are deliberately closing, so a planned disconnect is not reported as a fault. */
let shuttingDown = false;

/**
 * Where the development database keeps its files when no MONGO_URI is set.
 *
 * Set MONGO_DB_PATH to move it. Tests do, because a suite that tidies up after itself must
 * never be pointed at a developer's real data.
 *
 * Without a dbPath, mongodb-memory-server picks a fresh temp directory on every boot and
 * deletes it on shutdown, so every account created in the last session is gone after a
 * restart. From the outside that is indistinguishable from "the database is not saving
 * anything" - the account really was written, the whole database was simply thrown away.
 */
const DEV_DB_PATH = config.MONGO_DB_PATH;

/** Tests want an empty database every run; a developer wants yesterday's login to still work. */
const keepsData = () => config.NODE_ENV !== 'test';

const LOCK_FILE = path.join(DEV_DB_PATH, 'krishiscan-server.lock');

/** True when a process with this id is still running. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to someone else, which still counts as in use.
    return err.code === 'EPERM';
  }
}

/**
 * Stops two servers sharing one database directory.
 *
 * Two mongod processes on the same dbPath is not a slow path, it is corruption: observed here as
 * a server that booted, seeded, served a few requests and then lost its database, because the
 * older instance took it away. Restarting a dev server is something people do every few minutes,
 * and the second one has to refuse rather than quietly fight the first.
 */
function claimDataDirectory() {
  // A missing, empty or unparseable lock file all mean the same thing: nobody holds it.
  let held = 0;
  try {
    held = Number.parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10) || 0;
  } catch {
    held = 0;
  }

  if (held && held !== process.pid && alive(held)) {
    throw new Error(
      `Another KrishiScan server (pid ${held}) is already using ${DEV_DB_PATH}. Two servers ` +
        'cannot share one database directory. Stop that one first, or set MONGO_URI to give ' +
        'this server its own database.',
    );
  }
  // Either nothing held it, or the holder is gone and left the file behind.
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseDataDirectory() {
  try {
    if (Number(fs.readFileSync(LOCK_FILE, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch {
    // Nothing to release.
  }
}

export async function connectDatabase() {
  let uri = config.MONGO_URI;

  if (!uri) {
    // Imported lazily so production installs never need the dev dependency.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const persist = keepsData();
    if (persist) {
      fs.mkdirSync(DEV_DB_PATH, { recursive: true });
      claimDataDirectory();
    }
    try {
      memoryServer = await MongoMemoryServer.create(
        persist ? { instance: { dbPath: DEV_DB_PATH, storageEngine: 'wiredTiger' } } : undefined,
      );
    } catch (err) {
      // One directory cannot back two servers: mongod holds a lock on it.
      if (persist && /lock|already in use|addr/i.test(err?.message ?? '')) {
        throw new Error(
          `Could not open the local database at ${DEV_DB_PATH}. Another \`npm run dev\` is ` +
            'probably still running - stop it and try again, or set MONGO_URI to use your own database.',
        );
      }
      throw err;
    }
    uri = memoryServer.getUri('krishiscan');
    if (config.NODE_ENV === 'development') {
      console.log(`[db] MONGO_URI not set; using a local MongoDB stored in ${DEV_DB_PATH}.`);
    }
  }

  mongoose.set('strictQuery', true);
  /**
   * The local database acknowledges a write as soon as it is in memory, and flushes the journal
   * on its own schedule. Measured: a document written and acknowledged, then mongod killed three
   * seconds later, was gone after the restart. On one machine that is a farmer's new account
   * disappearing because a terminal was closed, so the local database waits for the journal.
   * A real MONGO_URI keeps whatever write concern its connection string asks for.
   */
  const options = { serverSelectionTimeoutMS: 10_000 };
  if (memoryServer) options.writeConcern = { w: 1, j: true };
  await mongoose.connect(uri, options);

  if (memoryServer) {
    /**
     * The local database is a mongod this process started. If it goes away while the server is
     * still running - a second `npm run dev` fighting over the same directory, or a stray mongod
     * left by a hard-killed run - every request then waits ten seconds and fails with a stack
     * trace that says nothing about the cause. Say it once, in a sentence, instead.
     */
    let warned = false;
    mongoose.connection.on('disconnected', () => {
      // disconnectDatabase() triggers this event too; only an unplanned one is news.
      if (shuttingDown || warned) return;
      warned = true;
      console.error(
        `[db] lost the local database at ${DEV_DB_PATH}. This usually means a second server is ` +
          'using the same directory, or a mongod was left behind by a run that was killed. Stop ' +
          'any other `npm run dev`, check for a stray mongod, and restart this one.',
      );
    });
    mongoose.connection.on('connected', () => {
      warned = false;
      shuttingDown = false;
    });
  }
  // Build declared indexes (2dsphere in particular) before any geo query runs.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return { inMemory: Boolean(memoryServer) };
}

export async function disconnectDatabase() {
  shuttingDown = true;
  await mongoose.disconnect();
  if (memoryServer) {
    // doCleanup deletes dbPath. That is right for a test run and wrong for a developer's data.
    await memoryServer.stop({ doCleanup: !keepsData() });
    if (keepsData()) releaseDataDirectory();
    memoryServer = null;
  }
}

export function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return { state: states[mongoose.connection.readyState] ?? 'unknown', inMemory: Boolean(memoryServer) };
}
