import { ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { createServer } from 'net'

/** Find a free TCP port using Node's net module (no ESM dependency). */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = addr && typeof addr === 'object' ? addr.port : 0
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

let sidecarProcess: ChildProcess | null = null
let sidecarPort: number | null = null
let sidecarStatus: 'starting' | 'ready' | 'error' = 'starting'
let sidecarError: string | null = null

export async function startSidecar(): Promise<number> {
  const port = await findFreePort()
  sidecarPort = port
  const userDataDir = app.getPath('userData')

  let command: string
  let args: string[]
  let cwd: string | undefined

  if (is.dev) {
    // Development: use Poetry
    const sidecarDir = path.join(process.cwd(), 'sidecar')
    command = process.platform === 'win32' ? 'poetry.exe' : 'poetry'
    args = ['run', 'python', '-m', 'app.main', '--port', String(port), '--user-data', userDataDir]
    cwd = sidecarDir
    // Ensure Poetry's install directory is in PATH (installed to ~/.local/bin by default)
    const poetryBinDir = path.join(require('os').homedir(), '.local', 'bin')
    process.env.PATH = `${poetryBinDir}${path.delimiter}${process.env.PATH}`
  } else {
    // Production: use PyInstaller binary from extraResources
    const binaryName = process.platform === 'win32' ? 'amanuensis-sidecar.exe' : 'amanuensis-sidecar'
    command = path.join(process.resourcesPath, 'sidecar', binaryName)
    args = ['--port', String(port), '--user-data', userDataDir]
  }

  sidecarProcess = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })

  sidecarProcess.stderr?.on('data', (data: Buffer) => {
    // uvicorn logs go to stderr; only log on error level
    const msg = data.toString()
    if (msg.includes('ERROR') || msg.includes('error')) {
      console.error('[sidecar]', msg.trim())
    }
  })

  sidecarProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      sidecarStatus = 'error'
      sidecarError = `Sidecar exited with code ${code}`
    }
  })

  sidecarProcess.on('error', (err) => {
    sidecarStatus = 'error'
    sidecarError = err.message
    console.error('[main] sidecar spawn error:', err.message)
  })

  try {
    await waitForSidecar(port)
    sidecarStatus = 'ready'
  } catch (err) {
    sidecarStatus = 'error'
    sidecarError = String(err)
    throw err
  }

  return port
}

async function waitForSidecar(port: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Sidecar did not respond on port ${port} within ${timeoutMs}ms`)
}

export function getSidecarPort(): number | null {
  return sidecarPort
}

export function getSidecarStatus(): 'starting' | 'ready' | 'error' {
  return sidecarStatus
}

export function getSidecarError(): string | null {
  return sidecarError
}

export function killSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill()
    sidecarProcess = null
    sidecarStatus = 'starting'
    sidecarPort = null
  }
}
