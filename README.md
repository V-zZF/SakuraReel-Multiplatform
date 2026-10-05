# SakuraReel

**SakuraReel** 是一个用于管理动画与电影收藏、记录观看进度的个人影音库。共用的 React 界面可在浏览器中运行，也用于 Windows、macOS、iOS 和 Android 的 Tauri 应用。

> **当前源码版本：v0.7.11** · [项目状态](docs/PROJECT-STATUS.md) · [开发日志](DEVLOG.md)

## 功能

- 管理作品海报、个人评分、短评和观看状态。
- 按季度浏览收藏，通过「时光机」回顾往季作品。
- 拖拽调整收藏与排行榜顺序。
- 浏览器配合 Go 服务使用；桌面和移动端应用使用设备本地 SQLite 数据库，支持离线访问。
- Web、桌面和 Android 应用支持 TMDb 搜索、整剧／分季／特别篇选择、按字段导入资料，以及本地保存作品详情与图片。图片最多六并发下载，并复用重复人物头像。
- Go 服务提供 REST 与同步接口；原生应用与服务端之间的自动同步尚未实现。

## 下载与安装 v0.7.11

安装包见 [GitHub Releases](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/tag/v0.7.11)。

| 安装包 | 系统要求 | 下载 |
| --- | --- | --- |
| macOS DMG | Apple Silicon（ARM64），macOS 11 及以上 | [macOS 安装包](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-macOS-v0.7.11-arm64.dmg) |
| Android APK | ARM64，Android 7.0 及以上（API 24） | [Android 安装包](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-Android-v0.7.11-arm64.apk) |
| SHA-256 校验文件 | 用于验证安装包完整性 | [校验文件](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SHA256SUMS-v0.7.11.txt) |

**macOS：** 打开 DMG，将 SakuraReel 拖入「应用程序」。当前应用使用临时签名（ad hoc），未经 Apple 公证；若系统阻止打开，可在「系统设置 → 隐私与安全性」中选择「仍要打开」。

**Android：** 为打开 APK 的应用允许「安装未知应用」。安装包沿用原发布签名密钥，可覆盖升级使用相同密钥签名的旧版本。升级时保留已安装应用，以保留本地数据。Android 目标 SDK 为 API 36。

将两个安装包与校验文件放在同一目录，运行：

```sh
shasum -a 256 -c SHA256SUMS-v0.7.11.txt
```

本次发布提供 macOS Apple Silicon 与 Android ARM64 安装包；尚未提供 Intel macOS、Windows 安装包或 iPhone IPA。iPhone 分发仍需匹配的 Apple 签名团队与描述文件。安装包及签名材料不提交到 Git；发布产物保存在本地 `dist/`，并在发布时上传至 GitHub Releases。

## TMDb 搜索与本地资料

点击现有的添加按钮，配置个人 TMDb API Key 或读取令牌，即可搜索作品，选择电影、整剧、分季或特别篇，并预览、选择需要导入的字段和图片。API 与图片代理基础地址均可自定义。服务端默认 Key 选项仅适用于 Web；原生应用需要个人 Key 或读取令牌。

浏览器将资料保存到 Go 服务的 SQLite 数据库；原生应用通过 Rust 命令保存到设备本地 SQLite。选中的海报、背景、标志图、人物头像和单集图片保存在各自的本地 `posters/` 目录，保存后可离线查看。更新远程资料时，会保留个人评分、短评、观看日期、观看状态、播放链接和排序。

个人 Key 仅保留在应用／浏览器会话及预览内存中，不写入收藏数据库。两端数据层均支持最多六张图片并行下载、复用共享头像，并保护既有个人记录。已有原生数据库会原地迁移以增加资料存储；原生与服务端的自动同步仍待实现。

配置、验收步骤、存储行为与当前限制见 [Web 验收指南](docs/WEB-TMDB-ACCEPTANCE.md) 和 [原生应用验收指南](docs/NATIVE-TMDB-ACCEPTANCE.md)。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `ui/` | Web 与 Tauri 应用共用的 React + TypeScript 前端 |
| `src-tauri/` | Rust 命令、本地 SQLite 存储、图片管理与生成的移动端工程 |
| `server/` | Go REST／同步接口与内嵌 Web 前端 |
| `scripts/` | 工具链配置与各平台构建脚本 |
| `docs/` | 构建指南、项目计划、状态与交接说明 |
| `DEVLOG.md` | 版本与开发记录 |

