import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = path.join(repoRoot, 'src', 'index.js')
const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures', 'sync')
const tmpDirs = []

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(tmpDir => rm(tmpDir, { recursive: true, force: true })))
})

async function makeTmpProject() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'envolix-cli-test-'))
  tmpDirs.push(tmpDir)
  return tmpDir
}

async function writeProjectFile(projectDir, filePath, content) {
  const absolutePath = path.join(projectDir, filePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)
}

async function readProjectFile(projectDir, filePath) {
  return readFile(path.join(projectDir, filePath), 'utf8')
}

async function readFixture(name, extension) {
  return readFile(path.join(fixturesRoot, `${name}.${extension}`), 'utf8')
}

function runEnvolix(args, { cwd = repoRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({ code, stdout, stderr })
    })
  })
}

function assertDoesNotAdvertiseDeferredSyncCapabilities(output) {
  assert.doesNotMatch(output, /--config/)
  assert.doesNotMatch(output, /--check/)
  assert.doesNotMatch(output, /--dry-run/)
  assert.doesNotMatch(output, /--source/)
  assert.doesNotMatch(output, /--target/)
  assert.doesNotMatch(output, /--stage/)
  assert.doesNotMatch(output, /configuration files/i)
  assert.doesNotMatch(output, /check mode/i)
  assert.doesNotMatch(output, /multiple Source Environment Files/i)
  assert.doesNotMatch(output, /multiple Sync Targets/i)
  assert.doesNotMatch(output, /automatic git staging/i)
}

