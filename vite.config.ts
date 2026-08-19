import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.')
  const defaultBase = command === 'build' ? '/datav-template-vue3/' : '/'
  const base = env.VITE_BASE_PATH?.trim() || defaultBase
  const baseSegments = base.split('/').filter(Boolean)

  if (
    !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base) ||
    baseSegments.some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('VITE_BASE_PATH must be a normalized absolute path ending with "/"')
  }

  return {
    base,
    plugins: [vue()],
    server: { port: 5173 },
  }
})
