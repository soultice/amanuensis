import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startSidecar, killSidecar, getSidecarPort, getSidecarStatus } from './sidecar'
import { existsSync, promises as fsPromises } from 'fs'
import crypto from 'crypto'

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
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:*; img-src 'self' data: blob:; media-src 'self' blob:"
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
  const res = await fetch(`http://localhost:${port}/model/download`, { method: 'POST' })
  if (!res.ok) throw new Error(`Download request failed: ${res.status}`)
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

  // Start sidecar non-blocking — SidecarErrorDialog handles failure in renderer
  startSidecar().catch((err) => {
    console.error('[main] Sidecar failed to start:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
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
