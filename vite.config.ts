import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.')
  const defaultBase = command === 'build' ? '/datav-template-vue3/' : '/'
  const base = env.VITE_BASE_PATH?.trim() || defaultBase
  const basePath = getBasePath(base)
  const baseSegments = basePath.split('/').filter(Boolean)

  if (
    !base.endsWith('/') ||
    !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath) ||
    baseSegments.some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(
      'VITE_BASE_PATH must be a normalized absolute path or http(s) URL ending with "/"',
    )
  }

  return {
    base,
    plugins: [vue()],
    server: { port: 5173 },
  }
})

function getBasePath(base: string) {
  if (base.startsWith('/')) {
    return base
  }

  try {
    const url = new URL(base)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return ''
    }
    return url.pathname
  } catch {
    return ''
  }
}
