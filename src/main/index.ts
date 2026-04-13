import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startSidecar, killSidecar, getSidecarPort, getSidecarStatus } from './sidecar'
import { existsSync, promises as fsPromises } from 'fs'
import crypto from 'crypto'

// Must be called synchronously before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,   // REQUIRED — never disable
      nodeIntegration: false,   // REQUIRED — never enable
      sandbox: true
    }
  })

  // Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:*; img-src 'self' data: blob: asset:; media-src 'self' blob: asset:"
        ]
      }
    })
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// IPC handlers — sidecar
ipcMain.handle('sidecar:get-port', () => getSidecarPort())
ipcMain.handle('sidecar:get-status', () => getSidecarStatus())

// IPC handlers — model
ipcMain.handle('model:get-status', async () => {
  const port = getSidecarPort()
  const status = getSidecarStatus()
  if (status === 'ready' && port) {
    try {
      const res = await fetch(`http://localhost:${port}/model/status`)
      if (res.ok) return await res.json()
    } catch {
      // fallthrough to filesystem check
    }
  }
  // Fallback: check userData directly for model.bin presence
  const modelBin = join(app.getPath('userData'), 'models', 'large-v3', 'model.bin')
  return { state: existsSync(modelBin) ? 'present' : 'missing', progress: 0, error: null }
})

ipcMain.handle('model:download', async () => {
  const port = getSidecarPort()
  if (!port) throw new Error('Sidecar not ready — cannot start model download')

  // Start download (returns immediately — sidecar runs it in a background thread)
  const res = await fetch(`http://localhost:${port}/model/download`, { method: 'POST' })
  if (!res.ok) throw new Error(`Download request failed: ${res.status}`)

  // Poll sidecar for download progress and forward to renderer
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  const pollInterval = setInterval(async () => {
    try {
      const statusRes = await fetch(`http://localhost:${port}/model/status`)
      if (!statusRes.ok) return
      const status: { state: string; progress: number } = await statusRes.json()

      if (!win.isDestroyed()) {
        win.webContents.send('model:progress', status.progress)
      }

      if (status.state === 'present' || status.state === 'error') {
        clearInterval(pollInterval)
        if (status.state === 'present' && !win.isDestroyed()) {
          win.webContents.send('model:progress', 100)
        }
      }
    } catch {
      // Sidecar not reachable — continue polling
    }
  }, 500)
})

