import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startSidecar, killSidecar, getSidecarPort, getSidecarStatus } from './sidecar'
import { existsSync } from 'fs'

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

app.on('before-quit', () => killSidecar())
app.on('will-quit', () => killSidecar())
