import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import path from 'path'
import { pathToFileURL } from 'url'
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.amanuensis')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Serve local asset files via asset:// custom protocol — avoids cross-origin
  // restrictions that block file:// URLs when the renderer is loaded from http://localhost
  // (dev) or file:///app/index.html (prod). Main process reads the file directly and
  // returns it as a Fetch Response, so sandbox restrictions on the renderer don't apply.
  protocol.handle('asset', (request) => {
    const url = new URL(request.url)
    // pathname for "asset:///some-uuid.png" → "/some-uuid.png" → strip leading slashes
    const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const assetsDir = join(app.getPath('userData'), 'sessions', 'assets')
    const filePath = join(assetsDir, filename)
    return net.fetch(pathToFileURL(filePath).toString())
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

// ---- Markdown export (Phase 5) ----
ipcMain.handle('export:markdown', async (_event, payload: {
  markdown: string
  assetsToCopy: Array<{ src: string; dest: string }>
}) => {
  const result = await dialog.showSaveDialog({
    title: 'Export Transcript',
    defaultPath: 'transcript.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const mdPath = result.filePath
  const outputDir = path.dirname(mdPath)
  const assetsDir = path.join(outputDir, 'assets')

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

ipcMain.handle('session:copyAsset', async (_event, srcPath: string) => {
  const assetsDir = join(app.getPath('userData'), 'sessions', 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  const ext = path.extname(srcPath)
  const filename = `${crypto.randomUUID()}${ext}`
  await fsPromises.copyFile(srcPath, join(assetsDir, filename))
  return filename
})

ipcMain.handle('session:saveBlobAsset', async (_event, buffer: Buffer, ext: string) => {
  const assetsDir = join(app.getPath('userData'), 'sessions', 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  const filename = `${crypto.randomUUID()}.${ext}`
  await fsPromises.writeFile(join(assetsDir, filename), buffer)
  return filename
})

ipcMain.handle('session:getAssetsDir', async () => {
  const assetsDir = join(app.getPath('userData'), 'sessions', 'assets')
  await fsPromises.mkdir(assetsDir, { recursive: true })
  return assetsDir
})

// ---- Session persistence (Phase 4) ----
ipcMain.handle('session:save', async (_event, data: string) => {
  const sessionDir = join(app.getPath('userData'), 'sessions')
  await fsPromises.mkdir(sessionDir, { recursive: true })
  const sessionPath = join(sessionDir, 'current.json')
  const tmpPath = join(sessionDir, 'current.json.tmp')
  await fsPromises.writeFile(tmpPath, data, 'utf-8')
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
})

ipcMain.handle('session:load', async () => {
  const sessionPath = join(app.getPath('userData'), 'sessions', 'current.json')
  try { return await fsPromises.readFile(sessionPath, 'utf-8') } catch { return null }
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