// IPC handlers — app
ipcMain.handle('app:restart', () => {
  app.relaunch()
  app.exit(0)
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.amanuensis')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Phase 8: migrate legacy single-session current.json → per-session directory
  const legacyPath = join(app.getPath('userData'), 'sessions', 'current.json')
  try {
    const raw = await fsPromises.readFile(legacyPath, 'utf-8')
    const existingIndex = await readSessionIndex()
    // Only migrate if no sessions exist yet (first Phase 8 launch)
    if (existingIndex.length === 0) {
      const id = crypto.randomUUID()
      const now = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
      const sessionDir = join(app.getPath('userData'), 'sessions', id)
      await fsPromises.mkdir(join(sessionDir, 'assets'), { recursive: true })
      await fsPromises.writeFile(join(sessionDir, 'session.json'), raw, 'utf-8')
      // Copy shared assets if they exist
      const legacyAssetsDir = join(app.getPath('userData'), 'sessions', 'assets')
      try {
        const files = await fsPromises.readdir(legacyAssetsDir)
        for (const f of files) {
          await fsPromises.copyFile(join(legacyAssetsDir, f), join(sessionDir, 'assets', f))
        }
      } catch { /* no legacy assets */ }
      const parsed = JSON.parse(raw)
      const wordCount: number = parsed?.transcript?.words?.length ?? 0
      await writeSessionIndex([{ id, name, createdAt: now.toISOString(), updatedAt: now.toISOString(), wordCount }])
      await fsPromises.unlink(legacyPath)
    }
  } catch { /* no legacy session — normal first launch */ }

  createWindow()

  // Serve local asset files via asset:// custom protocol — avoids cross-origin
  // restrictions that block file:// URLs when the renderer is loaded from http://localhost
  // (dev) or file:///app/index.html (prod). Main process reads the file directly and
  // returns it as a Fetch Response, so sandbox restrictions on the renderer don't apply.
  protocol.handle('asset', async (request) => {
    const url = new URL(request.url)
    // Two valid forms reach this handler:
    //   asset://localhost/uuid.png  → hostname='localhost', pathname='/uuid.png'
    //   asset://uuid.png/           → Chromium normalises asset:///uuid.png when
    //                                  no explicit host is given (uuid treated as host)
    // Extract the filename whichever way it arrived.
    const filename = decodeURIComponent(
      url.pathname.replace(/^\/+/, '').replace(/\/$/, '') || url.hostname
    )
    // Phase 8: assets now live in sessions/{sessionId}/assets/. Search all session dirs.
    const sessionsRoot = join(app.getPath('userData'), 'sessions')
    let resolvedPath: string | null = null
    try {
      const entries = await fsPromises.readdir(sessionsRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const candidate = join(sessionsRoot, entry.name, 'assets', filename)
        if (existsSync(candidate)) { resolvedPath = candidate; break }
      }
    } catch { /* no sessions dir yet */ }
    if (!resolvedPath) {
      console.error('[asset-protocol] Asset not found in any session:', filename)
      return new Response('Not found', { status: 404 })
    }
    const filePath = resolvedPath
    try {
      const data = await fsPromises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeTypes: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
        webm: 'audio/webm',
      }
      return new Response(data, {
        headers: { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' },
      })
    } catch (err) {
      console.error('[asset-protocol] Failed to serve:', filePath, err)
      return new Response('Not found', { status: 404 })
    }
  })

  // Start sidecar non-blocking — notify renderer when ready or on failure
  startSidecar()
    .then(() => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('sidecar:ready', getSidecarPort())
      }
    })
    .catch((err: Error) => {
      console.error('[main] Sidecar failed to start:', err)
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('sidecar:error', err.message)
      }
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---- Session index helpers (Phase 8) ----
interface SessionMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  wordCount: number
}

async function readSessionIndex(): Promise<SessionMeta[]> {
  const indexPath = join(app.getPath('userData'), 'sessions', 'index.json')
  try {
    const raw = await fsPromises.readFile(indexPath, 'utf-8')
    return JSON.parse(raw) as SessionMeta[]
  } catch {
    return []
  }
}

async function writeSessionIndex(index: SessionMeta[]): Promise<void> {
  const sessionsDir = join(app.getPath('userData'), 'sessions')
  await fsPromises.mkdir(sessionsDir, { recursive: true })
  const indexPath = join(sessionsDir, 'index.json')
  await fsPromises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

// ---- Markdown export (Phase 5) ----
ipcMain.handle('export:markdown', async (_event, payload: {
  markdown: string
  assetsToCopy: Array<{ src: string; dest: string }>
}) => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Export Folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }

  // Create a timestamped subfolder so the full export is one self-contained folder
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const exportFolder = path.join(result.filePaths[0], `transcript-${stamp}`)
  const assetsDir = path.join(exportFolder, 'assets')
  const mdPath = path.join(exportFolder, 'transcript.md')

  await fsPromises.mkdir(assetsDir, { recursive: true })
  await fsPromises.writeFile(mdPath, payload.markdown, 'utf-8')

  for (const { src, dest } of payload.assetsToCopy) {
    try {
      await fsPromises.copyFile(src, path.join(assetsDir, dest))
    } catch (err) {
      console.error('[export] Failed to copy asset:', src, err)
    }
  }

  return { canceled: false, filePath: mdPath }
})

