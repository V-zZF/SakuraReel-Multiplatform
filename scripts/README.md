# scripts — 构建与打包

构建与打包脚本：

- Web 构建：`ui/` → `ui/dist/`，并同步到 `server/frontend/dist/` 供 Go `embed`。
- Windows NSIS：在 Windows PowerShell 运行 `scripts/build-windows.ps1`；步骤见 [Windows 构建指南](../docs/WINDOWS-BUILD.md)。
- macOS DMG 与 Android ARM64 APK：命令、签名与产物路径见 [README 打包说明](../README.md#build-release-packages)。发布包附到 GitHub Releases，本地副本保留在 `dist/`。
- iOS IPA：仍需匹配的 Apple 开发者团队与描述文件；当前版本未提供。
