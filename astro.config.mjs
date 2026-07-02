// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [alpinejs()],
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
    optimizeDeps: {
      exclude: ['zod'],
    },
    build: {
      minify: 'esbuild',
      target: 'esnext',
    },
    esbuild: {
      drop: ['console', 'debugger'],
    }
  },
});