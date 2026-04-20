import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { UNSUPPORTED_IMPORT_MEDIA_MESSAGE } from '../lib/import-media'

function createApiMock(overrides: Partial<Window['api']> = {}): Window['api'] {
  return {
    getSidecarPort: vi.fn(async () => 0),
    getSidecarStatus: vi.fn(async () => 'ready'),
    getModelStatus: vi.fn(async () => ({ state: 'present' })),
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

describe('session import intent orchestration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('accepts supported media from session-list entrypoint without branching', async () => {
    const openFile = vi.fn(async () => '/tmp/interview.MP3')
    ;(window as any).api = createApiMock({ openFile })
    const sessionStore = useSessionStore()
    const newSessionSpy = vi.spyOn(sessionStore, 'newSession')

    const result = await sessionStore.startImportIntent('session-list')

    expect(result).toEqual({
      status: 'accepted',
      intent: {
        sourcePath: '/tmp/interview.MP3',
        entrypoint: 'session-list',
        createNewSession: true,
      },
    })
    expect(sessionStore.importPhase).toBe('accepted')
    expect(sessionStore.pendingImportIntent).toEqual({
      sourcePath: '/tmp/interview.MP3',
      entrypoint: 'session-list',
      createNewSession: true,
    })
    expect(sessionStore.lastImportError).toBeNull()
    expect(newSessionSpy).not.toHaveBeenCalled()
    expect(openFile).toHaveBeenCalledTimes(1)
  })

  it('branches through newSession before accepting toolbar import intent', async () => {
    const openFile = vi.fn(async () => '/tmp/interview.wav')
    ;(window as any).api = createApiMock({ openFile })
    const sessionStore = useSessionStore()
    sessionStore.currentSessionId = 'existing-session-id'

    const callOrder: string[] = []
    vi.spyOn(sessionStore, 'newSession').mockImplementation(async () => {
      callOrder.push('new-session')
      sessionStore.currentSessionId = 'branched-session-id'
    })
    openFile.mockImplementation(async () => {
      callOrder.push('open-file')
      return '/tmp/interview.wav'
    })

    const result = await sessionStore.startImportIntent('toolbar-open-session')

    expect(result).toEqual({
      status: 'accepted',
      intent: {
        sourcePath: '/tmp/interview.wav',
        entrypoint: 'toolbar-open-session',
        createNewSession: true,
      },
    })
    expect(callOrder).toEqual(['open-file', 'new-session'])
    expect(sessionStore.currentSessionId).toBe('branched-session-id')
    expect(sessionStore.pendingImportIntent).toEqual({
      sourcePath: '/tmp/interview.wav',
      entrypoint: 'toolbar-open-session',
      createNewSession: true,
    })
    expect(sessionStore.importPhase).toBe('accepted')
  })

  it('rejects unsupported extension with deterministic state and message', async () => {
    ;(window as any).api = createApiMock({
      openFile: vi.fn(async () => '/tmp/interview.mov'),
    })
    const sessionStore = useSessionStore()

    const result = await sessionStore.startImportIntent('session-list')

    expect(result).toEqual({
      status: 'rejected',
      reason: 'unsupported',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
      entrypoint: 'session-list',
    })
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toEqual({
      reason: 'unsupported',
      entrypoint: 'session-list',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
      validationReason: 'unsupported-extension',
    })
  })

  it('rejects missing-extension inputs as unsupported with explicit validation reason', async () => {
    ;(window as any).api = createApiMock({
      openFile: vi.fn(async () => '/tmp/interview'),
    })
    const sessionStore = useSessionStore()

    const result = await sessionStore.startImportIntent('session-list')

    expect(result).toEqual({
      status: 'rejected',
      reason: 'unsupported',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
      entrypoint: 'session-list',
    })
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toEqual({
      reason: 'unsupported',
      entrypoint: 'session-list',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
      validationReason: 'missing-extension',
    })
  })

  it('treats picker cancellation as rejected/cancelled with no mutation', async () => {
    ;(window as any).api = createApiMock({
      openFile: vi.fn(async () => null),
    })
    const sessionStore = useSessionStore()
    sessionStore.pendingImportIntent = {
      sourcePath: '/tmp/previous.mp3',
      entrypoint: 'session-list',
      createNewSession: true,
    }

    const result = await sessionStore.startImportIntent('session-list')

    expect(result).toEqual({
      status: 'rejected',
      reason: 'cancelled',
      message: 'Import cancelled.',
      entrypoint: 'session-list',
    })
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toEqual({
      reason: 'cancelled',
      entrypoint: 'session-list',
      message: 'Import cancelled.',
    })
  })

  it('maps picker and branch failures to explicit orchestration errors while preserving active session', async () => {
    ;(window as any).api = createApiMock({
      openFile: vi.fn(async () => '/tmp/interview.m4a'),
    })
    const sessionStore = useSessionStore()
    sessionStore.currentSessionId = 'existing-session-id'

    vi.spyOn(sessionStore, 'newSession').mockRejectedValue(new Error('createSession failed'))

    const result = await sessionStore.startImportIntent('toolbar-open-session')

    expect(result).toEqual({
      status: 'rejected',
      reason: 'error',
      message: 'Unable to start import right now. Please try again.',
      entrypoint: 'toolbar-open-session',
    })
    expect(sessionStore.currentSessionId).toBe('existing-session-id')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.lastImportError).toEqual({
      reason: 'error',
      entrypoint: 'toolbar-open-session',
      message: 'Unable to start import right now. Please try again.',
      diagnostics: 'Error: createSession failed',
    })
  })

  it('rejects malformed picker responses as orchestration errors', async () => {
    ;(window as any).api = createApiMock({
      openFile: vi.fn(async () => ({ path: '/tmp/interview.mp3' }) as unknown as string),
    })
    const sessionStore = useSessionStore()

    const result = await sessionStore.startImportIntent('session-list')

    expect(result).toEqual({
      status: 'rejected',
      reason: 'error',
      message: 'Unable to start import right now. Please try again.',
      entrypoint: 'session-list',
    })
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toMatchObject({
      reason: 'error',
      entrypoint: 'session-list',
    })
  })
})
