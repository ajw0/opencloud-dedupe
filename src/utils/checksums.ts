export type PreferredChecksum = {
  algorithm: 'SHA1' | 'MD5'
  value: string
}

export const extractChecksumText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractChecksumText(entry))
      .filter(Boolean)
      .join(' ')
  }

  if (value && typeof value === 'object') {
    const checksum = (value as Record<string, unknown>).checksum
    return extractChecksumText(checksum)
  }

  return ''
}

export const parseChecksums = (value: unknown): Record<string, string> => {
  const checksums: Record<string, string> = {}
  const text = extractChecksumText(value)

  for (const match of text.matchAll(/([A-Za-z0-9-]+):([^\s]+)/g)) {
    checksums[match[1].toUpperCase().replace(/-/g, '')] = match[2]
  }

  return checksums
}

export const pickPreferredChecksum = (value: unknown): PreferredChecksum | null => {
  const checksums = parseChecksums(value)

  if (checksums.SHA1) {
    return {
      algorithm: 'SHA1',
      value: checksums.SHA1
    }
  }

  if (checksums.MD5) {
    return {
      algorithm: 'MD5',
      value: checksums.MD5
    }
  }

  return null
}
