import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:5050' },
  },
  // `npm run pwa` serves the production build here (the service worker only
  // registers in a production build). Same /api proxy as the dev server.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5050' },
  },
})
