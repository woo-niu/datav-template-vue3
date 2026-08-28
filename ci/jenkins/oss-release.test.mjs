import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const releaseScript = join(scriptDirectory, 'oss-release.mjs')
const mockOssutil = join(scriptDirectory, 'mock-ossutil.mjs')

test('keeps releases immutable and rejects an incomplete rollback', () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'oss-release-test-'))
  const mockRoot = join(tempDirectory, 'oss')
  const mockEcsRoot = join(tempDirectory, 'ecs')

  try {
    const firstRelease = '100-a1b2c3d4'
    const secondRelease = '101-e5f6a7b8'
    const firstDist = createDist(tempDirectory, firstRelease)
    const secondDist = createDist(tempDirectory, secondRelease)

    runRelease('deploy', firstRelease, firstDist, mockRoot, mockEcsRoot)
    assertStableRelease(mockRoot, mockEcsRoot, firstRelease)

    runRelease('deploy', secondRelease, secondDist, mockRoot, mockEcsRoot)
    assertStableRelease(mockRoot, mockEcsRoot, secondRelease)

    const collidingDist = createDist(tempDirectory, firstRelease, 'changed')
    const collidingDeploy = runRelease('deploy', firstRelease, collidingDist, mockRoot, mockEcsRoot, false)
    assert.notEqual(collidingDeploy.status, 0)
    assertStableRelease(mockRoot, mockEcsRoot, secondRelease)

    const firstAsset = objectPath(
      mockRoot,
      `releases/${firstRelease}/assets/app-deadbeef.js`,
    )
    rmSync(firstAsset)

    const failedRollback = runRelease('rollback', firstRelease, firstDist, mockRoot, mockEcsRoot, false)
    assert.notEqual(failedRollback.status, 0)
    assertStableRelease(mockRoot, mockEcsRoot, secondRelease)

    writeFileSync(firstAsset, 'console.log("release")\n', 'utf8')
    runRelease('rollback', firstRelease, firstDist, mockRoot, mockEcsRoot)
    assertStableRelease(mockRoot, mockEcsRoot, firstRelease)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
})

function createDist(tempDirectory, releaseId, variant = 'release') {
  const distPath = join(tempDirectory, `dist-${releaseId}-${variant}`)
  const assetsPath = join(distPath, 'assets')
  const base = `https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com/releases/${releaseId}/`
  const indexContents = `<!doctype html><script type="module" src="${base}assets/app-deadbeef.js"></script>\n`
  const assetContents = `console.log("${variant}")\n`
  mkdirSync(assetsPath, { recursive: true })
  writeFileSync(join(distPath, 'index.html'), indexContents, 'utf8')
  writeFileSync(join(assetsPath, 'app-deadbeef.js'), assetContents, 'utf8')
  writeFileSync(
    join(distPath, 'release.json'),
    `${JSON.stringify({
      releaseId,
      gitCommit: 'test-commit',
      artifacts: [
        artifactEntry('assets/app-deadbeef.js', assetContents),
        artifactEntry('index.html', indexContents),
      ],
    })}\n`,
    'utf8',
  )
  return distPath
}

function artifactEntry(path, contents) {
  const bytes = Buffer.from(contents)
  return {
    path,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function runRelease(action, releaseId, distPath, mockRoot, mockEcsRoot, expectSuccess = true) {
  const result = spawnSync(process.execPath, [releaseScript, action], {
    cwd: resolve(scriptDirectory, '../..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DIST_DIR: distPath,
      MOCK_OSS_ROOT: mockRoot,
      OSSUTIL_BIN: process.execPath,
      OSSUTIL_BOOTSTRAP: mockOssutil,
      OSS_BUCKET: 'wn-test-deploy',
      OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com',
      OSS_STATIC_ORIGIN: 'https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com',
      ECS_DEPLOY_HOST: '203.0.113.10',
      ECS_DEPLOY_PORT: '22',
      ECS_DEPLOY_USER: 'deploy',
      ECS_DEPLOY_ROOT: '/srv/datav',
      ECS_SITE_ORIGIN: 'http://203.0.113.10',
      MOCK_ECS_ROOT: mockEcsRoot,
      OSS_REGION: 'cn-hangzhou',
      OSS_RELEASE_PREFIX: 'releases',
      RELEASE_ID: releaseId,
    },
  })

  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `release command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
  }
  return result
}

function assertStableRelease(mockRoot, mockEcsRoot, releaseId) {
  const stableIndex = readFileSync(join(mockEcsRoot, 'srv', 'datav', 'index.html'), 'utf8')
  const current = JSON.parse(
    readFileSync(objectPath(mockRoot, '_deploy/current.json'), 'utf8'),
  )
  assert.match(stableIndex, new RegExp(`/releases/${releaseId}/`))
  assert.equal(current.releaseId, releaseId)
}

function objectPath(mockRoot, key) {
  return join(mockRoot, 'wn-test-deploy', ...key.split('/'))
}
