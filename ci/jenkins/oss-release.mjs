import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
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
const staticOrigin = normalizeHttpOrigin(requiredEnv('OSS_STATIC_ORIGIN'), 'OSS_STATIC_ORIGIN')
const ossutil = process.env.OSSUTIL_BIN?.trim() || 'ossutil'
const ossutilBootstrap = process.env.OSSUTIL_BOOTSTRAP?.trim()

validateBucket(bucket)
validateReleaseId(releaseId)
requiredEnv('OSS_ENDPOINT')
requiredEnv('OSS_REGION')
const ecs = getEcsTarget()

const bucketUri = `oss://${bucket}`
const releaseKey = `${releasePrefix}/${releaseId}`
const releaseUri = `${bucketUri}/${releaseKey}`
const candidateIndexUri = `${releaseUri}/index.html`
const candidateManifestUri = `${releaseUri}/release.json`
const readyManifestUri = `${releaseUri}/_READY.json`
const currentManifestUri = `${bucketUri}/_deploy/current.json`
const expectedAssetBase = `${staticOrigin}/${releaseKey}/`
const immutableCache = 'public,max-age=31536000,immutable'
const switchCache = 'no-cache,no-store,must-revalidate'

const expectedManifest = action === 'deploy' ? uploadCandidate() : undefined
const candidateManifest = verifyRemoteCandidate(expectedManifest)

if (action === 'deploy') {
  markCandidateReady()
}

verifyReadyMarker(candidateManifest)
promoteCandidate(candidateManifest)

console.log(`${action === 'deploy' ? 'Published' : 'Rolled back'} release ${releaseId}`)
console.log(`ECS website URL: ${ecs.siteOrigin}/`)
console.log(`Static asset base URL: ${expectedAssetBase}`)

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

function promoteCandidate(candidateManifest) {
  withDownloadedObject(candidateIndexUri, 'candidate-index.html', (contents, indexPath) => {
    verifyIndex(contents.toString('utf8'), `release ${releaseId}`)
    verifyArtifactHash(contents, candidateManifest, 'index.html', `release ${releaseId}`)
    promoteIndexToEcs(indexPath)
    verifyEcsIndexHash(contents)
  })

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
    console.warn(`ECS index switched, but current.json was not updated: ${error.message}`)
  }
}

function verifyIndex(index, source) {
  if (!index.includes(expectedAssetBase)) {
    throw new Error(`${source} does not reference expected asset base URL ${expectedAssetBase}`)
  }

  const assetUrls = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((url) => url.startsWith(expectedAssetBase) && url !== expectedAssetBase)

  if (assetUrls.length === 0) {
    throw new Error(`${source} contains no versioned asset references`)
  }

  return [...new Set(assetUrls)].map((assetUrl) => {
    const path = new URL(assetUrl).pathname
    return `${bucketUri}/${path.slice(1)}`
  })
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
    inspect(readFileSync(destination), destination)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
}

function promoteIndexToEcs(sourcePath) {
  if (process.env.MOCK_ECS_ROOT?.trim()) {
    const mockRoot = resolve(process.env.MOCK_ECS_ROOT.trim())
    const targetDirectory = join(mockRoot, ...ecs.root.split('/').filter(Boolean))
    const stagedIndexPath = join(targetDirectory, `.index.html.${releaseId}`)
    mkdirSync(targetDirectory, { recursive: true })
    copyFileSync(sourcePath, stagedIndexPath)
    renameSync(stagedIndexPath, join(targetDirectory, 'index.html'))
    return
  }

  const stagedIndexPath = `${ecs.root}/.index.html.${releaseId}`
  runSsh(['-o', 'BatchMode=yes', '-p', ecs.port, ecs.target, `mkdir -p ${ecs.root} && chmod 0755 ${ecs.root}`])
  runScp(['-o', 'BatchMode=yes', '-P', ecs.port, sourcePath, `${ecs.target}:${stagedIndexPath}`])
  runSsh(['-o', 'BatchMode=yes', '-p', ecs.port, ecs.target, `mv -f ${stagedIndexPath} ${ecs.indexPath}`])
}

function verifyEcsIndexHash(expectedContents) {
  const expectedHash = createHash('sha256').update(expectedContents).digest('hex')
  let actualHash

  if (process.env.MOCK_ECS_ROOT?.trim()) {
    const mockRoot = resolve(process.env.MOCK_ECS_ROOT.trim())
    const indexPath = join(mockRoot, ...ecs.root.split('/').filter(Boolean), 'index.html')
    actualHash = createHash('sha256').update(readFileSync(indexPath)).digest('hex')
  } else {
    const result = runSsh([
      '-o', 'BatchMode=yes',
      '-p', ecs.port,
      ecs.target,
      `sha256sum ${ecs.indexPath}`,
    ], true)
    actualHash = result.stdout.trim().split(/\s+/, 1)[0]
  }

  if (actualHash !== expectedHash) {
    throw new Error(`ECS stable index failed SHA-256 verification for release ${releaseId}`)
  }
}

function runSsh(args, captureOutput = false) {
  return runProgram('ssh', args, captureOutput)
}

function runScp(args) {
  runProgram('scp', args)
}

function runProgram(command, args, captureOutput = false) {
  const result = spawnSync(command, args, {
    encoding: captureOutput ? 'utf8' : undefined,
    shell: false,
    stdio: captureOutput ? 'pipe' : 'inherit',
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
  return result
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

function getEcsTarget() {
  const host = requiredEnv('ECS_DEPLOY_HOST')
  const user = requiredEnv('ECS_DEPLOY_USER')
  const port = requiredEnv('ECS_DEPLOY_PORT')
  const root = normalizeEcsRoot(requiredEnv('ECS_DEPLOY_ROOT'))
  const siteOrigin = normalizeHttpOrigin(requiredEnv('ECS_SITE_ORIGIN'), 'ECS_SITE_ORIGIN')

  if (!/^[A-Za-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
    throw new Error(`Invalid ECS_DEPLOY_HOST: ${host}`)
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(user)) {
    throw new Error(`Invalid ECS_DEPLOY_USER: ${user}`)
  }
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
    throw new Error(`Invalid ECS_DEPLOY_PORT: ${port}`)
  }

  return {
    host,
    user,
    port,
    root,
    indexPath: `${root}/index.html`,
    target: `${user}@${host}`,
    siteOrigin,
  }
}

function normalizeHttpOrigin(value, name) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid ${name}: ${value}`)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an http(s) origin without a path, query, or fragment`)
  }
  return url.origin
}

function normalizeEcsRoot(value) {
  const normalized = value.replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (
    !normalized.startsWith('/') ||
    !segments.length ||
    segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid ECS_DEPLOY_ROOT: ${value}`)
  }
  return `/${segments.join('/')}`
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
