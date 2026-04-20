import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useRecordingStore } from './recording'
import { useTranscriptStore } from './transcript'

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
    listSessions: vi.fn(async () => [{
      id: 'session-id',
      name: 'Restored Session',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      wordCount: 1,
    }]),
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

function makeSessionJson(audioPath: string, includeTranscript = true): string {
  const transcript = includeTranscript
    ? {
        language: 'en',
        duration: 1.2,
        words: [{ id: 1, word: 'hello', start: 0, end: 1.2, probability: 0.99, segmentId: 0 }],
        segments: [{ id: 0, start: 0, end: 1.2, text: 'hello' }],
      }
    : null

  return JSON.stringify({
    version: 1,
    savedAt: '2026-01-01T00:00:00.000Z',
    audioPath,
    transcript,
    annotations: [],
  })
}

describe('session reopen canonical asset MIME handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reopens canonical mp4 assets with extension-correct Blob type and playback state', async () => {
    const readSessionAsset = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer)
    ;(window as any).api = createApiMock({
      openSession: vi.fn(async () => makeSessionJson('canonical-track.mp4')),
      readSessionAsset,
    })

    const sessionStore = useSessionStore()
    const recordingStore = useRecordingStore()

    await sessionStore.openSession('session-id')

    expect(readSessionAsset).toHaveBeenCalledWith('session-id', 'canonical-track.mp4')
    expect(recordingStore.audioBlobUrl).toBe('asset://localhost/canonical-track.mp4')
    expect(recordingStore.recordingState).toBe('stopped')
    expect(recordingStore.audioBlob?.type).toBe('audio/mp4')
    expect(sessionStore.audioFileMissing).toBe(false)
  })

  it('maps uppercase canonical extensions and unknown extensions deterministically', async () => {
    const readSessionAsset = vi.fn(async () => new Uint8Array([9]).buffer)
    ;(window as any).api = createApiMock({
      openSession: vi.fn(async () => makeSessionJson('CAPTURE.WAV')),
      readSessionAsset,
    })

    const sessionStore = useSessionStore()
    const recordingStore = useRecordingStore()

    await sessionStore.openSession('session-id')
    expect(recordingStore.audioBlob?.type).toBe('audio/wav')

    ;(window as any).api = createApiMock({
      openSession: vi.fn(async () => makeSessionJson('mystery.track')),
      readSessionAsset: vi.fn(async () => new Uint8Array([7]).buffer),
    })

    await sessionStore.openSession('session-id')
    expect(recordingStore.audioBlob?.type).toBe('application/octet-stream')
  })

  it('flags missing canonical assets without crashing restore and keeps diagnostics explicit', async () => {
    const readSessionAsset = vi.fn(async () => {
      throw new Error('asset missing')
    })

    ;(window as any).api = createApiMock({
      openSession: vi.fn(async () => makeSessionJson('missing.mp4', false)),
      readSessionAsset,
    })

    const sessionStore = useSessionStore()
    const transcriptStore = useTranscriptStore()

    await sessionStore.openSession('session-id')

    expect(sessionStore.audioFileMissing).toBe(true)
    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toBe(
      'Transcript missing for saved recording and audio could not be recovered automatically.'
    )
  })
})
