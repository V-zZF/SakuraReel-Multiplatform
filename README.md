# SakuraReel

个人影视/番剧收藏库。共用 React 界面支持浏览器和 **Windows / macOS / iOS / Android** App。
浏览器连接 Go 服务端；桌面和移动 App 目前在本地 SQLite 离线工作。App 与服务端的自动同步计划在阶段 G 实现。

> 当前源码版本：**SakuraReel v0.6.2**

## 目录

| 目录 | 内容 | 阶段 |
|------|------|------|
| `ui/` | 共用 React 前端（Tailwind + Framer Motion + dnd-kit），Web 与四个 App 都用这一份 | D |
| `src-tauri/src/` | Tauri 命令、Rust SQLite 本地存储和海报管理 | E / F |
| `src-tauri/gen/apple/` | Tauri 生成的 iOS Xcode 工程 | F |
| `src-tauri/gen/android/` | Tauri 生成的 Android / Gradle 工程 | F |
| `server/` | Go 服务端：原有 REST API + 网页托管 + 同步接口 | B / C |
| `scripts/` | 工具链安装与 Windows 构建脚本 | H |
| `docs/` | 项目计划、进度交接和平台构建指南 | — |
| `dist/` | 当前可分发构建产物（Android APK） | F |

## 当前进度

阶段 A–D 已完成；阶段 E 的 macOS 基础启动通过，Windows 安装包和 macOS 完整功能验收待做；阶段 F 的 iOS 模拟器启动和 Android ARM64 APK 构建已完成，iPhone 真机与 Android 手机验收待做；阶段 G 时光机共用界面已实现，Mac 视觉和交互验收待做；同步阶段 H 尚未开始。

现有安装包仍为 v0.6.1：Android ARM64 APK [`dist/SakuraReel-Android-v0.6.1-arm64.apk`](dist/SakuraReel-Android-v0.6.1-arm64.apk)；Apple Silicon macOS DMG [`dist/SakuraReel-macOS-v0.6.1-arm64.dmg`](dist/SakuraReel-macOS-v0.6.1-arm64.dmg)。v0.6.2 尚未打包。

详细进度、目录职责、验收状态和后续安排见[项目状态](docs/PROJECT-STATUS.md)。分步实施计划见 [docs/PLAN.md](docs/PLAN.md)，计划里标 **【你】** 的步骤需要实机验证。

本地启动 Go 服务端：

```sh
cd server
go run .                                  # http://localhost:2233
go run . -data <数据目录> -port 2333       # 对数据副本运行
```