describe('envolix CLI', () => {
  it('prints top-level help successfully', async () => {
    const result = await runEnvolix(['--help'])

    assert.equal(result.code, 0)
    assert.match(result.stdout, /Usage:\n  envolix \[command\] \[options\]/)
    assert.match(result.stdout, /sync \[source\] \[target\]/)
    assert.match(result.stdout, /Source Environment File/)
    assertDoesNotAdvertiseDeferredSyncCapabilities(result.stdout)
    assert.equal(result.stderr, '')
  })

  it('prints Sync command help with default paths successfully', async () => {
    const result = await runEnvolix(['sync', '--help'])

    assert.equal(result.code, 0)
    assert.match(result.stdout, /Usage:\n  envolix sync \[source\] \[target\] \[options\]/)
    assert.match(result.stdout, /Source Environment File \(default: \.env\)/)
    assert.match(result.stdout, /Sync Target \/ Example Environment File \(default: \.env\.example\)/)
    assert.match(result.stdout, /Blank Assignments/)
    assertDoesNotAdvertiseDeferredSyncCapabilities(result.stdout)
    assert.equal(result.stderr, '')
  })

  it('rejects unsupported top-level options clearly', async () => {
    const result = await runEnvolix(['--config'])

    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /Unsupported option: --config/)
    assert.match(result.stderr, /Usage:\n  envolix \[command\] \[options\]/)
  })

  it('rejects unsupported Sync options clearly without syncing', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(projectDir, '.env', 'SECRET=source-value\n')

    const result = await runEnvolix(['sync', '--check'], { cwd: projectDir })

    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /Unsupported option: --check/)
    assert.match(result.stderr, /Usage:\n  envolix sync \[source\] \[target\] \[options\]/)
    await assert.rejects(readProjectFile(projectDir, '.env.example'), { code: 'ENOENT' })
  })

  it('rejects unsupported Sync options after positional paths clearly', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(projectDir, '.env', 'SECRET=source-value\n')

    const result = await runEnvolix(['sync', '.env', '.env.example', '--dry-run'], {
      cwd: projectDir,
    })

    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /Unsupported option: --dry-run/)
    await assert.rejects(readProjectFile(projectDir, '.env.example'), { code: 'ENOENT' })
  })

  it('rejects extra Sync arguments clearly', async () => {
    const result = await runEnvolix(['sync', '.env', '.env.example', 'another.env'])

    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /Unexpected argument: another\.env/)
    assert.match(result.stderr, /Usage:\n  envolix sync \[source\] \[target\] \[options\]/)
  })

  it('syncs .env to .env.example by default without exposing source values', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(
      projectDir,
      '.env',
      'SECRET_TOKEN=super-secret-value\nPUBLIC_URL=https://example.test\n',
    )

    const result = await runEnvolix(['sync'], { cwd: projectDir })

    assert.equal(result.code, 0)
    assert.match(result.stdout, /Source Environment File "\.env"/)
    assert.match(result.stdout, /Sync Target "\.env\.example"/)
    assert.match(result.stdout, /Rendered 2 Blank Assignments\./)
    assert.doesNotMatch(result.stdout, /super-secret-value/)
    assert.equal(result.stderr, '')
    assert.equal(await readProjectFile(projectDir, '.env.example'), 'SECRET_TOKEN=\nPUBLIC_URL=\n')
  })

  it('syncs explicit source and target paths and creates the target file', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(projectDir, 'config/local.env', await readFixture('comments-spacing', 'env'))

    const result = await runEnvolix(['sync', 'config/local.env', 'config/example.env'], {
      cwd: projectDir,
    })

    assert.equal(result.code, 0)
    assert.equal(result.stderr, '')
    assert.equal(
      await readProjectFile(projectDir, 'config/example.env'),
      await readFixture('comments-spacing', 'expected'),
    )
    assert.doesNotMatch(result.stdout, /postgres:\/\/user:secret/)
  })

  it('keeps Sync one-way by fully rewriting target-only content', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(projectDir, '.env', 'CURRENT=source-secret\n')
    await writeProjectFile(
      projectDir,
      '.env.example',
      'OLD_TARGET_ONLY=\nCURRENT=target-value\n# target-only documentation\n',
    )

    const result = await runEnvolix(['sync'], { cwd: projectDir })

    assert.equal(result.code, 0)
    assert.equal(result.stderr, '')
    assert.equal(await readProjectFile(projectDir, '.env.example'), 'CURRENT=\n')
    assert.doesNotMatch(result.stdout, /source-secret|target-value/)
  })

  it('does not write the Sync Target when the Source Environment File contains Invalid Source Lines', async () => {
    const projectDir = await makeTmpProject()
    await writeProjectFile(projectDir, '.env', 'VALID=secret\nthis contains secret-value\n')
    await writeProjectFile(projectDir, '.env.example', 'UNCHANGED=\n')

    const result = await runEnvolix(['sync'], { cwd: projectDir })

    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /Invalid Source Line/)
    assert.match(result.stderr, /line 2/)
    assert.doesNotMatch(result.stderr, /secret-value/)
    assert.equal(await readProjectFile(projectDir, '.env.example'), 'UNCHANGED=\n')
  })

  it('reports actionable filesystem errors without creating misleading targets', async () => {
    const projectDir = await makeTmpProject()

    const missingSource = await runEnvolix(['sync'], { cwd: projectDir })

    assert.equal(missingSource.code, 1)
    assert.match(missingSource.stderr, /Could not read Source Environment File "\.env"/)
    assert.match(missingSource.stderr, /does not exist/)

    await writeProjectFile(projectDir, '.env', 'A=secret\n')
    const missingParent = await runEnvolix(['sync', '.env', 'missing/.env.example'], {
      cwd: projectDir,
    })

    assert.equal(missingParent.code, 1)
    assert.match(missingParent.stderr, /Could not write Sync Target "missing\/\.env\.example"/)
    assert.match(missingParent.stderr, /parent directory does not exist/)
  })
})

describe('sync fixtures', () => {
  for (const fixtureName of ['comments-spacing', 'effective-variable', 'node-compatible']) {
    it(`renders ${fixtureName} as a complete Example Environment File`, async () => {
      const projectDir = await makeTmpProject()
      const source = await readFixture(fixtureName, 'env')
      const expected = await readFixture(fixtureName, 'expected')

      await writeProjectFile(projectDir, '.env', source)

      const result = await runEnvolix(['sync'], { cwd: projectDir })

      assert.equal(result.code, 0)
      assert.equal(result.stderr, '')
      assert.equal(await readProjectFile(projectDir, '.env.example'), expected)
    })
  }
})
