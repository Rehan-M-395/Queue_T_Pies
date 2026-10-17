import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, request) => {
            if (request.headers.origin) proxyReq.setHeader('Origin', 'http://localhost:5173')
          })
        },
      },
    },
  },
})
