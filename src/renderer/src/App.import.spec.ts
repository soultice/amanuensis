import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import App from './App.vue'
import { useModelStore } from './stores/model'
import { useSessionStore } from './stores/session'
import { useSidecarStore } from './stores/sidecar'
import { useThemeStore } from './stores/theme'

vi.mock('./views/OnboardingView.vue', () => ({
  default: { name: 'OnboardingViewStub', template: '<div data-test="onboarding" />' },
}))

vi.mock('./views/SessionListView.vue', () => ({
  default: { name: 'SessionListViewStub', template: '<div data-test="session-list" />' },
}))

vi.mock('./views/AppShellView.vue', () => ({
  default: { name: 'AppShellViewStub', template: '<div data-test="app-shell" />' },
}))

vi.mock('./components/SidecarErrorDialog.vue', () => ({
  default: { name: 'SidecarErrorDialogStub', template: '<div data-test="sidecar-error" />' },
}))

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

function mountApp(pinia: Pinia): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp(App)
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

describe('App import orchestration watcher', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    ;(window as any).api = createApiMock()

    const sidecarStore = useSidecarStore()
    vi.spyOn(sidecarStore, 'initialize').mockResolvedValue()

    const modelStore = useModelStore()
    modelStore.state = 'missing'
    vi.spyOn(modelStore, 'refresh').mockResolvedValue()

    const themeStore = useThemeStore()
    vi.spyOn(themeStore, 'init').mockImplementation(() => undefined)

    const sessionStore = useSessionStore()
    vi.spyOn(sessionStore, 'registerSaveOnClose').mockImplementation(() => undefined)
    vi.spyOn(sessionStore, 'listSessions').mockResolvedValue([])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each(['session-list', 'toolbar-open-session'] as const)(
    'consumes accepted pending intent once for %s entrypoint',
    async (entrypoint) => {
      const sessionStore = useSessionStore()
      sessionStore.currentSessionId = 'active-session-id'
      const consume = vi.spyOn(sessionStore, 'consumePendingImportIntent').mockResolvedValue()

      const view = mountApp(pinia)
      await flushUi()

      sessionStore.$patch({
        importPhase: 'accepted',
        pendingImportIntent: {
          sourcePath: '/tmp/interview.mp3',
          entrypoint,
          createNewSession: true,
        },
      })

      await flushUi()
      await flushUi()

      expect(consume).toHaveBeenCalledTimes(1)

      view.unmount()
    }
  )

  it('ignores accepted phase when pending intent payload is missing or malformed', async () => {
    const sessionStore = useSessionStore()
    const consume = vi.spyOn(sessionStore, 'consumePendingImportIntent').mockResolvedValue()

    const view = mountApp(pinia)
    await flushUi()

    sessionStore.$patch({
      importPhase: 'accepted',
      pendingImportIntent: null,
    })
    await flushUi()

    sessionStore.$patch({
      importPhase: 'accepted',
      pendingImportIntent: {
        sourcePath: '',
        entrypoint: 'session-list',
        createNewSession: true,
      },
    })
    await flushUi()

    expect(consume).not.toHaveBeenCalled()

    view.unmount()
  })
})
