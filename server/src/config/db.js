import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './env.js';

let memoryServer = null;

/**
 * Where the development database keeps its files when no MONGO_URI is set.
 *
 * Without a dbPath, mongodb-memory-server picks a fresh temp directory on every boot and
 * deletes it on shutdown, so every account created in the last session is gone after a
 * restart. From the outside that is indistinguishable from "the database is not saving
 * anything" - the account really was written, the whole database was simply thrown away.
 */
const DEV_DB_PATH = path.join(config.serverRoot, '.mongo-data');

/** Tests want an empty database every run; a developer wants yesterday's login to still work. */
const keepsData = () => config.NODE_ENV !== 'test';

export async function connectDatabase() {
  let uri = config.MONGO_URI;

  if (!uri) {
    // Imported lazily so production installs never need the dev dependency.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const persist = keepsData();
    if (persist) fs.mkdirSync(DEV_DB_PATH, { recursive: true });
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
  // Build declared indexes (2dsphere in particular) before any geo query runs.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return { inMemory: Boolean(memoryServer) };
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    // doCleanup deletes dbPath. That is right for a test run and wrong for a developer's data.
    await memoryServer.stop({ doCleanup: !keepsData() });
    memoryServer = null;
  }
}

export function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return { state: states[mongoose.connection.readyState] ?? 'unknown', inMemory: Boolean(memoryServer) };
}
