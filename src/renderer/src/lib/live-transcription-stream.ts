import type {
  LiveCompleteEvent,
  LiveErrorEvent,
  LiveInputControlEvent,
  LiveOutputEvent,
  LivePatchEvent,
  LivePcmPacketMetadata,
  LivePrepareRequest,
  LivePrepareResponse,
  LiveReadyEvent,
  LiveStateEvent,
  LiveTelemetryEvent,
} from '../types/live-transcript'

export class LiveTranscriptionStream {
  private inputSocket: WebSocket | null = null
  private outputSocket: WebSocket | null = null
  private intentionalClose = false
  private sessionId: string | null = null

  async prepare(port: number, request: LivePrepareRequest): Promise<LivePrepareResponse> {
    const res = await fetch(`http://127.0.0.1:${port}/transcribe/live/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Live prepare failed (${res.status}): ${detail}`)
    }

    const data = (await res.json()) as LivePrepareResponse
    this.sessionId = data.sessionId
    return data
  }

  async connect(
    port: number,
    prepareResponse: LivePrepareResponse,
    handlers: {
      onEvent: (event: LiveOutputEvent) => void
      onFatal: (message: string) => void
    },
  ): Promise<void> {
    this.intentionalClose = false
    this.sessionId = prepareResponse.sessionId

    const inputUrl = `ws://127.0.0.1:${port}${prepareResponse.inputSocketPath}?sessionId=${prepareResponse.sessionId}`
    const outputUrl = `ws://127.0.0.1:${port}${prepareResponse.outputSocketPath}?sessionId=${prepareResponse.sessionId}`

    const inputSocket = new WebSocket(inputUrl)
    const outputSocket = new WebSocket(outputUrl)
    this.inputSocket = inputSocket
    this.outputSocket = outputSocket

    await new Promise<void>((resolve, reject) => {
      let inputOpen = false
      let outputOpen = false
      let readySeen = false
      let settled = false

      const fail = (message: string): void => {
        if (settled) return
        settled = true
        this.close()
        reject(new Error(message))
      }

      const maybeResolve = (): void => {
        if (settled) return
        if (inputOpen && outputOpen && readySeen) {
          settled = true
          resolve()
        }
      }

      inputSocket.onopen = () => {
        inputOpen = true
        maybeResolve()
      }
      outputSocket.onopen = () => {
        outputOpen = true
        maybeResolve()
      }

      inputSocket.onerror = () => fail('Live input websocket failed to open')
      outputSocket.onerror = () => fail('Live output websocket failed to open')

      inputSocket.onclose = () => {
        if (!this.intentionalClose && !settled) fail('Live input websocket closed during startup')
        else if (!this.intentionalClose) handlers.onFatal('Live input websocket closed unexpectedly')
      }
      outputSocket.onclose = () => {
        if (!this.intentionalClose && !settled) fail('Live output websocket closed during startup')
        else if (!this.intentionalClose) handlers.onFatal('Live output websocket closed unexpectedly')
      }

      outputSocket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as LiveOutputEvent
          handlers.onEvent(event)
          if (event.type === 'ready') {
            readySeen = true
            maybeResolve()
          }
        } catch (error) {
          fail(`Invalid live output payload: ${String(error)}`)
        }
      }
    })
  }

  sendPcm(metadata: LivePcmPacketMetadata, pcm: ArrayBuffer): void {
    if (!this.inputSocket || this.inputSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Live input websocket is not open')
    }
    this.inputSocket.send(JSON.stringify(metadata))
    this.inputSocket.send(pcm)
  }

  sendControl(event: LiveInputControlEvent): void {
    if (!this.inputSocket || this.inputSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Live input websocket is not open')
    }
    this.inputSocket.send(JSON.stringify(event))
  }

  close(): void {
    this.intentionalClose = true
    this.inputSocket?.close()
    this.outputSocket?.close()
    this.inputSocket = null
    this.outputSocket = null
  }

  getSessionId(): string | null {
    return this.sessionId
  }
}

export type { LivePrepareRequest, LivePrepareResponse, LivePcmPacketMetadata, LiveOutputEvent, LiveInputControlEvent }
export type { LiveReadyEvent, LivePatchEvent, LiveTelemetryEvent, LiveStateEvent, LiveCompleteEvent, LiveErrorEvent }
