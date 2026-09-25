# SakuraReel Windows 构建指南

供 Windows 构建者或 Windows 上的 coding agent 使用。目标是从当前仓库生成 x64 NSIS 安装程序（`.exe`）。本指南适用于仓库 `v0.6.1` 的 Tauri v2 工程。

## 1. 准备构建环境

### 必需软件

1. **Windows 10 或 11 x64**。
2. **Visual Studio 2022 Build Tools**，安装工作负载 **Desktop development with C++**，包含 MSVC x64/x86 工具和 Windows SDK。安装后重新打开 PowerShell。
3. **Rust stable MSVC**。在 PowerShell 安装 Rustup 后执行：

   ```powershell
   rustup default stable-msvc
   rustc -V
   cargo -V
   rustup show active-toolchain
   ```

   活动工具链应为 `stable-x86_64-pc-windows-msvc`。如果不是，安装/切换到该 MSVC 工具链。
4. **Node.js 24 LTS**（含 npm）。Node 24 是本项目当前构建使用的主版本；安装后重新打开 PowerShell。
5. **Microsoft Edge WebView2 Runtime**。Windows 10 1803 及更新版本、Windows 11 通常已包含。如果缺少，NSIS 安装程序会下载并运行 WebView2 Bootstrapper，因此安装时需要联网。
6. **Git**，或从共享工作区取得完整仓库副本。

Tauri 官方说明：Windows 桌面构建需要 Microsoft C++ Build Tools 和 WebView2；Rust 应使用 MSVC 工具链。可参考 [Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/) 和 [Microsoft C++ Build Tools 安装说明](https://learn.microsoft.com/en-us/cpp/build/vscpp-step-0-installation)。

### 确认工具

在新的 PowerShell 窗口执行：

```powershell
node --version
npm --version
rustc -V
cargo -V
rustup show active-toolchain
```

预期 Node 主版本为 `v24`，Rust 工具链为 `x86_64-pc-windows-msvc`。若 `link.exe` 或 MSVC 相关工具找不到，请在 Visual Studio Installer 确认已安装 **Desktop development with C++**，然后重启终端。

## 2. 取得源码

使用包含 `src-tauri/`、`ui/`、`server/`、`scripts/` 的完整仓库。项目当前没有配置 Git remote；如果 agent 使用独立 Windows 机器，请将当前仓库工作区复制/同步过去。不要只复制 `ui/` 或 `src-tauri/`。

进入仓库根目录检查结构：

```powershell
Get-ChildItem
Test-Path .\src-tauri\tauri.conf.json
Test-Path .\ui\package-lock.json
Test-Path .\scripts\build-windows.ps1
```

三个 `Test-Path` 应都返回 `True`。

## 3. 构建 NSIS 安装程序

从仓库根目录运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build-windows.ps1
```

执行策略只对当前 PowerShell 进程有效。脚本会：

1. 切到 `ui/` 并运行 `npm ci`，按 `package-lock.json` 安装前端依赖；
2. 运行 Tauri release build 和前端 production build；
3. 生成 NSIS 安装程序。

默认构建使用 x64 Windows MSVC 工具链；SQLite 使用 Rust `bundled` 特性，不需要额外安装 SQLite SDK。

## 4. 找到产物

安装包目录：

```text
src-tauri\target\release\bundle\nsis\
```

脚本结束时也会打印该目录。文件名会包含产品名、版本和架构，当前产品版本是 `0.6.1`。把实际生成的 `.exe` 文件名、大小和构建日志末尾一并回报给 SakuraReel 维护者。

## 5. 交给 Windows agent 的任务说明

可将下面这段直接发给 Windows 上的 agent：

> 请阅读仓库 `docs/WINDOWS-BUILD.md`，按其中步骤在 Windows x64 环境构建 SakuraReel NSIS 安装程序。使用仓库当前工作区，不要重置、清理或改写用户数据。运行 `scripts/build-windows.ps1`。如果构建失败，只修复 Windows 构建必需的问题，并汇报改动文件、完整错误摘要、工具版本和最终产物路径；不要运行 UI/E2E 测试，也不要把安装或交互验收记为通过。构建成功后仅汇报 `.exe` 产物路径、大小、版本和构建结果，等待维护者集中安排实机验收。

## 6. 常见构建问题

- **找不到 `link.exe` / MSVC linker**：安装 Visual Studio Build Tools 的 **Desktop development with C++** 工作负载，关闭并重新打开 PowerShell。
- **Rust target/toolchain 不匹配**：执行 `rustup default stable-msvc`，确认 `rustup show active-toolchain` 输出 x64 MSVC。
- **Node/npm 不存在或版本不合适**：安装 Node.js 24 LTS，重新打开 PowerShell 后检查 `node --version`、`npm --version`。
- **`npm ci` 下载失败**：检查 npm registry、代理及网络访问；不要删除或修改 `package-lock.json` 来绕过锁定依赖。
- **NSIS bundling 失败**：先保留完整日志；确认构建命令确实是 `--bundles nsis`，不要切换到 MSI。MSI 需要额外的 WiX/VBSCRIPT 环境，本项目目标是 NSIS。
- **WebView2 安装失败**：当前安装模式是 `downloadBootstrapper`。在缺少 WebView2 Runtime 的电脑上，安装过程需联网。

Tauri 官方 Windows 安装说明详见 [Windows Installer](https://v2.tauri.app/distribute/windows-installer/)。当前指南只覆盖构建产物生成；E9 的安装、首次启动和功能验收仍按项目计划集中进行。
