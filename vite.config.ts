import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 開発時は /api を同梱バックエンド（:8787）へプロキシする。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
