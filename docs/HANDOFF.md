# 交接 — v0.5：F1 iOS 模拟器启动成功，F2 真机验收待进行

## 下个窗口先读

`DEVLOG.md`、`docs/PLAN.md`、本文件。用户已确认 C5、D4、E2 没问题，并要求后续实机测试集中进行。E7、E9 尚未实测，不要记为通过。

## 当前进度

| 步骤 | 状态 |
|---|---|
| A、B | 已完成并打 `v0.1`、`v0.2` tag |
| C1–C5 | C1–C4 编译通过并打 `v0.3` tag；C5 用户确认通过 |
| D1–D4 | D1–D3 编译通过并打 `v0.4` tag；D4 用户确认通过 |
| E1–E2 | Tauri v2 工程编译通过；E2 用户确认通过 |
| E3–E6 | 代码完成，`cargo check`、`npm run build` 通过；实机功能待集中验证 |
| E7 | 待集中验证 Mac App 本地 CRUD、海报、主页与排行榜排序 |
| E8 | Windows 构建脚本和 WebView2 配置已备；没有 Windows 安装包 |
| E9 | 待集中验证 Windows 安装与打开 |

## E 阶段代码

- `src-tauri/src/local.rs`：App 数据目录下的 SQLite，`anime`/`meta`/`rev` 表，Tauri 的 list/get/create/update/delete/reorder 与海报上传命令。UUID v4、删除墓碑、`server_rev=0` 的本地脏记录语义；海报临时文件在保存记录时改为 `<uid>.<ext>`。
- `src-tauri/tauri.conf.json`：macOS 窗口、`$APPDATA/posters/*` asset 范围、Windows WebView2 下载引导程序。`src-tauri/icons/` 是临时图标，H1 再统一。
- `ui/src/data/tauri.ts`、`ui/src/data/index.ts`、`ui/src/main.tsx`：按 `isTauri()` 选择本地或 HTTP 实现，启动时取得海报目录，使用 `convertFileSrc` 显示图片。现有 HTML 文件选择框向 Rust 发送字节。
- `scripts/build-windows.ps1`：在 Windows 主机运行 `npm ci` 和 `tauri build --bundles nsis`。当前仓库无 git remote，也没有 Windows 主机；Mac 跨编译所需的 NSIS、LLVM、cargo-xwin 和 Windows Rust target 也未安装，不能声称已出包。

## 编译与数据

- 本轮 `cargo check`、`npm run build`、`go build ./...` 通过；安装 rustfmt 后已运行 `cargo fmt`。未写测试或执行实机功能测试。
- `/Users/zzf/code/sr-e2/` 是从阶段 B 备份创建并迁移的数据副本：127 条记录、133 个海报文件、rev 127。最后一次核对时 2333、1420 与 Tauri 进程均未运行。原始数据未动。
- E/F 阶段代码、锁文件、构建后的 `server/frontend/dist` 与文档已纳入 `v0.5` 提交。`git status`、`git diff --check` 可复核。

## 后续

F1 已完成：`src-tauri/gen/apple/` 已生成并纳入工作区，iOS 15 起支持；`project.yml` 配置局域网 ATS、本地网络说明和 iOS 27 所需的 `TaoSceneDelegate` Scene 清单。Rust 启动逻辑在 `lib.rs` 供桌面和 iOS 共用。iPhone 18 Pro（iOS 27）模拟器中已安装 `com.vzzf.sakurareel`，启动后主界面可见。F2 真机侧载与点击仍待用户验收。当前 Xcode 无开发团队配置，CLI 在模拟器 build 成功后尝试 archive 会失败；模拟器 App 已从 build 产物手动安装。

1. 集中验收 E7 的 macOS 本地 CRUD、海报和排序交互；用户已反馈过拖拽让位、排行榜卡片消失和悬浮生硬问题，代码已调整，仍需实机复验。
2. E8 需在 Windows 主机运行 `scripts/build-windows.ps1`，或先为 Mac 配齐跨编译工具再出 NSIS 安装包。Mac 上的 `cargo check` 不能代替 Windows 出包。
3. 集中验收 E7/E9 后，才能将 E 阶段标为全部完成。阶段 F 继续 F2 真机侧载与验收。自定义 `.icon` 接入已推迟，原始文件未改。

## 保持的约束

React UI + Tauri v2 四端、各端 SQLite 离线、记录级 LWW 与墓碑、UUID v4 uid、uid 海报命名、浏览器 REST 入口。多语言本次不做。用户负责实机运行、点击与数据核对；代码侧只做约定的编译检查，不写 UI 自动化、E2E 或快照测试。
