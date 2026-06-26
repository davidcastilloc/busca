// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    sessionKVBindingName: 'CACHE_KV'
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});