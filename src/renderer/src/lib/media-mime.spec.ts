import { describe, expect, it } from 'vitest'
import { getMediaMimeType } from './media-mime'

describe('media-mime', () => {
  it('maps supported audio extensions to deterministic MIME types', () => {
    expect(getMediaMimeType('track.mp3')).toBe('audio/mpeg')
    expect(getMediaMimeType('track.mp4')).toBe('audio/mp4')
    expect(getMediaMimeType('track.m4a')).toBe('audio/mp4')
    expect(getMediaMimeType('track.wav')).toBe('audio/wav')
    expect(getMediaMimeType('track.webm')).toBe('audio/webm')
  })

  it('handles uppercase extensions case-insensitively', () => {
    expect(getMediaMimeType('TRACK.MP4')).toBe('audio/mp4')
    expect(getMediaMimeType('TRACK.WAV')).toBe('audio/wav')
  })

  it('falls back safely for malformed, extensionless, or unknown inputs', () => {
    expect(getMediaMimeType('track.unknown')).toBe('application/octet-stream')
    expect(getMediaMimeType('track')).toBe('application/octet-stream')
    expect(getMediaMimeType('')).toBe('application/octet-stream')
    expect(getMediaMimeType('   ')).toBe('application/octet-stream')
  })
})
