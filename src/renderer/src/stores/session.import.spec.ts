import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useRecordingStore } from './recording'
import { useSidecarStore } from './sidecar'
import { useTranscriptStore } from './transcript'
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

  it('consumes accepted intent into canonical session audio state and starts batch transcription', async () => {
    const copyAsset = vi.fn(async () => 'copied-track.mp4')
    ;(window as any).api = createApiMock({ copyAsset })

    const sessionStore = useSessionStore()
    const recordingStore = useRecordingStore()
    const transcriptStore = useTranscriptStore()
    const transcribeBatchAudio = vi.spyOn(transcriptStore, 'transcribeBatchAudio').mockResolvedValue()

    sessionStore.currentSessionId = 'active-session-id'
    sessionStore.importPhase = 'accepted'
    sessionStore.pendingImportIntent = {
      sourcePath: '/tmp/interview.mp4',
      entrypoint: 'session-list',
      createNewSession: true,
    }

    await sessionStore.consumePendingImportIntent()

    expect(copyAsset).toHaveBeenCalledTimes(1)
    expect(copyAsset).toHaveBeenCalledWith('active-session-id', '/tmp/interview.mp4')
    expect(recordingStore.audioBlobUrl).toBe('asset://localhost/copied-track.mp4')
    expect(recordingStore.recordingState).toBe('stopped')
    expect(transcribeBatchAudio).toHaveBeenCalledTimes(1)
    expect(transcribeBatchAudio.mock.calls[0]?.[1]).toBe('copied-track.mp4')
    expect(sessionStore.importPhase).toBe('idle')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toBeNull()
  })

  it('creates and opens a new session before canonicalization when no active session exists', async () => {
    const copyAsset = vi.fn(async () => 'copied-track.mp3')
    const createSession = vi.fn(async () => 'created-session-id')
    const openSession = vi.fn(async () => null)
    ;(window as any).api = createApiMock({ copyAsset, createSession, openSession })

    const sessionStore = useSessionStore()
    const transcriptStore = useTranscriptStore()
    const transcribeBatchAudio = vi.spyOn(transcriptStore, 'transcribeBatchAudio').mockResolvedValue()

    sessionStore.currentSessionId = null
    sessionStore.importPhase = 'accepted'
    sessionStore.pendingImportIntent = {
      sourcePath: '/tmp/interview.mp3',
      entrypoint: 'session-list',
      createNewSession: true,
    }

    await sessionStore.consumePendingImportIntent()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith('created-session-id')
    expect(copyAsset).toHaveBeenCalledWith('created-session-id', '/tmp/interview.mp3')
    expect(transcribeBatchAudio).toHaveBeenCalledTimes(1)
    expect(transcribeBatchAudio.mock.calls[0]?.[1]).toBe('copied-track.mp3')
    expect(sessionStore.currentSessionId).toBe('created-session-id')
    expect(sessionStore.importPhase).toBe('idle')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toBeNull()
  })

  it('surfaces copy failures without mutating prior canonical audio state', async () => {
    const copyAsset = vi.fn(async () => {
      throw new Error('copy failed')
    })
    ;(window as any).api = createApiMock({ copyAsset })

    const sessionStore = useSessionStore()
    const recordingStore = useRecordingStore()

    recordingStore.audioBlobUrl = 'asset://localhost/previous-track.wav'
    recordingStore.recordingState = 'stopped'

    sessionStore.currentSessionId = 'active-session-id'
    sessionStore.importPhase = 'accepted'
    sessionStore.pendingImportIntent = {
      sourcePath: '/tmp/interview.wav',
      entrypoint: 'toolbar-open-session',
      createNewSession: true,
    }

    await sessionStore.consumePendingImportIntent()

    expect(copyAsset).toHaveBeenCalledTimes(1)
    expect(recordingStore.audioBlobUrl).toBe('asset://localhost/previous-track.wav')
    expect(recordingStore.recordingState).toBe('stopped')
    expect(sessionStore.importPhase).toBe('rejected')
    expect(sessionStore.pendingImportIntent).toBeNull()
    expect(sessionStore.lastImportError).toEqual({
      reason: 'error',
      entrypoint: 'toolbar-open-session',
      message: 'Unable to start import right now. Please try again.',
      diagnostics: 'Error: copy failed',
    })
  })

  it('round-trips import→transcribe→save→reopen with canonical audio and transcript continuity', async () => {
    const canonicalAsset = 'Interview.CAPTURE.WAV'
    let savedSessionJson: string | null = null

    const saveSession = vi.fn(async (_sessionId: string, json: string) => {
      savedSessionJson = json
    })
    const openSession = vi.fn(async () => savedSessionJson)
    const readSessionAsset = vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer)

    ;(window as any).api = createApiMock({
      copyAsset: vi.fn(async () => canonicalAsset),
      saveSession,
      openSession,
      readSessionAsset,
      listSessions: vi.fn(async () => [{
        id: 'active-session-id',
        name: 'Imported Session',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        wordCount: 2,
      }]),
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/transcribe/status')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true }
          },
          async text() {
            return JSON.stringify({ ok: true })
          },
        } as unknown as Response
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            words: [
              { id: 1, word: 'Hello ', start: 0, end: 0.4, probability: 0.99, segmentId: 0 },
              { id: 2, word: 'world', start: 0.4, end: 0.9, probability: 0.98, segmentId: 0 },
            ],
            segments: [{ id: 0, start: 0, end: 0.9, text: 'Hello world' }],
            language: 'en',
            duration: 0.9,
          }
        },
        async text() {
          return '{}'
        },
      } as unknown as Response
    })

    const sessionStore = useSessionStore()
    const recordingStore = useRecordingStore()
    const transcriptStore = useTranscriptStore()
    const sidecarStore = useSidecarStore()

    sidecarStore.port = 41731
    sessionStore.currentSessionId = 'active-session-id'
    sessionStore.importPhase = 'accepted'
    sessionStore.pendingImportIntent = {
      sourcePath: '/tmp/interview.WAV',
      entrypoint: 'session-list',
      createNewSession: true,
    }

    await sessionStore.consumePendingImportIntent()
    expect(recordingStore.audioBlobUrl).toBe(`asset://localhost/${canonicalAsset}`)

    await transcriptStore.transcribeBatchAudio(new Blob(['imported-audio'], { type: 'audio/wav' }), 'interview.WAV')
    expect(transcriptStore.transcriptState).toBe('complete')
    expect(transcriptStore.error).toBeNull()

    await sessionStore.save()
    expect(saveSession).toHaveBeenCalledTimes(1)
    expect(savedSessionJson).not.toBeNull()
    if (savedSessionJson === null) {
      throw new Error('expected saveSession to capture JSON payload')
    }

    const serialized = JSON.parse(savedSessionJson)
    expect(serialized.audioPath).toBe(canonicalAsset)
    expect(serialized.transcript?.words).toHaveLength(2)
    expect(serialized.transcript?.segments).toHaveLength(1)

    transcriptStore.error = 'stale-error-from-previous-run'
    transcriptStore.transcriptState = 'error'
    transcriptStore.words = []
    transcriptStore.segments = []
    recordingStore.audioBlobUrl = null
    recordingStore.audioBlob = null

    await sessionStore.openSession('active-session-id')

    expect(openSession).toHaveBeenCalledWith('active-session-id')
    expect(readSessionAsset).toHaveBeenCalledWith('active-session-id', canonicalAsset)
    expect(recordingStore.audioBlobUrl).toBe(`asset://localhost/${canonicalAsset}`)
    expect(recordingStore.recordingState).toBe('stopped')
    const reopenedBlob = recordingStore.audioBlob as unknown
    expect(reopenedBlob).toBeInstanceOf(Blob)
    expect((reopenedBlob as Blob).type).toBe('audio/wav')
    expect(transcriptStore.transcriptState).toBe('complete')
    expect(transcriptStore.error).toBeNull()
    expect(transcriptStore.words.map((word) => word.word)).toEqual(['Hello ', 'world'])
    expect(transcriptStore.segments).toEqual([{ id: 0, start: 0, end: 0.9, text: 'Hello world' }])
    expect(sessionStore.audioFileMissing).toBe(false)

    fetchSpy.mockRestore()
  })
})