## 本地运行

### 浏览器与 Go 服务

环境要求：Node.js 24 及以上、npm，以及 [`server/go.mod`](server/go.mod) 指定的 Go 版本。

```sh
cd ui
npm ci
npm run build

cd ../server
go run .
```

打开 <http://localhost:2233>。`npm run build` 会构建前端，并复制到 `server/frontend/dist/`，由 Go 服务内嵌提供。需要使用 Vite 开发服务器时，在一个终端启动 Go 服务，在另一个终端运行 `cd ui && npm run dev`。

使用数据副本测试时，可指定独立的数据目录与端口：

```sh
cd server
go run . -data /path/to/data-copy -port 2333
```

### 原生应用开发

安装 [Tauri v2 所需环境](https://v2.tauri.app/start/prerequisites/)、Rust 及目标平台工具链，然后运行：

```sh
cd ui
npm ci
npm run tauri -- dev
```

各平台构建与签名要求不同。Windows 请参阅 [构建指南](docs/WINDOWS-BUILD.md)；iOS 需要 Xcode 及匹配的 Apple 签名团队／描述文件。Android 发布 APK 使用仓库外保存的私有签名密钥库。

## 构建发布安装包

先安装 Tauri 对应平台的构建环境，并在 `ui/` 运行 `npm ci`。

### macOS Apple Silicon

在 Apple Silicon Mac 上构建 DMG：

```sh
cd ui
npm run tauri -- build --bundles dmg --ci --config '{"bundle":{"macOS":{"signingIdentity":"-"}}}'
```

DMG 输出到 `src-tauri/target/release/bundle/dmg/`。签名身份 `-` 表示临时签名；Developer ID 签名与 Apple 公证需要另外配置 Apple 分发凭据。

### Android ARM64

根据已安装的 JDK、Android SDK 与 NDK 配置 `JAVA_HOME`、`ANDROID_HOME` 和 `ANDROID_NDK_HOME`：

```sh
cd ui
npm run tauri -- android build --target aarch64 --apk --ci
```

未签名 APK 输出到 `src-tauri/gen/android/app/build/outputs/apk/universal/release/`。安装或发布前，需要对齐并使用已有的私有发布密钥库签名。将 Android SDK 构建工具加入 `PATH` 后运行：

```sh
zipalign -f -P 16 4 app-universal-release-unsigned.apk SakuraReel-Android-v0.7.11-arm64.apk
apksigner sign --ks /path/to/release.jks --ks-key-alias sakurareel \
  --ks-pass file:/path/to/password-file SakuraReel-Android-v0.7.11-arm64.apk
apksigner verify --verbose --print-certs SakuraReel-Android-v0.7.11-arm64.apk
zipalign -c -P 16 4 SakuraReel-Android-v0.7.11-arm64.apk
```

不要提交密钥库及密码。后续 APK 升级需继续使用同一签名密钥。

## 开发检查

```sh
cd ui
npm ci
npm run lint
npm run build

cd ../server
go test -race ./...
```

推送到 `main` 或向 `main` 提交拉取请求时，GitHub Actions 会执行前端静态检查与构建、Go 测试，以及 macOS 上的 Rust 集成测试。

## 数据与隐私

浏览器使用 Go 服务的本地数据库和图片目录；原生应用使用各设备的本地 SQLite 数据库，支持离线使用。原生应用与 Go 服务之间的自动同步仍在计划中。

请单独备份服务端数据目录中的 `anime.db` 与 `posters/`。这些属于运行时数据，不提交到仓库。

## 参与贡献

发现问题或希望增加功能，请提交 Issue。代码改动请通过聚焦单一主题的拉取请求提交，并说明已执行的检查。不要提交个人数据库、图片收藏、发布安装包、签名密钥、描述文件或凭据。
