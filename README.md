# SakuraReel

**SakuraReel** is a personal library for tracking anime and films. The shared React interface runs in a browser and in Tauri apps for Windows, macOS, iOS, and Android.

> **Current source version: v0.7.9** · [Project status](docs/PROJECT-STATUS.md) · [Development log](DEVLOG.md)

## Features

- Keep a personal catalog with posters, ratings, notes, and watch status.
- Browse by season and revisit past seasons in the Time Machine.
- Reorder collections and rankings with drag and drop.
- Use the browser with the Go service, or use desktop and mobile apps with local SQLite storage and offline access.
- The Go service exposes REST and sync APIs. Automatic synchronization from the native apps is not implemented yet.

## Project layout

| Path | Purpose |
| --- | --- |
| `ui/` | Shared React + TypeScript frontend for Web and Tauri apps |
| `src-tauri/` | Rust commands, local SQLite storage, posters, and generated mobile projects |
| `server/` | Go REST/sync API and embedded web frontend |
| `scripts/` | Toolchain setup and platform build helpers |
| `docs/` | Build guides, project plan, status, and handoff notes |
| `DEVLOG.md` | Release and implementation history |

## Run locally

### Browser and Go server

Requirements: Node.js 24+, npm, and the Go version specified in [`server/go.mod`](server/go.mod).

```sh
cd ui
npm ci
npm run build

cd ../server
go run .
```

Open <http://localhost:2233>. `npm run build` creates the frontend and copies it into `server/frontend/dist/`, which is embedded by the Go server. To run the Vite development server, start Go in one terminal and run `cd ui && npm run dev` in another.

Use a separate data directory and port when testing against a copy of your data:

```sh
cd server
go run . -data /path/to/data-copy -port 2333
```

### Native app development

Install the prerequisites for [Tauri v2](https://v2.tauri.app/start/prerequisites/), Rust, and the target platform. Then:

```sh
cd ui
npm ci
npm run tauri -- dev
```

Platform-specific build and signing requirements vary. See the [Windows build guide](docs/WINDOWS-BUILD.md); iOS builds require Xcode and a matching Apple signing team/profile. Android release APK signing uses a private keystore that is intentionally not stored in this repository.

## Web TMDb search and local details

The Web frontend supports TMDb search, whole-series or season collections (including specials), selective metadata import, and locally stored work details. Use the existing add button to open search and configure your personal TMDb API key. Metadata is stored in the Go server's SQLite database; selected posters, backdrops, and logos are saved beside it in `posters/`. Remote metadata imports preserve personal ratings, notes, watch dates, viewing status, playback links, and order.

See [the Web acceptance guide](docs/WEB-TMDB-ACCEPTANCE.md) for setup, test steps, storage behavior, and current limitations. Native TMDb adaptation and platform packaging are deferred until Web acceptance.

## Current release artifacts

The v0.6.3 Apple Silicon macOS DMG and Android ARM64 APK are built locally under `dist/`; generated packages and signing material are excluded from Git. An iPhone IPA is not available yet because the project needs a matching Apple development team and provisioning profile. Windows packaging is documented but has not been produced from this environment.

## Development checks

```sh
cd ui
npm ci
npm run lint
npm run build

cd ../server
go test ./...
```

GitHub Actions runs the frontend lint/build and Go tests on pushes and pull requests to `main`.

## Data and privacy

The browser uses the Go server's local database and poster directory. Native apps currently store data in their device-local SQLite database and can work offline. Automatic synchronization between native apps and the Go server is planned but is not available yet. Back up the server data directory (`anime.db` and `posters/`) separately; it is runtime data and is not committed.

## Contributing

Please open an issue for bugs or feature requests. For changes, use a focused pull request and include the checks you ran. Do not commit personal databases, poster collections, release packages, signing keys, provisioning profiles, or credentials.
