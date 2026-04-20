export const SUPPORTED_IMPORT_MEDIA_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav'] as const

export type SupportedImportMediaExtension = (typeof SUPPORTED_IMPORT_MEDIA_EXTENSIONS)[number]

export const UNSUPPORTED_IMPORT_MEDIA_MESSAGE =
  'Unsupported media format. Please choose an mp3, mp4, m4a, or wav file.'

type SupportedExtensionsList = typeof SUPPORTED_IMPORT_MEDIA_EXTENSIONS

export type ImportMediaValidationResult =
  | {
      ok: true
      extension: SupportedImportMediaExtension
      supportedExtensions: SupportedExtensionsList
    }
  | {
      ok: false
      reason: 'empty-path' | 'missing-extension' | 'unsupported-extension'
      extension: string | null
      supportedExtensions: SupportedExtensionsList
      message: string
    }

export function parseImportMediaExtension(mediaPath: string): string | null {
  const trimmedPath = mediaPath.trim()
  if (!trimmedPath) {
    return null
  }

  const fileName = trimmedPath.split(/[/\\]/).pop() ?? ''
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return null
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

export function validateImportMediaPath(mediaPath: string): ImportMediaValidationResult {
  const trimmedPath = mediaPath.trim()
  if (!trimmedPath) {
    return {
      ok: false,
      reason: 'empty-path',
      extension: null,
      supportedExtensions: SUPPORTED_IMPORT_MEDIA_EXTENSIONS,
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    }
  }

  const extension = parseImportMediaExtension(trimmedPath)
  if (!extension) {
    return {
      ok: false,
      reason: 'missing-extension',
      extension: null,
      supportedExtensions: SUPPORTED_IMPORT_MEDIA_EXTENSIONS,
      message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
    }
  }

  if (SUPPORTED_IMPORT_MEDIA_EXTENSIONS.includes(extension as SupportedImportMediaExtension)) {
    return {
      ok: true,
      extension: extension as SupportedImportMediaExtension,
      supportedExtensions: SUPPORTED_IMPORT_MEDIA_EXTENSIONS,
    }
  }

  return {
    ok: false,
    reason: 'unsupported-extension',
    extension,
    supportedExtensions: SUPPORTED_IMPORT_MEDIA_EXTENSIONS,
    message: UNSUPPORTED_IMPORT_MEDIA_MESSAGE,
  }
}
