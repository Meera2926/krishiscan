import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { verifyLegacyExperts } from './services/experts.js';
import { loadClassifier } from './services/inference/index.js';
import { startRetentionScheduler } from './services/retention.js';

async function main() {
  const { inMemory } = await connectDatabase();

  if (inMemory) {
    // The local development database starts empty, so seed it or the app has no crops or
    // diseases at all. Seeding upserts, so later boots leave real accounts and scans alone.
    const { seedDatabase } = await import('./seed/seed.js');
    await seedDatabase({ withDemoData: true });
  }

  // Experts from before verification existed were all put there by an administrator; see the
  // function for why they are trusted rather than locked out of the cases they already hold.
  const grandfathered = await verifyLegacyExperts();
  if (grandfathered) console.log(`[experts] marked ${grandfathered} pre-existing expert account(s) as verified`);

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`[server] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });

  // Load the model after the port is bound so platform health checks pass during a slow download.
  loadClassifier();

  // Reminds farmers about unanswered expert reviews and clears the ones they never booked.
  const stopRetention = startRetentionScheduler();

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    stopRetention();
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
