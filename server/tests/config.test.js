import { describe, expect, it } from 'vitest';
import { startAppWithEnv } from './helpers.js';

describe('trusting a proxy', () => {
  it('is off unless asked for, so X-Forwarded-For cannot choose the client address', async () => {
    // The default used to be the string 'false', which is truthy, so every server that left
    // TRUST_PROXY unset trusted the header and its sign-in rate limit could be walked around.
    const { app, teardown } = await startAppWithEnv({});
    try {
      expect(app.get('trust proxy')).toBe(false);
    } finally {
      await teardown();
    }
  });

  it('is on when TRUST_PROXY says so, as it must be behind Render', async () => {
    const { app, teardown } = await startAppWithEnv({ TRUST_PROXY: 'true' });
    try {
      expect(app.get('trust proxy')).toBe(1);
    } finally {
      await teardown();
    }
  });
});
