import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GitHub Pages serves the app from /<repo>/, so the base path comes from CI.
 * Locally and on any host that serves from the domain root it stays '/'.
 */
const base = process.env.BASE_PATH ?? '/'

/**
 * Pages has no server-side rewrite, so a deep link like /donasi 404s. Shipping
 * index.html as 404.html makes Pages hand the SPA back and the router resolves
 * the path client-side.
 */
const spaFallback = () => ({
  name: 'spa-404-fallback',
  closeBundle() {
    const dir = resolve(__dirname, 'dist')
    copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'))
  },
})

export default defineConfig({
  base,
  plugins: [react(), spaFallback()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          sheets: ['xlsx'],
        },
      },
    },
  },
})
