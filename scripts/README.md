# scripts — 构建与打包

构建与打包脚本：

- Web 构建：`ui/` → `ui/dist/`，并同步到 `server/frontend/dist/` 供 Go `embed`。
- Windows NSIS：在 Windows PowerShell 运行 `scripts/build-windows.ps1`；步骤见 [Windows 构建指南](../docs/WINDOWS-BUILD.md)。
- macOS DMG、iOS 与 Android 打包：按 `docs/PLAN.md` 后续阶段实施。
