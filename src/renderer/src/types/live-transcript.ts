import type { Segment, Word } from '../stores/transcript'

export type LiveSocketState = 'prepared' | 'ready' | 'live' | 'paused' | 'finalizing' | 'complete' | 'error'

export interface LivePrepareRequest {
  sampleRate: number
  channels: number
  pcmEncoding: 'pcm_s16le'
  packetSamples: number
  archiveMimeType: string | null
}

export interface LivePrepareResponse {
  sessionId: string
  state: 'prepared'
  createdAt: string
  inputSocketPath: '/transcribe/live/input'
  outputSocketPath: '/transcribe/live/output'
  deviceMode?: 'auto' | 'cpu' | 'cuda'
  runtimeProvider?: string
  runtimeQuantization?: string
  runtimeFallbackUsed?: boolean
  availableProviders?: string[]
  speedMode?: 'safe_auto' | 'aggressive_internal'
  warning?: string
}

export interface LivePcmPacketMetadata {
  type: 'pcm'
  sessionId: string
  seq: number
  captureStartSample: number
  captureEndSample: number
  captureStartMs: number
  captureEndMs: number
  sampleRate: number
  channels: number
  bytes: number
  pcmEncoding: 'pcm_s16le'
}

export type LiveInputControlEvent =
  | { type: 'start'; sessionId: string }
  | { type: 'pause'; sessionId: string; atMs: number }
  | { type: 'resume'; sessionId: string; atMs: number }
  | { type: 'stop'; sessionId: string; atMs: number }

export interface LiveStartResponse {
  sessionId: string
  state: 'live' | 'paused' | 'finalizing' | 'complete' | 'error'
  createdAt: string
  speedMode?: 'safe_auto' | 'aggressive_internal'
  warning?: string
  defaults?: {
    chunkWindowMs?: number
    statusPollMs?: number
    overlapMs?: number
    warmupMs?: number
  }
  deviceMode?: 'auto' | 'cpu' | 'cuda'
  runtimeProvider?: string
  runtimeQuantization?: string
  runtimeFallbackUsed?: boolean
  availableProviders?: string[]
}

export interface LiveChunkResponse {
  sessionId: string
  seq: number
  state: 'live' | 'paused' | 'finalizing' | 'complete' | 'error'
  interimText: string
  finalized: {
    mode: 'patch'
    replaceFromWordIndex: number
    words: Word[]
    segments: Segment[]
  }
  metrics?: {
    serverLatencyMs?: number
    timeToFirstTokenMs?: number
    queueDepth?: number
    workerBusy?: boolean
    waitingRequests?: number
    updateGapMs?: number
    speedMode?: 'safe_auto' | 'aggressive_internal'
  }
}

export interface LiveReadyEvent {
  type: 'ready'
  sessionId: string
  state: 'ready'
  queueDepth: number
  workerBusy: boolean
  waitingRequests: number
}

export interface LivePatchEvent {
  type: 'patch'
  sessionId: string
  seq: number
  interimText: string
  finalized: {
    mode: 'patch'
    replaceFromWordIndex: number
    words: Word[]
    segments: Segment[]
  }
  metrics?: {
    serverLatencyMs?: number
    timeToFirstTokenMs?: number
    queueDepth?: number
    workerBusy?: boolean
    waitingRequests?: number
    updateGapMs?: number
    speedMode?: 'safe_auto' | 'aggressive_internal'
  }
}

export interface LiveTelemetryEvent {
  type: 'telemetry'
  sessionId: string
  queueDepth: number
  workerBusy: boolean
  waitingRequests: number
  updateGapMs?: number
  serverLatencyMs?: number
  timeToFirstTokenMs?: number
  speedMode?: 'safe_auto' | 'aggressive_internal'
}

export interface LiveStateEvent {
  type: 'state'
  sessionId: string
  state: 'live' | 'paused' | 'finalizing' | 'complete'
}

export interface LiveCompleteEvent {
  type: 'complete'
  sessionId: string
  state: 'complete'
  words: Word[]
  segments: Segment[]
  language: string
  duration: number
}

export interface LiveErrorEvent {
  type: 'error'
  sessionId: string
  state: 'error'
  fatal: true
  message: string
}

export type LiveOutputEvent =
  | LiveReadyEvent
  | LivePatchEvent
  | LiveTelemetryEvent
  | LiveStateEvent
  | LiveCompleteEvent
  | LiveErrorEvent

export interface LiveStopResponse {
  words: Word[]
  segments: Segment[]
  language: string
  duration: number
  session?: {
    id: string
    state: 'complete'
  }
}

export interface LiveStatusResponse {
  sessionId: string
  state: 'live' | 'paused' | 'finalizing' | 'complete' | 'error'
  lastSeq: number
  queueDepth: number
  warning: string | null
  error: string | null
  deviceMode?: 'auto' | 'cpu' | 'cuda'
  runtimeProvider?: string
  runtimeQuantization?: string
  runtimeFallbackUsed?: boolean
  availableProviders?: string[]
  metrics?: {
    observed?: {
      ttftMs?: number | null
      lastChunkLatencyMs?: number | null
      workerBusy?: boolean
      waitingRequests?: number
    }
  }
}
