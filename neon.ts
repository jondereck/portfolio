import { defineConfig } from '@neon/config/v1';

/**
 * Neon branch infrastructure for this portfolio app.
 * Run `npx neon link` then `npx neon deploy` to provision buckets and pull AWS_* into .env.local.
 */
export default defineConfig({
  buckets: {
    'public-assets': { access: 'public_read' },
  },
});
