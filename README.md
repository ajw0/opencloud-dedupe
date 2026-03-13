# Dedupe Web App

OpenCloud web app that scans user-accessible files for duplicates using server-provided checksums and lets you delete selected duplicate copies safely.

## What This App Does

- Scans files across your accessible spaces.
- Uses WebDAV checksum metadata (`oc:checksums`) only (no client-side hashing).
- Detects duplicates by preferred checksum:
  - SHA1 (primary)
  - MD5 (fallback)
- Groups duplicate files and shows each copy's location.
- Lets you open each duplicate's folder.
- Supports safe deletion of selected duplicates while keeping at least one file per group.

## Development Setup

Local development uses Docker and is supported on Linux/macOS.

1. Make sure Docker and Docker Compose are running.
2. Install [pnpm](https://pnpm.io/installation).
3. Ensure host resolution for OpenCloud:
   - Add `127.0.0.1 host.docker.internal` to `/etc/hosts` if needed.

## Run Locally

Start the frontend build watcher in one terminal:

```bash
pnpm install
pnpm build:w
```

Start OpenCloud in another terminal:

```bash
docker compose up
```

Then open:

- URL: `https://host.docker.internal:9200`
- User: `admin`
- Password: `admin`

The app is loaded from `dist/` via Docker volume mounting.

## Commands

- Build production bundle: `pnpm build`
- Build in watch mode: `pnpm build:w`
- Run unit tests: `pnpm test:unit`
- Run lint checks: `pnpm lint`
- Run type checks: `pnpm check:types`

## Key Files

- `src/index.ts` - app registration and routes
- `src/views/Dedupe.vue` - main UI
- `src/composables/useDedupeScanner.ts` - scanning/grouping/deletion logic
- `src/utils/checksums.ts` - checksum parsing and selection
- `dev/docker/opencloud/apps.yaml` - local OpenCloud app registration

## Build Output / Deployment

`pnpm build` writes assets to `dist/`. These files are what OpenCloud serves for this app.

For app installation details in non-dev environments, see:
https://docs.opencloud.eu/docs/admin/configuration/web-applications

## References

- OpenCloud extension docs: https://docs.opencloud.eu/docs/dev/web/extension-system/
- OpenCloud project: https://github.com/opencloud-eu/opencloud
