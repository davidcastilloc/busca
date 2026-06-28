// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    sessionKVBindingName: 'CACHE_KV'
  }),
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover'
  },
  security: {
    checkOrigin: false
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      minify: 'esbuild',
      target: 'esnext',
    },
    esbuild: {
      drop: ['console', 'debugger'],
    }
  },
});