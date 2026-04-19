#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

function parseArgs(argv) {
  const args = {
    host: '127.0.0.1',
    port: 8765,
    wav: '',
    packetSamples: 2048,
    pace: 1,
    label: 'benchmark',
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--host') args.host = argv[++i] ?? args.host
    else if (arg === '--port') args.port = Number(argv[++i] ?? args.port)
    else if (arg === '--wav') args.wav = argv[++i] ?? ''
    else if (arg === '--packet-samples') args.packetSamples = Number(argv[++i] ?? args.packetSamples)
    else if (arg === '--pace') args.pace = Number(argv[++i] ?? args.pace)
    else if (arg === '--label') args.label = argv[++i] ?? args.label
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!args.wav) throw new Error('--wav is required')
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number')
  if (!Number.isFinite(args.packetSamples) || args.packetSamples <= 0) throw new Error('--packet-samples must be positive')
  if (!Number.isFinite(args.pace) || args.pace < 0) throw new Error('--pace must be >= 0')
  return args
}

function printHelp() {
  console.log(`live-latency-benchmark.mjs

Usage:
  node scripts/live-latency-benchmark.mjs --wav path/to/sample.wav [options]

Options:
  --host 127.0.0.1           Sidecar host (default: 127.0.0.1)
  --port 8765                Sidecar port (default: 8765)
  --wav FILE                 16-bit PCM WAV speech sample to stream
  --packet-samples 2048      Frames per PCM packet (default: 2048)
  --pace 1                   Real-time pace multiplier (1 = real time, 0 = as fast as possible)
  --label NAME               Friendly label for this run
  --json                     Emit JSON only

Notes:
  - Input WAV must be uncompressed PCM (format 1), mono, 16-bit.
  - Run once after fresh sidecar start for cold-ish numbers, then again for warm numbers.
  - To compare speed modes, restart the app/sidecar with a different AMANUENSIS_LIVE_SPEED_MODE before rerunning.
`)
}

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE file')
  }

  let offset = 12
  let audioFormat = null
  let channels = null
  let sampleRate = null
  let bitsPerSample = null
  let dataChunk = null

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize

    if (chunkEnd > buffer.length) break

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(chunkStart)
      channels = buffer.readUInt16LE(chunkStart + 2)
      sampleRate = buffer.readUInt32LE(chunkStart + 4)
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
    } else if (chunkId === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (audioFormat !== 1) throw new Error(`WAV must be PCM format 1, got ${audioFormat}`)
  if (channels !== 1) throw new Error(`WAV must be mono, got ${channels} channel(s)`)
  if (bitsPerSample !== 16) throw new Error(`WAV must be 16-bit PCM, got ${bitsPerSample}`)
  if (!sampleRate) throw new Error('WAV sample rate missing')
  if (!dataChunk || dataChunk.length === 0) throw new Error('WAV data chunk missing or empty')

  return { sampleRate, channels, pcmBytes: dataChunk }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function round(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.round(value * 100) / 100
}

async function openSocket(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error(`WebSocket failed to open: ${url}`)), { once: true })
  })
  return ws
}

