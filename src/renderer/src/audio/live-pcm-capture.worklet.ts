declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: AudioWorkletNodeOptions)
  abstract process(inputs: Float32Array[][]): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void

class LivePcmCaptureProcessor extends AudioWorkletProcessor {
  private packetSamples: number
  private pending: Float32Array
  private pendingLength = 0
  private totalFrames = 0

  constructor(options?: AudioWorkletNodeOptions) {
    super()
    this.packetSamples = Number(options?.processorOptions?.packetSamples ?? 2048)
    this.pending = new Float32Array(this.packetSamples * 4)
    this.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'flush') {
        this.flushPending()
      }
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) {
      return true
    }

    this.ensureCapacity(this.pendingLength + channel.length)
    this.pending.set(channel, this.pendingLength)
    this.pendingLength += channel.length
    this.totalFrames += channel.length

    while (this.pendingLength >= this.packetSamples) {
      this.emitPacket(this.packetSamples, this.totalFrames - (this.pendingLength - this.packetSamples))
    }

    return true
  }

  private emitPacket(frameCount: number, endFrame: number): void {
    const packet = this.pending.slice(0, frameCount)
    const pcm = new Int16Array(frameCount)
    for (let index = 0; index < frameCount; index += 1) {
      const sample = Math.max(-1, Math.min(1, packet[index] ?? 0))
      pcm[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
    }

    this.port.postMessage(
      {
        type: 'pcm-batch',
        frameCount,
        endFrame,
        pcm: pcm.buffer,
      },
      [pcm.buffer],
    )

    if (this.pendingLength > frameCount) {
      this.pending.copyWithin(0, frameCount, this.pendingLength)
    }
    this.pendingLength -= frameCount
  }

  private flushPending(): void {
    if (this.pendingLength > 0) {
      this.emitPacket(this.pendingLength, this.totalFrames)
    }
    this.port.postMessage({ type: 'pcm-flush-complete' })
  }

  private ensureCapacity(nextLength: number): void {
    if (nextLength <= this.pending.length) {
      return
    }
    let size = this.pending.length
    while (size < nextLength) {
      size *= 2
    }
    const grown = new Float32Array(size)
    grown.set(this.pending.subarray(0, this.pendingLength))
    this.pending = grown
  }
}

registerProcessor('live-pcm-capture', LivePcmCaptureProcessor)
