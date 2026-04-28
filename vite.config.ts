import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to local Azure Functions during development.
      // Run `npm run start:api` (in api/) to start the function host on :7071.
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true
      }
    }
  }
})
