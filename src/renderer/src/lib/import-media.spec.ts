import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_IMPORT_MEDIA_EXTENSIONS,
  UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
  parseImportMediaExtension,
  validateImportMediaPath,
} from './import-media'

describe('import-media format gate', () => {
  it('exposes the supported extension contract in canonical order', () => {
    expect(SUPPORTED_IMPORT_MEDIA_EXTENSIONS).toEqual(['mp3', 'mp4', 'm4a', 'wav'])
  })

  it('parses supported extensions case-insensitively', () => {
    expect(parseImportMediaExtension('/tmp/song.mp3')).toBe('mp3')
    expect(parseImportMediaExtension('/tmp/song.MP4')).toBe('mp4')
    expect(parseImportMediaExtension('/tmp/song.M4A')).toBe('m4a')
    expect(parseImportMediaExtension('/tmp/song.WaV')).toBe('wav')
  })

  it('accepts supported paths with normalized extension metadata', () => {
    const result = validateImportMediaPath('/tmp/session-audio.MP3')

    expect(result).toEqual({
      ok: true,
      extension: 'mp3',
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
    })
  })

  it('rejects unsupported extension with deterministic guidance text', () => {
    const result = validateImportMediaPath('/tmp/clip.mov')

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported-extension',
      extension: 'mov',
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    })
    expect(UNSUPPORTED_IMPORT_MEDIA_MESSAGE).toBe(
      'Unsupported media format. Please choose an mp3, mp4, m4a, or wav file.'
    )
  })

  it('rejects malformed inputs: empty, whitespace, and missing extension', () => {
    expect(validateImportMediaPath('')).toEqual({
      ok: false,
      reason: 'empty-path',
      extension: null,
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    })

    expect(validateImportMediaPath('    ')).toEqual({
      ok: false,
      reason: 'empty-path',
      extension: null,
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    })

    expect(validateImportMediaPath('/tmp/no-extension')).toEqual({
      ok: false,
      reason: 'missing-extension',
      extension: null,
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    })
  })

  it('rejects compound extension edge cases as unsupported', () => {
    expect(parseImportMediaExtension('/tmp/archive.wav.gz')).toBe('gz')

    expect(validateImportMediaPath('/tmp/archive.wav.gz')).toEqual({
      ok: false,
      reason: 'unsupported-extension',
      extension: 'gz',
      supportedExtensions: ['mp3', 'mp4', 'm4a', 'wav'],
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    })
  })
})
