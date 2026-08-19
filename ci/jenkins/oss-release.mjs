import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const action = process.argv[2]
if (!['deploy', 'rollback'].includes(action)) {
  throw new Error('Usage: node ci/jenkins/oss-release.mjs <deploy|rollback>')
}

const bucket = requiredEnv('OSS_BUCKET')
const releaseId = requiredEnv('RELEASE_ID')
const releasePrefix = normalizePrefix(requiredEnv('OSS_RELEASE_PREFIX'))
const publicOrigin = requiredEnv('OSS_PUBLIC_ORIGIN').replace(/\/+$/, '')
const ossutil = process.env.OSSUTIL_BIN?.trim() || 'ossutil'
const ossutilBootstrap = process.env.OSSUTIL_BOOTSTRAP?.trim()

validateBucket(bucket)
validateReleaseId(releaseId)
requiredEnv('OSS_ENDPOINT')
requiredEnv('OSS_REGION')

const bucketUri = `oss://${bucket}`
const releaseKey = `${releasePrefix}/${releaseId}`
const releaseUri = `${bucketUri}/${releaseKey}`
const candidateIndexUri = `${releaseUri}/index.html`
const candidateManifestUri = `${releaseUri}/release.json`
const readyManifestUri = `${releaseUri}/_READY.json`
const stableIndexUri = `${bucketUri}/index.html`
const currentManifestUri = `${bucketUri}/_deploy/current.json`
const expectedBase = `/${releaseKey}/`
const immutableCache = 'public,max-age=31536000,immutable'
const switchCache = 'no-cache,no-store,must-revalidate'

const expectedManifest = action === 'deploy' ? uploadCandidate() : undefined
const candidateManifest = verifyRemoteCandidate(expectedManifest)

if (action === 'deploy') {
  markCandidateReady()
}

verifyReadyMarker(candidateManifest)
promoteCandidate()
verifyStableRelease(candidateManifest)

console.log(`${action === 'deploy' ? 'Published' : 'Rolled back'} release ${releaseId}`)
console.log(`Stable object URL: ${publicOrigin}/index.html`)
console.log(`Release object URL: ${publicOrigin}/${releaseKey}/index.html`)

function uploadCandidate() {
  const distPath = resolve(process.env.DIST_DIR?.trim() || 'dist')
  const indexPath = join(distPath, 'index.html')
  const manifestPath = join(distPath, 'release.json')

  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error(`Build output is missing: ${indexPath}`)
  }
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`Release manifest is missing: ${manifestPath}`)
  }
  if (!containsAssetFile(distPath)) {
    throw new Error(`Build output contains no assets: ${join(distPath, 'assets')}`)
  }

  verifyIndex(readFileSync(indexPath, 'utf8'), 'local build')
  const localManifest = verifyManifest(readFileSync(manifestPath), 'local release manifest')
  runOssutil([
    'cp',
    `${distPath}${sep}`,
    `${releaseUri}/`,
    '--recursive',
    '--ignore-existing',
    '--cache-control',
    immutableCache,
  ])
  return localManifest
}

function verifyRemoteCandidate(expectedManifest) {
  runOssutil(['stat', candidateIndexUri])
  runOssutil(['stat', candidateManifestUri])

  let manifest
  withDownloadedObject(candidateManifestUri, 'candidate-release.json', (contents) => {
    manifest = verifyManifest(contents, `release ${releaseId}`)
  })

  if (expectedManifest) {
    assertSameManifest(manifest, expectedManifest, 'uploaded release manifest')
  }

  for (const artifact of manifest.artifacts) {
    runOssutil(['stat', `${releaseUri}/${artifact.path}`])
  }

  withDownloadedObject(candidateIndexUri, 'candidate-index.html', (contents) => {
    verifyIndex(contents.toString('utf8'), `release ${releaseId}`)
    verifyArtifactHash(contents, manifest, 'index.html', `release ${releaseId}`)
  })

  return manifest
}

function markCandidateReady() {
  runOssutil([
    'cp',
    candidateManifestUri,
    readyManifestUri,
    '--ignore-existing',
    '--cache-control',
    immutableCache,
    '--content-type',
    'application/json; charset=utf-8',
  ])
}

function verifyReadyMarker(candidateManifest) {
  runOssutil(['stat', readyManifestUri])
  withDownloadedObject(readyManifestUri, 'ready-release.json', (contents) => {
    const readyManifest = verifyManifest(contents, `ready marker for ${releaseId}`)
    assertSameManifest(readyManifest, candidateManifest, 'ready marker')
  })
}

