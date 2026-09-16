import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { loadClassifier } from './services/inference/index.js';

async function main() {
  const { inMemory } = await connectDatabase();

  if (inMemory) {
    // A fresh in-memory database is empty, so seed it or the app has no crops or diseases.
    const { seedDatabase } = await import('./seed/seed.js');
    await seedDatabase({ withDemoData: true });
  }

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`[server] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });

  // Load the model after the port is bound so platform health checks pass during a slow download.
  loadClassifier();

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    await disconnectDatabase().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
