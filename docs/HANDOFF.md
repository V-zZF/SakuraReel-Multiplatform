# 交接 — v0.6.2 源码：交互细节与播放链接修复，实机验收待进行

## 下个窗口先读

先读 `docs/PROJECT-STATUS.md`、`DEVLOG.md`、`docs/PLAN.md`、本文件。用户已确认 C5、D4、E2 没问题，并要求后续实机测试集中进行。E7、E9、F2、F4、F6 尚未实测，不要记为通过。

v0.6.2 已调整时光机展开动画与底部留白、主页和排行榜悬浮反馈，并通过 Tauri Opener 打开播放链接。当前安装包仍是 v0.6.1；v0.6.2 尚未打包，播放链接的端到端跳转仍需在 App 内复验。

## 当前进度

| 步骤 | 状态 |
|---|---|
| A、B | 已完成并打 `v0.1`、`v0.2` tag |
| C1–C5 | C1–C4 编译通过并打 `v0.3` tag；C5 用户确认通过 |
| D1–D4 | D1–D3 编译通过并打 `v0.4` tag；D4 用户确认通过 |
| E1–E2 | Tauri v2 工程编译通过；E2 用户确认通过 |
| E3–E6 | 代码完成，`cargo check`、`npm run build` 通过；实机功能待集中验证 |
| E7 | 待集中验证 Mac App 本地 CRUD、海报、主页与排行榜排序 |
| E8 | Windows 构建脚本和 [构建指南](WINDOWS-BUILD.md) 已备；没有 Windows 安装包 |
| E9 | 待集中验证 Windows 安装与打开 |
| F1 | iOS 工程和模拟器启动已完成；iPhone 真机侧载验收待做 |
| F3 | Android 工程已生成；ARM64 Release APK 已构建、签名并校验 |
| F4 | Android 手机上安装和功能验收待用户完成 |
| G | 时光机 UI 已实现；`npm run build`、`cargo check`、`go build ./...` 通过；Mac 视觉和交互验收待做 |
| H | Rust 同步引擎尚未开始 |

## E 阶段代码

- `src-tauri/src/local.rs`：App 数据目录下的 SQLite，`anime`/`meta`/`rev` 表，Tauri 的 list/get/create/update/delete/reorder 与海报上传命令。UUID v4、删除墓碑、`server_rev=0` 的本地脏记录语义；海报临时文件在保存记录时改为 `<uid>.<ext>`。
- `src-tauri/tauri.conf.json`：macOS 窗口、`$APPDATA/posters/*` asset 范围、Windows WebView2 下载引导程序。`src-tauri/icons/` 是临时图标，H1 再统一。
- `ui/src/data/tauri.ts`、`ui/src/data/index.ts`、`ui/src/main.tsx`：按 `isTauri()` 选择本地或 HTTP 实现，启动时取得海报目录，使用 `convertFileSrc` 显示图片。现有 HTML 文件选择框向 Rust 发送字节。
- `scripts/build-windows.ps1`：在 Windows 主机运行 `npm ci` 和 `tauri build --bundles nsis`。当前仓库无 git remote，也没有 Windows 主机；Mac 跨编译所需的 NSIS、LLVM、cargo-xwin 和 Windows Rust target 也未安装，不能声称已出包。

## 编译与数据

- Android v0.6.1 ARM64 Release APK 已签名并通过 `apksigner verify`，包名 `com.vzzf.sakurareel`，versionCode 6001，最低 Android API 24，目标 API 36。没有连接 Android 实机，F4 仍待验收。
- macOS Apple Silicon v0.6.1 DMG 已通过 `hdiutil verify`；App 内 `icon.icns` 与 Tauri 源图标一致。DMG 为 ad hoc 签名，未做公证。
- 已安装 `src-tauri/gen/android/` 工程所需 Gradle 依赖；因 Maven Central 返回 403，Gradle 仓库配置了 Aliyun 镜像。`BuildTask.kt` 指向仓库内 npm 安装的 Tauri CLI，Android Release 默认允许明文 HTTP，以支持用户配置的局域网服务端。
- 签名 APK 位于 `dist/SakuraReel-Android-v0.6.1-arm64.apk`，macOS DMG 位于 `dist/SakuraReel-macOS-v0.6.1-arm64.dmg`。安装包留在本地 `dist/`，不提交到 Git。签名密钥保存在仓库外 `~/.local/share/sakurareel/android-signing/release.jks`；保留该密钥可让未来签名版本覆盖安装。
- 当前未对本轮 Android 代码执行 UI 自动化或实机功能测试。
- `/Users/zzf/code/sr-e2/` 是从阶段 B 备份创建并迁移的数据副本：127 条记录、133 个海报文件、rev 127。最后一次核对时 2333、1420 与 Tauri 进程均未运行。原始数据未动。
- 本次提交包含当前 Android Gradle 工程、平台图标资源、前端和服务端更新及文档；签名 APK 与 macOS DMG 保留在本地 `dist/`，不纳入 Git。

## 后续

F1 已完成：`src-tauri/gen/apple/` 已生成并纳入工作区，iOS 15 起支持；`project.yml` 配置局域网 ATS、本地网络说明和 iOS 27 所需的 `TaoSceneDelegate` Scene 清单。Rust 启动逻辑在 `lib.rs` 供桌面和 iOS 共用。iPhone 18 Pro（iOS 27）模拟器中已安装 `com.vzzf.sakurareel`，启动后主界面可见。F2 真机侧载与点击仍待用户验收。当前 Xcode 无开发团队配置，CLI 在模拟器 build 成功后尝试 archive 会失败；模拟器 App 已从 build 产物手动安装。

F3 已完成：Android 工程位于 `src-tauri/gen/android/`；原生返回键关闭弹窗、退出编辑/排行榜，并在主页交由系统关闭 App。Release APK 已构建为 ARM64 并签名。Android 明文 HTTP 已在 Release Manifest 放行，用于局域网服务端连接。APK 的签名、包名、版本和最低 API 已验证；手机安装、启动、滚动和操作由 F4 验收。

1. 集中验收 E7 的 macOS 本地 CRUD、海报和排序交互；用户已反馈过拖拽让位、排行榜卡片消失和悬浮生硬问题，代码已调整，仍需实机复验。
2. E8 需在 Windows 主机运行 `scripts/build-windows.ps1`，或先为 Mac 配齐跨编译工具再出 NSIS 安装包。Mac 上的 `cargo check` 不能代替 Windows 出包。
3. 集中验收 E9 的 Windows 安装和启动。E7/E9 通过后才能将 E 阶段标为全部完成。
4. 集中验收 F2 的 iPhone 真机侧载与基本交互。
5. 用户安装 `dist/SakuraReel-Android-v0.6.1-arm64.apk` 并完成 F4；结合 F4/F6 反馈再做 F5 移动端交互修整，之后验收 F6 拖拽排序。
6. 先在 Mac 验收阶段 G 时光机，再将共用 UI 在 Windows、iOS、Android 上集中实测；移动端基础验收后进入阶段 H，实现 Rust 同步引擎与同步状态 UI。

## 保持的约束

React UI + Tauri v2 四端、各端 SQLite 离线、记录级 LWW 与墓碑、UUID v4 uid、uid 海报命名、浏览器 REST 入口。多语言本次不做。用户负责实机运行、点击与数据核对；代码侧只做约定的编译检查，不写 UI 自动化、E2E 或快照测试。