function promoteCandidate() {
  runOssutil([
    'cp',
    candidateIndexUri,
    stableIndexUri,
    '--force',
    '--cache-control',
    switchCache,
    '--content-type',
    'text/html; charset=utf-8',
    '--metadata',
    `release-id=${releaseId}`,
    '--metadata-directive',
    'REPLACE',
  ])
  try {
    runOssutil([
      'cp',
      candidateManifestUri,
      currentManifestUri,
      '--force',
      '--cache-control',
      switchCache,
      '--content-type',
      'application/json; charset=utf-8',
    ])
  } catch (error) {
    console.warn(`Stable index switched, but current.json was not updated: ${error.message}`)
  }
}

function verifyStableRelease(candidateManifest) {
  withDownloadedObject(stableIndexUri, 'stable-index.html', (contents) => {
    verifyIndex(contents.toString('utf8'), 'stable index')
    verifyArtifactHash(contents, candidateManifest, 'index.html', 'stable index')
  })
}

function verifyIndex(index, source) {
  if (!index.includes(expectedBase)) {
    throw new Error(`${source} does not reference expected base path ${expectedBase}`)
  }

  const assetPaths = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith(expectedBase) && path !== expectedBase)

  if (assetPaths.length === 0) {
    throw new Error(`${source} contains no versioned asset references`)
  }

  return [...new Set(assetPaths)].map((path) => `${bucketUri}/${path.slice(1)}`)
}

function verifyManifest(contents, source) {
  let manifest
  try {
    manifest = JSON.parse(contents.toString('utf8'))
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`)
  }
  if (manifest.releaseId !== releaseId) {
    throw new Error(`${source} points to ${manifest.releaseId}, expected ${releaseId}`)
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error(`${source} contains no artifact inventory`)
  }

  const artifactPaths = new Set()
  for (const artifact of manifest.artifacts) {
    const segments = typeof artifact.path === 'string' ? artifact.path.split('/') : []
    if (
      segments.length === 0 ||
      artifact.path.startsWith('/') ||
      artifact.path.includes('\\') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..') ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size < 0 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256 || '') ||
      artifactPaths.has(artifact.path)
    ) {
      throw new Error(`${source} contains an invalid artifact entry`)
    }
    artifactPaths.add(artifact.path)
  }
  if (!artifactPaths.has('index.html')) {
    throw new Error(`${source} does not inventory index.html`)
  }
  return manifest
}

function assertSameManifest(actual, expected, source) {
  if (
    actual.releaseId !== expected.releaseId ||
    actual.gitCommit !== expected.gitCommit ||
    JSON.stringify(actual.artifacts) !== JSON.stringify(expected.artifacts)
  ) {
    throw new Error(`${source} does not match the expected immutable release`)
  }
}

function verifyArtifactHash(contents, manifest, artifactPath, source) {
  const artifact = manifest.artifacts.find(({ path }) => path === artifactPath)
  const actualHash = createHash('sha256').update(contents).digest('hex')
  if (!artifact || artifact.size !== contents.byteLength || artifact.sha256 !== actualHash) {
    throw new Error(`${source} failed SHA-256 verification for ${artifactPath}`)
  }
}

function withDownloadedObject(uri, fileName, inspect) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'oss-release-'))
  const destination = join(tempDirectory, basename(fileName))
  try {
    runOssutil(['cp', uri, destination, '--force'])
    inspect(readFileSync(destination))
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
}

function runOssutil(args) {
  const commandArgs = ossutilBootstrap ? [ossutilBootstrap, ...args] : args
  console.log(`+ ${ossutil} ${commandArgs.map(formatArgument).join(' ')}`)
  const result = spawnSync(ossutil, commandArgs, {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`ossutil exited with status ${result.status}`)
  }
}

function formatArgument(value) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value)
}

function containsAssetFile(distPath) {
  const assetsPath = join(distPath, 'assets')
  if (!existsSync(assetsPath) || !statSync(assetsPath).isDirectory()) {
    return false
  }
  return readdirSync(assetsPath, { withFileTypes: true }).some((entry) => entry.isFile())
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function validateBucket(value) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) {
    throw new Error(`Invalid OSS bucket name: ${value}`)
  }
}

function validateReleaseId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`Invalid release ID: ${value}`)
  }
}

function normalizePrefix(value) {
  const normalized = value.replace(/^\/+|\/+$/g, '')
  if (!normalized || !/^[A-Za-z0-9._/-]+$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid OSS release prefix: ${value}`)
  }
  return normalized
}
