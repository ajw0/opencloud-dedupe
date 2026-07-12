import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpaceResource, Resource } from '@opencloud-eu/web-client'

const { mockClientService } = vi.hoisted(() => ({
  mockClientService: {
    webdav: {
      registerExtraProp: vi.fn(),
      listFiles: vi.fn(),
      deleteFile: vi.fn()
    },
    graphAuthenticated: {
      drives: {
        listMyDrives: vi.fn()
      }
    }
  }
}))

vi.mock('@opencloud-eu/web-pkg', () => ({
  useClientService: () => mockClientService
}))

import { useDedupeScanner } from '../../src/composables/useDedupeScanner'

const createMockResource = (overrides: Partial<Record<string, unknown>> = {}): Resource =>
  ({
    id: Math.random().toString(36).slice(2),
    fileId: Math.random().toString(36).slice(2),
    path: '/file.txt',
    name: 'file.txt',
    type: 'file',
    size: 1024,
    parentFolderId: 'parent-1',
    extraProps: { 'oc:checksums': 'SHA1:abc123' },
    ...overrides
  } as unknown as Resource)

const createMockSpace = (id: string, name: string): SpaceResource =>
  ({
    id,
    name,
    disabled: false,
    driveType: 'personal'
  } as unknown as SpaceResource)

describe('useDedupeScanner', () => {
  let scanner: ReturnType<typeof useDedupeScanner>

  beforeEach(() => {
    vi.clearAllMocks()
    scanner = useDedupeScanner()

    mockClientService.graphAuthenticated.drives.listMyDrives.mockResolvedValue([
      createMockSpace('space-1', 'Personal')
    ])
  })

  it('groups files by checksum and filters groups with >1 entry', async () => {
    mockClientService.webdav.listFiles.mockResolvedValue({
      children: [
        createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'c', path: '/c.txt', name: 'c.txt', extraProps: { 'oc:checksums': 'SHA1:unique' } })
      ]
    })

    await scanner.scan()

    expect(scanner.duplicateGroupCount.value).toBe(1)
    expect(scanner.duplicateFileCount.value).toBe(2)
    expect(scanner.duplicates.value[0].files).toHaveLength(2)
  })

  it('blocks deletion when all copies in a group are selected (keep >=1 safety)', async () => {
    mockClientService.webdav.listFiles.mockResolvedValue({
      children: [
        createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } })
      ]
    })

    await scanner.scan()

    const allEntryIds = scanner.duplicates.value[0].files.map((f) => f.entryId)

    const result = await scanner.deleteDuplicates(allEntryIds)

    expect(result.deleted).toBe(0)
    expect(result.blockedGroups).toBe(1)
    expect(mockClientService.webdav.deleteFile).not.toHaveBeenCalled()
  })

  it('deletes selected copies when at least one remains in each group', async () => {
    mockClientService.webdav.listFiles.mockResolvedValue({
      children: [
        createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'c', path: '/c.txt', name: 'c.txt', extraProps: { 'oc:checksums': 'SHA1:same' } })
      ]
    })

    await scanner.scan()

    const entries = scanner.duplicates.value[0].files
    const idsToDelete = [entries[0].entryId, entries[1].entryId]

    const result = await scanner.deleteDuplicates(idsToDelete)

    expect(result.deleted).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.blockedGroups).toBe(0)
    expect(mockClientService.webdav.deleteFile).toHaveBeenCalledTimes(2)
  })

  it('removes deleted entries from groups after deletion', async () => {
    mockClientService.webdav.listFiles.mockResolvedValue({
      children: [
        createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'c', path: '/c.txt', name: 'c.txt', extraProps: { 'oc:checksums': 'SHA1:same' } })
      ]
    })

    await scanner.scan()

    const entries = scanner.duplicates.value[0].files
    const idToDelete = entries[0].entryId

    await scanner.deleteDuplicates([idToDelete])

    expect(scanner.duplicates.value[0].files).toHaveLength(2)
    expect(scanner.duplicates.value[0].files.find((f) => f.entryId === idToDelete)).toBeUndefined()
  })

  it('drops groups reduced to <=1 after deletion', async () => {
    mockClientService.webdav.listFiles.mockResolvedValue({
      children: [
        createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
        createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } })
      ]
    })

    await scanner.scan()

    const entries = scanner.duplicates.value[0].files
    const idToDelete = entries[0].entryId

    await scanner.deleteDuplicates([idToDelete])

    expect(scanner.duplicateGroupCount.value).toBe(0)
  })

  it('preserves partial results when scan is stopped', async () => {
    mockClientService.graphAuthenticated.drives.listMyDrives.mockResolvedValue([
      createMockSpace('space-1', 'Personal')
    ])

    let callCount = 0
    mockClientService.webdav.listFiles.mockImplementation((_space: unknown, _opts: unknown, opts: { signal?: AbortSignal }) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          children: [
            createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
            createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
            { id: 'folder1', path: '/sub', name: 'sub', type: 'folder' }
          ]
        })
      }
      return new Promise((_, reject) => {
        const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
        if (opts?.signal?.aborted) {
          reject(abortError)
          return
        }
        opts?.signal?.addEventListener('abort', () => reject(abortError))
      })
    })

    const scanPromise = scanner.scan()

    setTimeout(() => scanner.stop(), 10)

    await scanPromise

    expect(scanner.wasStopped.value).toBe(true)
    expect(scanner.duplicateGroupCount.value).toBe(1)
  })

  it('skips folders that fail to load (per-folder error tolerance)', async () => {
    mockClientService.graphAuthenticated.drives.listMyDrives.mockResolvedValue([
      createMockSpace('space-1', 'Personal')
    ])

    let callCount = 0
    mockClientService.webdav.listFiles.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          children: [
            createMockResource({ id: 'a', path: '/a.txt', name: 'a.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
            createMockResource({ id: 'b', path: '/b.txt', name: 'b.txt', extraProps: { 'oc:checksums': 'SHA1:same' } }),
            { id: 'folder1', path: '/sub', name: 'sub', type: 'folder' }
          ]
        })
      }
      return Promise.reject(new Error('Permission denied'))
    })

    await scanner.scan()

    expect(scanner.scanError.value).toBeNull()
    expect(scanner.duplicateGroupCount.value).toBe(1)
  })
})
