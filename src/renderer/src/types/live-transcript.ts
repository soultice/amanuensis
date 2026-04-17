import type { Segment, Word } from '../stores/transcript'

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
  metrics?: {
    observed?: {
      ttftMs?: number | null
      lastChunkLatencyMs?: number | null
      workerBusy?: boolean
      waitingRequests?: number
    }
  }
}
