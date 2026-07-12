<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGettext } from 'vue3-gettext'
import { createFileRouteOptions, createLocationSpaces, useMessages } from '@opencloud-eu/web-pkg'
import { DuplicateFileEntry, DuplicateGroup, useDedupeScanner } from '../composables/useDedupeScanner'

defineOptions({
  name: 'DedupeView'
})

const { $gettext } = useGettext()
const messages = useMessages()
const buildMarker = import.meta.url.split('/').pop() || 'unknown'
const showBuildMarker = import.meta.env.MODE === 'development'

const {
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
} = useDedupeScanner()

const formatFileSize = (bytes: number | string | undefined): string => {
  if (bytes === undefined || bytes === null) return '—'
  const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (isNaN(numBytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = numBytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${unitIndex === 0 ? size : size.toFixed(1)} ${units[unitIndex]}`
}

const selectedEntries = ref<Record<string, boolean>>({})

const selectedIds = computed(() => {
  return Object.entries(selectedEntries.value)
    .filter(([, value]) => value)
    .map(([entryId]) => entryId)
})

const groupSelectionCount = (group: DuplicateGroup) => {
  return group.files.filter((entry) => selectedEntries.value[entry.entryId]).length
}

const blockedGroupCount = computed(() => {
  return duplicates.value.filter((group) => {
    const selectedCount = groupSelectionCount(group)
    return selectedCount > 0 && selectedCount >= group.files.length
  }).length
})

const canDelete = computed(() => {
  return selectedIds.value.length > 0 && blockedGroupCount.value === 0 && !isDeleting.value
})

const getParentPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\/+$/, '')
  const parentIndex = normalizedPath.lastIndexOf('/')

  if (parentIndex <= 0) {
    return '/'
  }

  return normalizedPath.slice(0, parentIndex)
}

const getOpenLocation = (entry: DuplicateFileEntry) => {
  return createLocationSpaces(
    'files-spaces-generic',
    createFileRouteOptions(entry.space, {
      path: getParentPath(entry.resource.path),
      fileId: entry.resource.parentFolderId
    })
  )
}

const pruneSelection = () => {
  const validIds = new Set(duplicates.value.flatMap((group) => group.files.map((file) => file.entryId)))
  const nextSelection: Record<string, boolean> = {}

  for (const [entryId, selected] of Object.entries(selectedEntries.value)) {
    if (selected && validIds.has(entryId)) {
      nextSelection[entryId] = true
    }
  }

  selectedEntries.value = nextSelection
}

watch(duplicates, pruneSelection)

const resetSelection = () => {
  selectedEntries.value = {}
}

const startScan = async () => {
  resetSelection()
  await scan()

  if (scanError.value) {
    messages.showErrorMessage({
      title: $gettext('Scan failed'),
      desc: $gettext('Could not scan files for duplicates. Please try again.')
    })
    return
  }

  if (wasStopped.value) {
    messages.showMessage({
      title: $gettext('Scan stopped'),
      desc: $gettext('The scan was stopped before completion.'),
      status: 'warning'
    })
    return
  }

  messages.showMessage({
    title: $gettext('Scan finished'),
    desc: $gettext('%{groups} duplicate groups found.', {
      groups: duplicateGroupCount.value
    }),
    status: 'success'
  })
}

const stopScan = () => {
  stop()
}

const removeSelectedDuplicates = async () => {
  const result = await deleteDuplicates(selectedIds.value)
  pruneSelection()

  if (result.blockedGroups > 0) {
    messages.showMessage({
      title: $gettext('Selection updated'),
      desc: $gettext('Each duplicate group must keep at least one file.'),
      status: 'warning'
    })
  }

  if (result.deleted > 0) {
    messages.showMessage({
      title: $gettext('Duplicates deleted'),
      desc: $gettext('%{count} file copies deleted.', {
        count: result.deleted
      }),
      status: 'success'
    })
  }

  if (result.failed > 0) {
    messages.showErrorMessage({
      title: $gettext('Some files could not be deleted'),
      desc: $gettext('%{count} file copies failed to delete.', {
        count: result.failed
      })
    })
  }
}

const setEntrySelection = (entryId: string, value: boolean) => {
  selectedEntries.value = {
    ...selectedEntries.value,
    [entryId]: value
  }
}
</script>

<template>
  <main class="ext:h-full ext:overflow-y-auto">
    <div class="ext:p-4 ext:max-w-6xl ext:mx-auto ext:space-y-4 text-role-on-surface">
      <header class="ext:space-y-1">
      <h1 class="ext:text-2xl ext:font-semibold">{{ $gettext('Dedupe') }}</h1>
      <p class="ext:text-sm text-role-on-surface-variant">
        {{
          $gettext(
            'Find duplicate files by comparing server-provided checksums and delete selected copies.'
          )
        }}
      </p>
      <p v-if="showBuildMarker" class="ext:text-xs text-role-on-surface-variant">
        {{ $gettext('Build: %{build}', { build: buildMarker }) }}
      </p>
      </header>

      <section class="dedupe-soft-border bg-role-surface ext:rounded-lg ext:p-4 ext:space-y-3 ext:shadow-sm">
      <div class="ext:flex ext:flex-wrap ext:gap-2">
        <oc-button appearance="filled" :disabled="isScanning || isDeleting" @click="startScan">
          <span>{{ $gettext('Scan') }}</span>
        </oc-button>

        <oc-button appearance="outline" :disabled="!isScanning || isStopping" @click="stopScan">
          <span>{{ $gettext('Stop') }}</span>
        </oc-button>

        <oc-button appearance="outline" :disabled="!canDelete || isScanning" @click="removeSelectedDuplicates">
          <span>{{ $gettext('Delete selected') }}</span>
        </oc-button>
      </div>

      <oc-progress v-if="isScanning" :indeterminate="true" :aria-label="$gettext('Scanning')" />

      <div class="ext:grid ext:grid-cols-2 md:ext:grid-cols-5 ext:gap-3 ext:text-sm" aria-live="polite">
        <div>
          <p class="text-role-on-surface-variant">{{ $gettext('Spaces scanned') }}</p>
          <p class="ext:font-medium">{{ scannedSpaces }}</p>
        </div>
        <div>
          <p class="text-role-on-surface-variant">{{ $gettext('Folders scanned') }}</p>
          <p class="ext:font-medium">{{ scannedFolders }}</p>
        </div>
        <div>
          <p class="text-role-on-surface-variant">{{ $gettext('Files scanned') }}</p>
          <p class="ext:font-medium">{{ scannedFiles }}</p>
        </div>
        <div>
          <p class="text-role-on-surface-variant">{{ $gettext('Duplicate groups') }}</p>
          <p class="ext:font-medium">{{ duplicateGroupCount }}</p>
        </div>
        <div>
          <p class="text-role-on-surface-variant">{{ $gettext('Duplicate copies') }}</p>
          <p class="ext:font-medium">{{ duplicateFileCount }}</p>
        </div>
      </div>

      <p v-if="isStopping" class="ext:text-sm text-role-on-surface-variant">
        {{ $gettext('Stopping scan...') }}
      </p>
      <p v-else-if="blockedGroupCount > 0" class="ext:text-sm text-role-error">
        {{ $gettext('At least one file must remain in every duplicate group.') }}
      </p>
      </section>

      <section
      v-if="!isScanning && !duplicates.length"
      class="dedupe-soft-border bg-role-surface ext:rounded-lg ext:p-4 ext:text-sm text-role-on-surface-variant ext:shadow-sm"
    >
      {{ $gettext('No duplicate groups found yet. Start a scan to find duplicates.') }}
      </section>

      <section
      v-for="group in duplicates"
      :key="group.id"
      class="dedupe-soft-border bg-role-surface ext:rounded-lg ext:overflow-hidden ext:shadow-sm"
    >
      <header class="dedupe-header-surface ext:px-4 ext:py-2 ext:border-b dedupe-soft-divider">
        <div class="dedupe-group-title ext:flex ext:flex-wrap ext:items-center ext:gap-3 ext:text-sm">
          <strong>{{ group.files.length }} {{ $gettext('copies') }}</strong>
          <span class="dedupe-group-meta">{{ group.checksumAlgorithm }}</span>
          <code class="ext:text-xs ext:break-all">{{ group.checksum }}</code>
        </div>
      </header>

      <div class="ext:overflow-x-auto">
        <table class="ext:w-full ext:min-w-[720px] ext:text-sm">
          <thead class="dedupe-table-head-surface text-role-on-surface-variant ext:text-left">
            <tr>
              <th scope="col" class="ext:px-4 ext:py-2 ext:w-12 ext:font-medium ext:text-center">{{ $gettext('Select') }}</th>
              <th scope="col" class="ext:px-4 ext:py-2 ext:font-medium">{{ $gettext('Name') }}</th>
              <th scope="col" class="ext:px-4 ext:py-2 ext:font-medium">{{ $gettext('Location') }}</th>
              <th scope="col" class="ext:px-4 ext:py-2 ext:w-20 ext:font-medium">{{ $gettext('Size') }}</th>
              <th scope="col" class="ext:px-4 ext:py-2 ext:w-28 ext:font-medium ext:text-center">
                {{ $gettext('Open folder') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in group.files"
              :key="entry.entryId"
              class="dedupe-row ext:border-t dedupe-soft-divider"
            >
              <td class="ext:px-4 ext:py-2 ext:w-12 ext:text-center">
                <div class="ext:flex ext:justify-center">
                  <oc-checkbox
                    :model-value="!!selectedEntries[entry.entryId]"
                    :label="$gettext('Select duplicate copy')"
                    label-hidden
                    @update:model-value="setEntrySelection(entry.entryId, $event)"
                  />
                </div>
              </td>
              <td class="ext:px-4 ext:py-2 ext:font-medium">{{ entry.resource.name }}</td>
              <td class="ext:px-4 ext:py-2">
                <span class="text-role-on-surface-variant">{{ entry.space.name }}</span>
                <code class="ext:text-xs ext:block ext:break-all">{{ entry.resource.path }}</code>
              </td>
              <td class="ext:px-4 ext:py-2 ext:w-20">{{ formatFileSize(entry.resource.size) }}</td>
              <td class="ext:px-4 ext:py-2 ext:w-28 ext:text-center">
                <oc-button
                  type="router-link"
                  :to="getOpenLocation(entry)"
                  appearance="raw"
                  :aria-label="$gettext('Open folder')"
                  class="ext:p-1"
                >
                  <oc-icon name="folder-open" fill-type="line" />
                </oc-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.dedupe-soft-border {
  border: 1px solid var(--oc-role-outline-variant, var(--oc-role-outline));
}

.dedupe-soft-divider {
  border-color: var(--oc-role-outline-variant, var(--oc-role-outline));
}

.dedupe-header-surface {
  background-color: color-mix(in srgb, var(--oc-role-secondary-container) 75%, transparent);
}

.dedupe-group-title {
  color: var(--oc-role-on-surface);
}

.dedupe-group-meta {
  color: var(--oc-role-on-surface-variant);
}

.dedupe-table-head-surface {
  background-color: var(--oc-role-surface-container-low, var(--oc-role-surface));
}

.dedupe-row {
  transition: background-color 0.15s ease;
}

.dedupe-row:hover > td {
  background-color: color-mix(in srgb, var(--oc-role-secondary-container) 40%, transparent);
}

:global([data-theme='dark']) .dedupe-row:hover > td {
  background-color: var(--oc-role-surface-container-highest, var(--oc-role-surface-container-high));
}
</style>
