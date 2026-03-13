# Dedupe App (OpenCloud Web App)

This app is built from `web-app-skeleton` and provides duplicate file detection/removal in OpenCloud.

## App Identity

- App id: `dedupe`
- App name: `Dedupe`
- Entry route: `/<app-id>/scan`
- App menu item: registered as `appMenuItem` in `src/index.ts`

Keep these aligned when renaming:
1. `src/index.ts` (`appInfo.id`, route base)
2. `vite.config.ts` (`defineConfig({ name: ... })`)
3. `dev/docker/opencloud/apps.yaml` (top-level key)
4. `docker-compose.yml` mount target (`/web/apps/<app-id>`)

## Core Functionality

- Scan user-accessible files for duplicates using server-provided checksums.
- Compare by preferred checksum:
  - primary: `SHA1`
  - fallback: `MD5`
- Show grouped duplicates where group size >= 2.
- Show each copy location (space + full path).
- Support `Scan` and `Stop`.
- Support deleting selected duplicate copies.

## Safety Rule

Deletion must keep at least one file in each duplicate group.
- If user selects all copies in a group, block those selections from deletion.
- Continue deleting valid selections from other groups.

## Data Strategy

- Do not hash file content in browser.
- Use WebDAV checksum property:
  - registered extra prop: `oc:checksums`
- Use OpenCloud clients from `@opencloud-eu/web-pkg`/`@opencloud-eu/web-client`:
  - list drives via graph client
  - list files via webdav
  - delete via webdav

## Key Files

- `src/index.ts` - app setup, routes, menu registration
- `src/views/Dedupe.vue` - main UI and user interactions
- `src/composables/useDedupeScanner.ts` - scanning/grouping/deleting logic
- `src/utils/checksums.ts` - checksum parsing/selection
- `tests/unit/App.spec.ts` - checksum utility tests

## UI/UX Conventions

- Prefer built-in OpenCloud UI components and conventions.
- Use extension Tailwind-prefixed classes (`ext:*`) for layout/utilities.
- Ensure scroll behavior works inside app viewport (root container should be scrollable).
- Keep copy concise and user-facing strings translatable (`vue3-gettext`).

## Development Workflow

1. Install deps: `pnpm install`
2. Run watch build: `pnpm build:w`
3. Run stack: `docker compose up`
4. Open `https://host.docker.internal:9200`

Quality checks:
- `pnpm check:types`
- `pnpm lint`
- `pnpm test:unit`
- `pnpm build` (production verification)

## Caching and Update Behavior

- OpenCloud serves app assets from `dist/`; source edits require build output updates.
- Local dev can appear stale due to asset caching.
- Recommended for local development:
  - keep `pnpm build:w` running
  - disable browser cache in DevTools
  - use local Traefik no-cache middleware for `/assets/apps/`

## Temporary Debug Aids

A small in-app build marker may be shown during development to verify fresh bundles are loaded.
Remove or hide this marker before release if not needed.
