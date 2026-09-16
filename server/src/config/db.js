import mongoose from 'mongoose';
import { config } from './env.js';

let memoryServer = null;

export async function connectDatabase() {
  let uri = config.MONGO_URI;

  if (!uri) {
    // Imported lazily so production installs never need the dev dependency.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('krishiscan');
    if (config.NODE_ENV === 'development') {
      console.warn('[db] MONGO_URI not set; using in-memory MongoDB. Data will NOT survive a restart.');
    }
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Build declared indexes (2dsphere in particular) before any geo query runs.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return { inMemory: Boolean(memoryServer) };
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return { state: states[mongoose.connection.readyState] ?? 'unknown', inMemory: Boolean(memoryServer) };
}
