import { computed, ref } from 'vue'
import { useClientService } from '@opencloud-eu/web-pkg'
import { DavProperties } from '@opencloud-eu/web-client/webdav'
import type { Resource, SpaceResource } from '@opencloud-eu/web-client'
import { pickPreferredChecksum, PreferredChecksum } from '../utils/checksums'

const CHECKSUM_DAV_PROP = 'oc:checksums'
let isChecksumPropRegistered = false

export type DuplicateFileEntry = {
  entryId: string
  checksum: string
  checksumAlgorithm: PreferredChecksum['algorithm']
  resource: Resource
  space: SpaceResource
}

export type DuplicateGroup = {
  id: string
  checksum: string
  checksumAlgorithm: PreferredChecksum['algorithm']
  files: DuplicateFileEntry[]
}

export type DeleteDuplicatesResult = {
  deleted: number
  failed: number
  blockedGroups: number
}

const splitGroupKey = (value: string) => {
  const splitAt = value.indexOf(':')
  return {
    algorithm: value.slice(0, splitAt) as PreferredChecksum['algorithm'],
    checksum: value.slice(splitAt + 1)
  }
}

export const useDedupeScanner = () => {
  const clientService = useClientService()

  const isScanning = ref(false)
  const isStopping = ref(false)
  const isDeleting = ref(false)
  const wasStopped = ref(false)
  const scanError = ref<string | null>(null)
  const scannedSpaces = ref(0)
  const scannedFolders = ref(0)
  const scannedFiles = ref(0)
  const duplicates = ref<DuplicateGroup[]>([])

  let abortController: AbortController | null = null

  const duplicateGroupCount = computed(() => duplicates.value.length)
  const duplicateFileCount = computed(() => {
    return duplicates.value.reduce((count, group) => count + group.files.length, 0)
  })

  const setIdleCounters = () => {
    scannedSpaces.value = 0
    scannedFolders.value = 0
    scannedFiles.value = 0
  }

  const buildEntryId = (space: SpaceResource, resource: Resource) => {
    return [space.id, resource.id || resource.fileId || resource.path, resource.path].join(':')
  }

  const scanSpace = async (
    space: SpaceResource,
    groupedEntries: Map<string, DuplicateFileEntry[]>,
    signal: AbortSignal
  ) => {
    const queue = ['/']
    const visited = new Set<string>()

    while (queue.length > 0) {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }

      const folderPath = queue.shift()
      if (!folderPath || visited.has(folderPath)) {
        continue
      }

      visited.add(folderPath)
      scannedFolders.value += 1

      const { children = [] } = await clientService.webdav.listFiles(
        space,
        { path: folderPath },
        {
          depth: 1,
          davProperties: [...DavProperties.Default, CHECKSUM_DAV_PROP as any],
          signal
        }
      )

      for (const child of children) {
        if (child.type === 'folder') {
          queue.push(child.path)
          continue
        }

        if (child.type !== 'file') {
          continue
        }

        scannedFiles.value += 1
        const preferredChecksum = pickPreferredChecksum(
          child.extraProps?.[CHECKSUM_DAV_PROP] ?? child.extraProps?.checksums
        )

        if (!preferredChecksum) {
          continue
        }

        const groupKey = `${preferredChecksum.algorithm}:${preferredChecksum.value}`
        const groupEntries = groupedEntries.get(groupKey) || []

        groupEntries.push({
          entryId: buildEntryId(space, child),
          checksum: preferredChecksum.value,
          checksumAlgorithm: preferredChecksum.algorithm,
          resource: child,
          space
        })

        groupedEntries.set(groupKey, groupEntries)
      }
    }
  }

  const scan = async () => {
    if (isScanning.value) {
      return
    }

    if (!isChecksumPropRegistered) {
      clientService.webdav.registerExtraProp(CHECKSUM_DAV_PROP)
      isChecksumPropRegistered = true
    }

    isScanning.value = true
    isStopping.value = false
    wasStopped.value = false
    scanError.value = null
    duplicates.value = []
    setIdleCounters()

    const groupedEntries = new Map<string, DuplicateFileEntry[]>()
    abortController = new AbortController()

    try {
      const spaces = await clientService.graphAuthenticated.drives.listMyDrives(
        { orderBy: 'name asc' },
        { signal: abortController.signal }
      )

      for (const space of spaces) {
        if (space.disabled) {
          continue
        }

        scannedSpaces.value += 1
        await scanSpace(space, groupedEntries, abortController.signal)
      }

      duplicates.value = [...groupedEntries.entries()]
        .filter(([, entries]) => entries.length > 1)
        .map(([groupKey, entries]) => {
          const { algorithm, checksum } = splitGroupKey(groupKey)

          return {
            id: groupKey,
            checksum,
            checksumAlgorithm: algorithm,
            files: [...entries].sort((a, b) => a.resource.path.localeCompare(b.resource.path))
          }
        })
        .sort((a, b) => b.files.length - a.files.length)
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        wasStopped.value = true
      } else {
        scanError.value = 'scan-error'
      }
    } finally {
      isScanning.value = false
      isStopping.value = false
      abortController = null
    }
  }

  const stop = () => {
    if (!isScanning.value || !abortController) {
      return
    }

    isStopping.value = true
    abortController.abort()
  }

  const removeDeletedEntriesFromGroups = (deletedIds: Set<string>) => {
    duplicates.value = duplicates.value
      .map((group) => ({
        ...group,
        files: group.files.filter((entry) => !deletedIds.has(entry.entryId))
      }))
      .filter((group) => group.files.length > 1)
  }

  const deleteDuplicates = async (entryIds: string[]): Promise<DeleteDuplicatesResult> => {
    if (!entryIds.length || isDeleting.value) {
      return {
        deleted: 0,
        failed: 0,
        blockedGroups: 0
      }
    }

    const selectedIds = new Set(entryIds)
    const blockedGroupIds = new Set<string>()
    const deletableEntries: DuplicateFileEntry[] = []

    for (const group of duplicates.value) {
      const selectedEntries = group.files.filter((entry) => selectedIds.has(entry.entryId))

      if (!selectedEntries.length) {
        continue
      }

      if (selectedEntries.length >= group.files.length) {
        blockedGroupIds.add(group.id)
        continue
      }

      deletableEntries.push(...selectedEntries)
    }

    if (!deletableEntries.length) {
      return {
        deleted: 0,
        failed: 0,
        blockedGroups: blockedGroupIds.size
      }
    }

    isDeleting.value = true

    let deletedCount = 0
    let failedCount = 0
    const deletedEntryIds = new Set<string>()

    try {
      for (const entry of deletableEntries) {
        try {
          await clientService.webdav.deleteFile(entry.space, { path: entry.resource.path })
          deletedCount += 1
          deletedEntryIds.add(entry.entryId)
        } catch {
          failedCount += 1
        }
      }

      removeDeletedEntriesFromGroups(deletedEntryIds)
    } finally {
      isDeleting.value = false
    }

    return {
      deleted: deletedCount,
      failed: failedCount,
      blockedGroups: blockedGroupIds.size
    }
  }

  return {
    isScanning,
    isStopping,
    isDeleting,
    wasStopped,
    scanError,
    scannedSpaces,
    scannedFolders,
    scannedFiles,
    duplicates,
    duplicateGroupCount,
    duplicateFileCount,
    scan,
    stop,
    deleteDuplicates
  }
}
