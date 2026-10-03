# SakuraReel

**SakuraReel** is a personal library for tracking anime and films. The shared React interface runs in a browser and in Tauri apps for Windows, macOS, iOS, and Android.

> **Current source version: v0.7.11** · [Project status](docs/PROJECT-STATUS.md) · [Development log](DEVLOG.md)

## Features

- Keep a personal catalog with posters, ratings, notes, and watch status.
- Browse by season and revisit past seasons in the Time Machine.
- Reorder collections and rankings with drag and drop.
- Use the browser with the Go service, or use desktop and mobile apps with local SQLite storage and offline access.
- In the Web, desktop, and Android apps, search TMDb, choose seasons and metadata fields, and save work details and images locally. Imports download up to six images concurrently and reuse shared portraits.
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

## TMDb search and local details

The shared frontend supports TMDb search, whole-series or season collections (including specials), selective metadata import, and locally stored work details in the browser, macOS app, and Android app. Use the existing add button to open search and configure your personal TMDb API key. The browser stores metadata in the Go server's SQLite database; native apps use Rust commands to store it in device-local SQLite. Selected posters, backdrops, logos, portraits, and episode images are saved in the respective local `posters/` directory and remain available offline. Remote metadata imports preserve personal ratings, notes, watch dates, viewing status, playback links, and order.

See [the Web acceptance guide](docs/WEB-TMDB-ACCEPTANCE.md) and [the native acceptance guide](docs/NATIVE-TMDB-ACCEPTANCE.md) for setup, test steps, storage behavior, and current limitations. Native apps require a personal TMDb API Key or read token and support custom API/image proxy URLs. The server-default Key option is available only in the Web app. Keys remain in the app/browser session and preview memory, and are not written to the collection database. Both data layers download up to six images concurrently, reuse shared portraits, and preserve existing personal records during metadata updates. Existing native databases are migrated in place to add metadata storage. Native-to-server synchronization remains pending.

## Download and install v0.7.11

Download the packages from [GitHub Releases](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/tag/v0.7.11):

| Package | Requirements | Download |
| --- | --- | --- |
| macOS DMG | Apple Silicon (ARM64), macOS 11+ | [SakuraReel-macOS-v0.7.11-arm64.dmg](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-macOS-v0.7.11-arm64.dmg) |
| Android APK | ARM64, Android 7.0+ (API 24) | [SakuraReel-Android-v0.7.11-arm64.apk](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-Android-v0.7.11-arm64.apk) |
| SHA-256 checksums | Verify either download | [SHA256SUMS-v0.7.11.txt](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SHA256SUMS-v0.7.11.txt) |

On macOS, open the DMG and drag SakuraReel into Applications. This build has an ad hoc signature and is not Apple-notarized; if macOS blocks opening it, use System Settings → Privacy & Security → Open Anyway for the downloaded app.

On Android, allow installation from the app used to open the APK. The APK uses the existing release signing key, so it can update earlier packages signed with that key. Keep the installed app when upgrading to preserve its local data. The Android target SDK is API 36.

Packages and signing material are excluded from Git; release packages are retained locally in `dist/` and attached to GitHub Releases when published. Intel macOS, Windows installers, and iPhone IPA packages are not included in this release. iPhone distribution still needs a matching Apple signing team and provisioning profile.

## Build release packages

Install the Tauri platform prerequisites and run `npm ci` in `ui/` first. For an Apple Silicon DMG, build on an Apple Silicon Mac:

```sh
cd ui
npm run tauri -- build --bundles dmg --ci --config '{"bundle":{"macOS":{"signingIdentity":"-"}}}'
```

The DMG is generated in `src-tauri/target/release/bundle/dmg/`. The `-` identity creates an ad hoc signature; Developer ID signing and notarization require separate Apple distribution credentials.

For an Android ARM64 release APK, configure `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_NDK_HOME` for your installed JDK, Android SDK, and NDK, then:

```sh
cd ui
npm run tauri -- android build --target aarch64 --apk --ci
```

The unsigned APK is generated in `src-tauri/gen/android/app/build/outputs/apk/universal/release/`. Before installing or publishing it, align it and sign it with your existing private release keystore. With Android SDK build-tools on `PATH`:

```sh
zipalign -f -P 16 4 app-universal-release-unsigned.apk SakuraReel-Android-v0.7.11-arm64.apk
apksigner sign --ks /path/to/release.jks --ks-key-alias sakurareel \
  --ks-pass file:/path/to/password-file SakuraReel-Android-v0.7.11-arm64.apk
apksigner verify --verbose --print-certs SakuraReel-Android-v0.7.11-arm64.apk
zipalign -c -P 16 4 SakuraReel-Android-v0.7.11-arm64.apk
```

Never commit the keystore or its password. Keep the same signing key for future APK upgrades. After downloading both packages and the checksum file into one directory, verify them with `shasum -a 256 -c SHA256SUMS-v0.7.11.txt`.

## Development checks

```sh
cd ui
npm ci
npm run lint
npm run build

cd ../server
go test -race ./...
```

GitHub Actions runs the frontend lint/build, Go tests, and macOS Rust integration tests on pushes and pull requests to `main`.

## Data and privacy

The browser uses the Go server's local database and poster directory. Native apps currently store data in their device-local SQLite database and can work offline. Automatic synchronization between native apps and the Go server is planned but is not available yet. Back up the server data directory (`anime.db` and `posters/`) separately; it is runtime data and is not committed.

## Contributing

Please open an issue for bugs or feature requests. For changes, use a focused pull request and include the checks you ran. Do not commit personal databases, poster collections, release packages, signing keys, provisioning profiles, or credentials.
