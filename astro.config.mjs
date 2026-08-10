// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// Static output (default) — Vercel auto-detects the Astro framework preset
// (build: `astro build`, output: `dist/`). No adapter needed for a static build.
export default defineConfig({
  site: 'https://www.evchandigarh.in',
  integrations: [sitemap()],
});
