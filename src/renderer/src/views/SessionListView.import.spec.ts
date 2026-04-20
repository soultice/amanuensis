import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import SessionListView from './SessionListView.vue'
import { useSessionStore, type ImportIntentResult } from '../stores/session'
import { UNSUPPORTED_IMPORT_MEDIA_MESSAGE } from '../lib/import-media'

function createApiMock(overrides: Partial<Window['api']> = {}): Window['api'] {
  return {
    getSidecarPort: vi.fn(async () => 0),
    getSidecarStatus: vi.fn(async () => 'ready' as const),
    getModelStatus: vi.fn(async () => ({ state: 'present' as const })),
    downloadModel: vi.fn(async () => undefined),
    restartApp: vi.fn(async () => undefined),
    onModelProgress: vi.fn(() => () => undefined),
    onSidecarReady: vi.fn(() => () => undefined),
    onSidecarError: vi.fn(() => () => undefined),
    exportMarkdown: vi.fn(async () => ({ canceled: false, filePath: '/tmp/export.md' })),
    openFile: vi.fn(async () => null),
    copyAsset: vi.fn(async () => 'copied.file'),
    saveBlobAsset: vi.fn(async () => 'blob.file'),
    getAssetsDir: vi.fn(async () => '/tmp/assets'),
    readSessionAsset: vi.fn(async () => new ArrayBuffer(0)),
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => 'created-session-id'),
    openSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => undefined),
    saveSession: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => false),
    saveAndQuit: vi.fn(async () => undefined),
    onSaveAndQuit: vi.fn(() => () => undefined),
    renameSession: vi.fn(async () => undefined),
    ...overrides,
  }
}

function mountSessionListView(pinia: Pinia): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp(SessionListView, {
    onOpen: vi.fn(),
  })
  app.use(pinia)
  app.mount(container)

  return {
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

async function flushUi(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

describe('SessionListView import entrypoint', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    ;(window as any).api = createApiMock()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('dispatches import through shared session-store action with session-list entrypoint', async () => {
    const sessionStore = useSessionStore()
    const dispatch = vi
      .spyOn(sessionStore, 'startImportIntent')
      .mockResolvedValue({
        status: 'rejected',
        reason: 'cancelled',
        message: 'Import cancelled.',
        entrypoint: 'session-list',
      } satisfies ImportIntentResult)

    const view = mountSessionListView(pinia)
    await flushUi()

    const importButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import Audio')
    )
    expect(importButton).toBeTruthy()

    importButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushUi()

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith('session-list')

    view.unmount()
  })

  it('shows unsupported-format guidance for session-list rejections', async () => {
    const sessionStore = useSessionStore()
    sessionStore.importPhase = 'rejected'
    sessionStore.lastImportError = {
      reason: 'unsupported',
      entrypoint: 'session-list',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    }

    const view = mountSessionListView(pinia)
    await flushUi()

    expect(view.container.textContent).toContain(UNSUPPORTED_IMPORT_MEDIA_MESSAGE)
    expect(view.container.textContent).not.toContain('/tmp/')

    view.unmount()
  })

  it('clears stale unsupported warning when a follow-up import is cancelled', async () => {
    const sessionStore = useSessionStore()
    sessionStore.importPhase = 'rejected'
    sessionStore.lastImportError = {
      reason: 'unsupported',
      entrypoint: 'session-list',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    }

    const view = mountSessionListView(pinia)
    await flushUi()
    expect(view.container.textContent).toContain(UNSUPPORTED_IMPORT_MEDIA_MESSAGE)

    sessionStore.lastImportError = {
      reason: 'cancelled',
      entrypoint: 'session-list',
      message: 'Import cancelled.',
    }
    sessionStore.importPhase = 'rejected'

    await flushUi()

    expect(view.container.textContent).not.toContain(UNSUPPORTED_IMPORT_MEDIA_MESSAGE)
    expect(view.container.textContent).not.toContain('Import cancelled.')

    view.unmount()
  })
})
