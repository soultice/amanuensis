import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidecarStore } from './sidecar'
import { useTranscriptStore } from './transcript'

function mockResponse(options: {
  status?: number
  body?: unknown
  text?: string
}): Response {
  const status = options.status ?? 200
  const body = options.body
  const text = options.text ?? (typeof body === 'string' ? body : JSON.stringify(body ?? {}))

  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
    async text() {
      return text
    },
  } as unknown as Response
}

describe('transcript import batch transcription', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.restoreAllMocks()
  })

  it('uploads batch audio and applies canonical transcript fields on success', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/transcribe/status')) {
        return mockResponse({ status: 200, body: { ok: true } })
      }

      expect(transcriptStore.transcriptState).toBe('transcribing')
      expect(url).toBe('http://localhost:41731/transcribe')
      return mockResponse({
        status: 200,
        body: {
          words: [{ id: 1, word: 'Hello', start: 0, end: 100, probability: 0.99, segmentId: 0 }],
          segments: [{ id: 0, start: 0, end: 100, text: 'Hello' }],
          language: 'en',
          duration: 100,
        },
      })
    })

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('complete')
    expect(transcriptStore.error).toBeNull()
    expect(transcriptStore.language).toBe('en')
    expect(transcriptStore.duration).toBe(100)
    expect(transcriptStore.words).toHaveLength(1)
    expect(transcriptStore.segments).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies missing sidecar port as sidecar-unavailable', async () => {
    const transcriptStore = useTranscriptStore()

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[sidecar-unavailable]')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies network failures as sidecar-unavailable and stops polling', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[sidecar-unavailable]')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies 503 readiness failures as sidecar-unavailable', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 503, text: JSON.stringify({ detail: 'model not ready' }) })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[sidecar-unavailable]')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies ffmpeg decode signatures as decode-failure', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 500, text: '{"detail":"ffmpeg conversion failed: unsupported codec"}' })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/mp4' }), 'import.mp4')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[decode-failure]')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies 409 busy and other non-ok outcomes as asr-failure', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 409, text: JSON.stringify({ detail: 'transcribe busy' }) })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[asr-failure]')
    expect(transcriptStore.error).toContain('HTTP 409')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('classifies malformed success payload as asr-failure without partial mutation', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()
    transcriptStore.words = [{ id: 99, word: 'Old', start: 0, end: 10, probability: 1, segmentId: 0 }]
    transcriptStore.segments = [{ id: 0, start: 0, end: 10, text: 'Old' }]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 200, body: { words: 'bad-shape', language: 3, duration: null } })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[asr-failure]')
    expect(transcriptStore.error).toContain('malformed response')
    expect(transcriptStore.words).toEqual([])
    expect(transcriptStore.segments).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps empty transcript payload deterministic (empty state, no error)', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 200, body: { words: [], segments: [], language: '', duration: 0 } })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('empty')
    expect(transcriptStore.error).toBeNull()
    expect(transcriptStore.words).toEqual([])
    expect(transcriptStore.segments).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps null and empty audio payloads to deterministic asr-failure', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    await transcriptStore.transcribeBatchAudio(null, 'import.wav')
    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[asr-failure]')

    transcriptStore.reset()
    sidecarStore.port = 41731
    await transcriptStore.transcribeBatchAudio(new Blob([], { type: 'audio/wav' }), 'import.wav')
    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[asr-failure]')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles malformed JSON detail text as deterministic asr-failure', async () => {
    const sidecarStore = useSidecarStore()
    sidecarStore.port = 41731
    const transcriptStore = useTranscriptStore()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ status: 500, text: '{"detail": {"message": "nested"}}' })
    )

    await transcriptStore.transcribeBatchAudio(new Blob(['audio'], { type: 'audio/wav' }), 'import.wav')

    expect(transcriptStore.transcriptState).toBe('error')
    expect(transcriptStore.error).toContain('[asr-failure]')
    expect(transcriptStore.error).toContain('HTTP 500')
    expect(transcriptStore.error).not.toContain('/Users/')
    expect(vi.getTimerCount()).toBe(0)
  })
})
