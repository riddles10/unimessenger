import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:9000',
      '/socket.io': {
        target: 'http://localhost:9000',
        ws: true,
      },
    },
  },
})