// ---- File picker & asset management (Phase 4) ----
ipcMain.handle('dialog:openFile', async (_event, filters: Array<{ name: string; extensions: string[] }>) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('session:copyAsset', async (_event, sessionId: string, srcPath: string) => {
  const assetsDir = join(app.getPath('userData'), 'sessions', sessionId, 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  const ext = path.extname(srcPath)
  const filename = `${crypto.randomUUID()}${ext}`
  await fsPromises.copyFile(srcPath, join(assetsDir, filename))
  return filename
})

ipcMain.handle('session:saveBlobAsset', async (_event, sessionId: string, buffer: Buffer, ext: string) => {
  const assetsDir = join(app.getPath('userData'), 'sessions', sessionId, 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  const filename = `${crypto.randomUUID()}.${ext}`
  await fsPromises.writeFile(join(assetsDir, filename), buffer)
  return filename
})

ipcMain.handle('session:getAssetsDir', async (_event, sessionId: string) => {
  const assetsDir = join(app.getPath('userData'), 'sessions', sessionId, 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  return assetsDir
})

// ---- Session persistence (Phase 8 — multi-session) ----

ipcMain.handle('session:list', async () => {
  return await readSessionIndex()
})

ipcMain.handle('session:create', async () => {
  const id = crypto.randomUUID()
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const sessionDir = join(app.getPath('userData'), 'sessions', id)
  const assetsDir = join(sessionDir, 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })

  const emptySession = JSON.stringify({ version: 1, savedAt: now.toISOString(), audioPath: null, transcript: null, annotations: [] })
  await fsPromises.writeFile(join(sessionDir, 'session.json'), emptySession, 'utf-8')

  const index = await readSessionIndex()
  const meta: SessionMeta = { id, name, createdAt: now.toISOString(), updatedAt: now.toISOString(), wordCount: 0 }
  index.unshift(meta)
  await writeSessionIndex(index)
  return id
})

ipcMain.handle('session:open', async (_event, id: string) => {
  const sessionPath = join(app.getPath('userData'), 'sessions', id, 'session.json')
  try { return await fsPromises.readFile(sessionPath, 'utf-8') } catch { return null }
})

ipcMain.handle('session:delete', async (_event, id: string) => {
  const sessionDir = join(app.getPath('userData'), 'sessions', id)
  try { await fsPromises.rm(sessionDir, { recursive: true, force: true }) } catch { /* ignore */ }
  const index = await readSessionIndex()
  await writeSessionIndex(index.filter(s => s.id !== id))
})

ipcMain.handle('session:save', async (_event, payload: { id: string; data: string }) => {
  const sessionDir = join(app.getPath('userData'), 'sessions', payload.id)
  await fsPromises.mkdir(sessionDir, { recursive: true })
  const sessionPath = join(sessionDir, 'session.json')
  const tmpPath = join(sessionDir, 'session.json.tmp')
  await fsPromises.writeFile(tmpPath, payload.data, 'utf-8')
  let retries = 3
  while (retries > 0) {
    try {
      await fsPromises.rename(tmpPath, sessionPath)
      break
    } catch (err: any) {
      if (err.code === 'EPERM' && retries > 1) {
        await new Promise((r) => setTimeout(r, 50))
        retries--
      } else { throw err }
    }
  }
  // Update index metadata
  try {
    const parsed = JSON.parse(payload.data)
    const wordCount: number = parsed?.transcript?.words?.length ?? 0
    const index = await readSessionIndex()
    const entry = index.find(s => s.id === payload.id)
    if (entry) {
      entry.updatedAt = new Date().toISOString()
      entry.wordCount = wordCount
      await writeSessionIndex(index)
    }
  } catch { /* index update is best-effort */ }
})

ipcMain.handle('fs:exists', (_event, filePath: string) => existsSync(filePath))

ipcMain.handle('session:save-complete', () => {
  killSidecar()
  app.quit()
})

// Save-on-close: signal renderer then allow quit
let isQuitting = false
app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault()
    isQuitting = true
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('app:save-and-quit')
      setTimeout(() => { killSidecar(); app.quit() }, 3000)
    } else {
      killSidecar(); app.quit()
    }
  } else {
    killSidecar()
  }
})
app.on('will-quit', () => killSidecar())
