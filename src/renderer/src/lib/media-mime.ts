const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
}

export const FALLBACK_MEDIA_MIME_TYPE = 'application/octet-stream'

function parseExtension(pathOrFilename: string): string | null {
  const trimmed = pathOrFilename.trim()
  if (!trimmed) {
    return null
  }

  const fileName = trimmed.split(/[/\\]/).pop() ?? ''
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null
  }

  return fileName.slice(lastDot + 1).toLowerCase()
}

export function getMediaMimeType(pathOrFilename: string | null | undefined): string {
  if (!pathOrFilename) {
    return FALLBACK_MEDIA_MIME_TYPE
  }

  const extension = parseExtension(pathOrFilename)
  if (!extension) {
    return FALLBACK_MEDIA_MIME_TYPE
  }

  return MEDIA_MIME_BY_EXTENSION[extension] ?? FALLBACK_MEDIA_MIME_TYPE
}
