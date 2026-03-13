import { extractChecksumText, parseChecksums, pickPreferredChecksum } from '../../src/utils/checksums'

describe('checksum parsing', () => {
  it('parses checksum values from dav payloads', () => {
    const parsed = parseChecksums('SHA1:abc MD5:def ADLER32:ghi')

    expect(parsed.SHA1).toBe('abc')
    expect(parsed.MD5).toBe('def')
    expect(parsed.ADLER32).toBe('ghi')
  })

  it('extracts checksums from nested checksum arrays', () => {
    const extracted = extractChecksumText([
      { checksum: 'SHA1:aaa' },
      { checksum: ['MD5:bbb', { checksum: 'ADLER32:ccc' }] }
    ])

    expect(extracted).toContain('SHA1:aaa')
    expect(extracted).toContain('MD5:bbb')
    expect(extracted).toContain('ADLER32:ccc')
  })

  it('prefers SHA1 over MD5 for duplicate matching', () => {
    const preferred = pickPreferredChecksum('MD5:def SHA1:abc')

    expect(preferred).toEqual({
      algorithm: 'SHA1',
      value: 'abc'
    })
  })

  it('falls back to MD5 and handles missing checksums', () => {
    const md5Preferred = pickPreferredChecksum('ADLER32:zzz MD5:xyz')
    const nonePreferred = pickPreferredChecksum('ADLER32:zzz')

    expect(md5Preferred).toEqual({
      algorithm: 'MD5',
      value: 'xyz'
    })
    expect(nonePreferred).toBeNull()
  })
})
