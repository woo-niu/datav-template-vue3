import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const outputPath = resolve(process.argv[2] || 'dist/release.json')
const releaseId = requiredEnv('RELEASE_ID')
const releasePrefix = normalizePrefix(requiredEnv('OSS_RELEASE_PREFIX'))
const publicOrigin = requiredEnv('OSS_PUBLIC_ORIGIN').replace(/\/+$/, '')
const distPath = dirname(outputPath)
const outputRelativePath = toPosixPath(relative(distPath, outputPath))
const artifacts = listFiles(distPath)
  .map((path) => ({ path, absolutePath: resolve(distPath, ...path.split('/')) }))
  .filter(({ path }) => path !== outputRelativePath)
  .map(({ path, absolutePath }) => {
    const contents = readFileSync(absolutePath)
    return {
      path,
      size: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    }
  })

if (!artifacts.some(({ path }) => path === 'index.html')) {
  throw new Error(`Build output is missing: ${resolve(distPath, 'index.html')}`)
}

const manifest = {
  schemaVersion: 1,
  releaseId,
  gitCommit: requiredEnv('GIT_COMMIT'),
  buildNumber: process.env.BUILD_NUMBER || null,
  createdAt: new Date().toISOString(),
  releaseUrl: `${publicOrigin}/${releasePrefix}/${releaseId}/`,
  artifacts,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Release manifest written: ${outputPath}`)

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function normalizePrefix(value) {
  const normalized = value.replace(/^\/+|\/+$/g, '')
  if (!normalized || !/^[A-Za-z0-9._/-]+$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid OSS release prefix: ${value}`)
  }
  return normalized
}

function listFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        return listFiles(absolutePath, relativePath)
      }
      return entry.isFile() && statSync(absolutePath).isFile() ? [relativePath] : []
    })
    .sort()
}

function toPosixPath(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}
