import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(requiredEnv('MOCK_OSS_ROOT'))
const [command, source, destination, ...options] = process.argv.slice(2)

if (command === 'stat') {
  const target = resolveOssUri(source)
  if (!existsSync(target)) {
    fail(`Object not found: ${source}`)
  }
  process.exit(0)
}

if (command !== 'cp' || !source || !destination) {
  fail(`Unsupported mock ossutil command: ${process.argv.slice(2).join(' ')}`)
}

const sourceIsOss = source.startsWith('oss://')
const destinationIsOss = destination.startsWith('oss://')
const ignoreExisting = options.includes('--ignore-existing')

if (!sourceIsOss && destinationIsOss && options.includes('--recursive')) {
  const localSource = resolve(source)
  const ossDestination = resolveOssUri(destination)
  mkdirSync(ossDestination, { recursive: true })
  cpSync(localSource, ossDestination, {
    errorOnExist: false,
    force: !ignoreExisting,
    recursive: true,
  })
} else if (sourceIsOss && destinationIsOss) {
  copy(resolveOssUri(source), resolveOssUri(destination), ignoreExisting)
} else if (sourceIsOss && !destinationIsOss) {
  copy(resolveOssUri(source), resolve(destination), ignoreExisting)
} else {
  fail(`Unsupported mock copy direction: ${source} -> ${destination}`)
}

function copy(from, to, shouldIgnoreExisting) {
  if (!existsSync(from) || !statSync(from).isFile()) {
    fail(`Source object not found: ${from}`)
  }
  if (shouldIgnoreExisting && existsSync(to)) {
    return
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

function resolveOssUri(uri) {
  if (!uri?.startsWith('oss://')) {
    fail(`Invalid OSS URI: ${uri}`)
  }
  const segments = uri.slice('oss://'.length).split('/').filter(Boolean)
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    fail(`Unsafe OSS URI: ${uri}`)
  }
  return join(root, ...segments)
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
