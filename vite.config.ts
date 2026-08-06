import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/datav-template-vue3/' : '/',
  plugins: [vue()],
  server: { port: 5173 },
}))