async function runBenchmark(args) {
  const wav = parseWav(await readFile(args.wav))
  const baseUrl = `http://${args.host}:${args.port}`
  const prepareRes = await fetch(`${baseUrl}/transcribe/live/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      pcmEncoding: 'pcm_s16le',
      packetSamples: args.packetSamples,
      archiveMimeType: 'audio/wav',
    }),
  })

  if (!prepareRes.ok) {
    throw new Error(`live prepare failed (${prepareRes.status}): ${await prepareRes.text()}`)
  }

  const prepared = await prepareRes.json()
  const sessionId = prepared.sessionId
  const inputUrl = `ws://${args.host}:${args.port}${prepared.inputSocketPath}?sessionId=${sessionId}`
  const outputUrl = `ws://${args.host}:${args.port}${prepared.outputSocketPath}?sessionId=${sessionId}`

  const outputMetrics = {
    updateGapMs: [],
    queueDepth: [],
    waitingRequests: [],
    serverLatencyMs: [],
    supersededResultsDroppedMax: 0,
    latestSeqAcceptedMax: 0,
    latestSeqProcessedMax: 0,
  }

  let readySeen = false
  let firstPatchAt = null
  let firstPatchMetrics = null
  let stopSentAt = null

  let resolveComplete
  let rejectComplete
  const completePromise = new Promise((resolve, reject) => {
    resolveComplete = resolve
    rejectComplete = reject
  })

  const outputSocket = await openSocket(outputUrl)
  outputSocket.addEventListener('message', (message) => {
    const event = JSON.parse(String(message.data))

    if (event.type === 'ready') {
      readySeen = true
      return
    }

    const metrics = event.metrics ?? event
    if (metrics.updateGapMs !== undefined && metrics.updateGapMs !== null) outputMetrics.updateGapMs.push(Number(metrics.updateGapMs))
    if (metrics.queueDepth !== undefined && metrics.queueDepth !== null) outputMetrics.queueDepth.push(Number(metrics.queueDepth))
    if (metrics.waitingRequests !== undefined && metrics.waitingRequests !== null) outputMetrics.waitingRequests.push(Number(metrics.waitingRequests))
    if (metrics.serverLatencyMs !== undefined && metrics.serverLatencyMs !== null) outputMetrics.serverLatencyMs.push(Number(metrics.serverLatencyMs))
    if (metrics.supersededResultsDropped !== undefined && metrics.supersededResultsDropped !== null) {
      outputMetrics.supersededResultsDroppedMax = Math.max(outputMetrics.supersededResultsDroppedMax, Number(metrics.supersededResultsDropped))
    }
    if (metrics.latestSeqAccepted !== undefined && metrics.latestSeqAccepted !== null) {
      outputMetrics.latestSeqAcceptedMax = Math.max(outputMetrics.latestSeqAcceptedMax, Number(metrics.latestSeqAccepted))
    }
    if (metrics.latestSeqProcessed !== undefined && metrics.latestSeqProcessed !== null) {
      outputMetrics.latestSeqProcessedMax = Math.max(outputMetrics.latestSeqProcessedMax, Number(metrics.latestSeqProcessed))
    }

    if (
      event.type === 'patch'
      && firstPatchAt === null
      && ((event.finalized?.words?.length ?? 0) > 0 || String(event.interimText ?? '').trim().length > 0)
    ) {
      firstPatchAt = performance.now()
      firstPatchMetrics = event.metrics ?? null
    }

    if (event.type === 'complete') {
      resolveComplete({ event, completedAt: performance.now() })
    } else if (event.type === 'error') {
      rejectComplete(new Error(`live output error: ${event.message}`))
    }
  })
  outputSocket.addEventListener('error', () => rejectComplete(new Error('live output websocket error')))

  const inputSocket = await openSocket(inputUrl)
  inputSocket.addEventListener('error', () => rejectComplete(new Error('live input websocket error')))

  const readyDeadline = performance.now() + 5000
  while (!readySeen) {
    if (performance.now() > readyDeadline) throw new Error('Timed out waiting for live output ready event')
    await sleep(10)
  }

  inputSocket.send(JSON.stringify({ type: 'start', sessionId }))
  const startedAt = performance.now()

  const bytesPerFrame = wav.channels * 2
  const bytesPerPacket = args.packetSamples * bytesPerFrame
  let endFrame = 0

  for (let offset = 0; offset < wav.pcmBytes.length; offset += bytesPerPacket) {
    const chunk = wav.pcmBytes.subarray(offset, Math.min(offset + bytesPerPacket, wav.pcmBytes.length))
    const frameCount = chunk.length / bytesPerFrame
    endFrame += frameCount

    inputSocket.send(
      JSON.stringify({
        type: 'pcm',
        sessionId,
        seq: Math.floor(offset / bytesPerPacket) + 1,
        captureStartSample: endFrame - frameCount,
        captureEndSample: endFrame,
        captureStartMs: ((endFrame - frameCount) / wav.sampleRate) * 1000,
        captureEndMs: (endFrame / wav.sampleRate) * 1000,
        sampleRate: wav.sampleRate,
        channels: wav.channels,
        bytes: chunk.byteLength,
        pcmEncoding: 'pcm_s16le',
      }),
    )
    inputSocket.send(chunk)

    if (args.pace > 0) {
      const packetMs = (frameCount / wav.sampleRate) * 1000
      await sleep(packetMs / args.pace)
    }
  }

  stopSentAt = performance.now()
  inputSocket.send(JSON.stringify({ type: 'stop', sessionId, atMs: Math.round((endFrame / wav.sampleRate) * 1000) }))
  const { event: completeEvent, completedAt } = await completePromise

  inputSocket.close()
  outputSocket.close()

  const summary = {
    label: args.label,
    sessionId,
    speedMode: prepared.speedMode ?? null,
    warning: prepared.warning ?? null,
    liveWarmState: prepared.liveWarmState ?? null,
    liveWarmTrigger: prepared.liveWarmTrigger ?? null,
    liveWarmupMs: round(prepared.liveWarmupMs ?? null),
    wallClock: {
      ttftMs: round(firstPatchAt === null ? null : firstPatchAt - startedAt),
      finalizeMs: round(stopSentAt === null ? null : completedAt - stopSentAt),
    },
    sidecar: {
      ttftMs: round(firstPatchMetrics?.timeToFirstTokenMs ?? null),
      firstPatchLatencyMs: round(firstPatchMetrics?.serverLatencyMs ?? null),
    },
    updateGapMs: {
      p50: round(percentile(outputMetrics.updateGapMs, 50)),
      p95: round(percentile(outputMetrics.updateGapMs, 95)),
      samples: outputMetrics.updateGapMs.length,
    },
    queueDepth: {
      max: outputMetrics.queueDepth.length ? Math.max(...outputMetrics.queueDepth) : null,
      p95: round(percentile(outputMetrics.queueDepth, 95)),
    },
    scheduler: {
      supersededResultsDroppedMax: outputMetrics.supersededResultsDroppedMax,
      latestSeqAcceptedMax: outputMetrics.latestSeqAcceptedMax,
      latestSeqProcessedMax: outputMetrics.latestSeqProcessedMax,
    },
    payload: {
      duration: round(completeEvent.duration ?? null),
      words: completeEvent.words?.length ?? 0,
      segments: completeEvent.segments?.length ?? 0,
      language: completeEvent.language ?? '',
    },
    targets: {
      ttftP50Ms: 800,
      ttftP95Ms: 1500,
      updateCadenceP50Ms: 600,
      queueDepthP95: 1,
      finalizeP95Ms: 2500,
    },
  }

  return summary
}

function printHuman(summary) {
  console.log(`\nLive Latency Benchmark — ${summary.label}`)
  console.log('='.repeat(48))
  console.log(`Session:     ${summary.sessionId}`)
  console.log(`Speed mode:  ${summary.speedMode ?? 'unknown'}`)
  console.log(`Warm state:  ${summary.liveWarmState ?? 'unknown'}${summary.liveWarmupMs !== null ? ` (${summary.liveWarmupMs}ms)` : ''}`)
  if (summary.warning) console.log(`Warning:     ${summary.warning}`)
  console.log(`Wall TTFT:   ${summary.wallClock.ttftMs ?? 'n/a'}ms`)
  console.log(`Sidecar TTFT:${summary.sidecar.ttftMs ?? 'n/a'}ms`)
  console.log(`Gap p50/p95: ${summary.updateGapMs.p50 ?? 'n/a'} / ${summary.updateGapMs.p95 ?? 'n/a'} ms`)
  console.log(`Queue max:   ${summary.queueDepth.max ?? 'n/a'} (p95 ${summary.queueDepth.p95 ?? 'n/a'})`)
  console.log(`Dropped:     ${summary.scheduler.supersededResultsDroppedMax}`)
  console.log(`Finalize:    ${summary.wallClock.finalizeMs ?? 'n/a'}ms`)
  console.log(`Transcript:  ${summary.payload.words} word(s), duration ${summary.payload.duration ?? 'n/a'}s`)
  console.log('\nTargets')
  console.log(`- TTFT p50 <= ${summary.targets.ttftP50Ms}ms, p95 <= ${summary.targets.ttftP95Ms}ms`)
  console.log(`- Update gap p50 <= ${summary.targets.updateCadenceP50Ms}ms`)
  console.log(`- Queue depth p95 <= ${summary.targets.queueDepthP95}`)
  console.log(`- Finalize p95 <= ${summary.targets.finalizeP95Ms}ms`)
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const summary = await runBenchmark(args)
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      printHuman(summary)
      console.log('\nJSON')
      console.log(JSON.stringify(summary, null, 2))
    }
  } catch (error) {
    console.error(`benchmark failed: ${String(error instanceof Error ? error.message : error)}`)
    process.exit(1)
  }
}

await main()
