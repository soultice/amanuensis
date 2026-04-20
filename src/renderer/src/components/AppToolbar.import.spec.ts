import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import AppToolbar from './AppToolbar.vue'
import { useRecordingStore } from '../stores/recording'
import { useSessionStore, type ImportIntentResult } from '../stores/session'
import { useTranscriptStore } from '../stores/transcript'
import { UNSUPPORTED_IMPORT_MEDIA_MESSAGE } from '../lib/import-media'

vi.mock('./LevelMeter.vue', () => ({
  default: {
    name: 'LevelMeterStub',
    template: '<div data-test="level-meter" />',
    props: ['stream', 'active'],
  },
}))

function mountToolbar(pinia: Pinia): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp(AppToolbar, {
    onCloseSession: vi.fn(),
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

describe('AppToolbar import entrypoint', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('dispatches import through shared session-store action with toolbar-open-session entrypoint', async () => {
    const recordingStore = useRecordingStore()
    vi.spyOn(recordingStore, 'loadDevices').mockResolvedValue()

    const sessionStore = useSessionStore()
    const dispatch = vi
      .spyOn(sessionStore, 'startImportIntent')
      .mockResolvedValue({
        status: 'rejected',
        reason: 'cancelled',
        message: 'Import cancelled.',
        entrypoint: 'toolbar-open-session',
      } satisfies ImportIntentResult)

    const view = mountToolbar(pinia)
    await flushUi()

    const importButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import Audio')
    )
    expect(importButton).toBeTruthy()
    expect(importButton?.hasAttribute('disabled')).toBe(false)

    importButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushUi()

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith('toolbar-open-session')

    view.unmount()
  })

  it('shows entrypoint-local unsupported guidance and hides cancelled follow-ups', async () => {
    const recordingStore = useRecordingStore()
    vi.spyOn(recordingStore, 'loadDevices').mockResolvedValue()

    const sessionStore = useSessionStore()
    sessionStore.importPhase = 'rejected'
    sessionStore.lastImportError = {
      reason: 'unsupported',
      entrypoint: 'toolbar-open-session',
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    }

    const view = mountToolbar(pinia)
    await flushUi()

    expect(view.container.textContent).toContain(UNSUPPORTED_IMPORT_MEDIA_MESSAGE)
    expect(view.container.textContent).not.toContain('/Users/')

    sessionStore.lastImportError = {
      reason: 'cancelled',
      entrypoint: 'toolbar-open-session',
      message: 'Import cancelled.',
    }

    await flushUi()

    expect(view.container.textContent).not.toContain(UNSUPPORTED_IMPORT_MEDIA_MESSAGE)
    expect(view.container.textContent).not.toContain('Import cancelled.')

    view.unmount()
  })

  it('renders orchestration errors and keeps import disabled while recording/transcribing/picking', async () => {
    const recordingStore = useRecordingStore()
    vi.spyOn(recordingStore, 'loadDevices').mockResolvedValue()

    const transcriptStore = useTranscriptStore()
    const sessionStore = useSessionStore()
    const dispatch = vi.spyOn(sessionStore, 'startImportIntent')

    sessionStore.importPhase = 'rejected'
    sessionStore.lastImportError = {
      reason: 'error',
      entrypoint: 'toolbar-open-session',
      message: 'Unable to start import right now. Please try again.',
    }

    const view = mountToolbar(pinia)
    await flushUi()

    const importButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import Audio')
    )
    expect(importButton).toBeTruthy()

    expect(view.container.textContent).toContain('Unable to start import right now. Please try again.')

    recordingStore.recordingState = 'recording'
    await flushUi()
    expect(importButton?.hasAttribute('disabled')).toBe(true)

    transcriptStore.transcriptState = 'transcribing'
    recordingStore.recordingState = 'idle'
    await flushUi()
    expect(importButton?.hasAttribute('disabled')).toBe(true)

    sessionStore.importPhase = 'picking'
    transcriptStore.transcriptState = 'empty'
    await flushUi()
    expect(importButton?.hasAttribute('disabled')).toBe(true)

    importButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushUi()
    expect(dispatch).not.toHaveBeenCalled()

    view.unmount()
  })
})
