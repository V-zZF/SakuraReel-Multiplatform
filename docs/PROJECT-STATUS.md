# SakuraReel 项目状态

更新日期：2026-10-03 · 当前源码版本：0.7.11

## 项目概况

SakuraReel 是个人影视和番剧收藏库。React 前端供浏览器和 Tauri App 共用；浏览器通过 Go REST API 读写服务端数据，桌面和移动 App 目前使用设备本地 SQLite，支持离线操作。服务端与各设备之间的自动双向同步是后续阶段 G 的工作，尚未实现。

## 当前进度

| 阶段 | 内容 | 当前状态 |
|---|---|---|
| A | Monorepo 与工具链 | ✅ 完成 |
| B | Go 服务端搬入、数据迁移和同步字段 | ✅ 完成；用户已验收副本迁移和原浏览器流程 |
| C | Go 同步 REST API | ✅ C1–C5 完成；用户确认 curl 验收通过 |
| D | 共用 React UI 和 HTTP 数据层 | ✅ D1–D4 完成；用户确认浏览器验收通过 |
| E | Tauri 桌面 App、本地 SQLite 和海报 | 🟡 macOS 基础启动通过；E7 完整功能验收待做；Windows 包和 E9 安装验收待做 |
| F | iOS / Android App | 🟡 iOS 模拟器已启动，真机验收待做；Android APK 已出，手机验收待做；F5/F6 交互修整待进行 |
| G | 时光机 | 🟡 共用 UI 已实现且前端构建通过；Mac 视觉与交互验收、其他端实机验收待做 |
| H | Rust 同步引擎与状态 UI | ⬜ 尚未开始 |
| I | 四端收尾、构建脚本与最终验收 | 🟡 多端图标与版本已统一；macOS / Android 安装包已生成；一键脚本和最终实机验收待做 |

### 已有安装包

- Android：[SakuraReel-Android-v0.7.11-arm64.apk](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-Android-v0.7.11-arm64.apk)；macOS：[SakuraReel-macOS-v0.7.11-arm64.dmg](https://github.com/V-zZF/SakuraReel-Multiplatform/releases/download/v0.7.11/SakuraReel-macOS-v0.7.11-arm64.dmg)。iPhone IPA 尚未导出，因签名团队及描述文件需与 Bundle ID 匹配。
- 包名：`com.vzzf.sakurareel`；当前安装包版本：`0.7.11`（Android versionCode 7011）；Android 最低系统 Android 7.0（API 24），目标 API 36。
- Android ARM64 Release APK 已签名并通过 `apksigner verify`；macOS Apple Silicon DMG 已通过镜像及应用包签名校验，使用 ad hoc 签名且未 Apple 公证。尚未完成手机安装和功能验收（F4）及 Mac 完整交互验收（E7）。
- 后续签名升级需保留仓库外的本地签名密钥：`~/.local/share/sakurareel/android-signing/release.jks`。

Web 与原生 App 已接入 TMDb 搜索、电影／整剧／分季导入及离线详情。原生 App 使用 Rust 网络请求与设备本地 SQLite，图片最多 6 张并行下载并复用重复关联图片；无需运行 Go 服务，需使用个人 TMDb Key。实机完整交互验收仍待进行。

## 项目结构

```text
SakuraReel-Multilingual/
├── ui/                         # React + TypeScript 共用 UI，Web 和 Tauri 共用
│   ├── src/components/         # 页面、卡片、表单、排行榜等组件
│   ├── src/data/               # HTTP / Tauri 数据访问层
│   ├── src/hooks/              # 列表状态与拖拽交互
│   └── scripts/                # 前端构建产物同步到 Go embed 目录
├── src-tauri/
│   ├── src/                    # Rust 命令、SQLite 本地数据和海报读写
│   ├── gen/apple/              # iOS Xcode 工程
│   ├── gen/android/            # Android Gradle 工程
│   └── icons/                  # App 图标资源
├── server/
│   ├── main.go                 # Go 服务入口和 HTTP 路由
│   ├── internal/db/            # SQLite schema、迁移和同步存储
│   ├── internal/handler/       # 番剧与同步 API
│   ├── internal/model/         # API 数据模型
│   └── frontend/dist/          # Go embed 使用的 Web 构建产物
├── scripts/                    # 工具链安装、Windows 构建脚本
├── docs/                       # 项目计划、状态、交接和构建指南
├── dist/                       # 当前 Android APK
├── DEVLOG.md                   # 详细开发日志
└── README.md                   # 项目入口和快速运行说明
```

## 主要数据路径

- 浏览器：`ui/src/data/http.ts` → `server/` REST API → 服务端 SQLite 和海报目录。
- 桌面 / 移动 App：`ui/src/data/tauri.ts` → Tauri invoke → `src-tauri/src/local.rs` → 设备本地 SQLite 和海报目录。
- Web 前端生产构建由 `ui/` 生成，并复制到 `server/frontend/dist/`，供 Go 服务嵌入。
- Go 同步接口已存在；Rust 客户端同步引擎还未实现，因此 App 当前不会自动与 Go 服务同步。

## 验收状态与下一步

已由用户确认：C5 同步 API、D4 浏览器功能、E2 macOS App 基础启动。

待用户集中验收：

1. E7：macOS 增删改、海报、首页及排行榜排序。
2. E9：Windows 安装、启动和基本使用。
3. F2：iPhone 真机侧载和基本交互。
4. F4：安装本页 Android APK，检查启动、滚动、增删改和海报。
5. F6：移动端拖拽排序。

代码侧后续：先在 Mac 验收 G 时光机，再结合 F4/F6 反馈完成 F5；其余端集中验收后进入 H，实现 Rust 同步、海报下载和同步状态 UI；最后完成 I 阶段构建与四端验收。各项验收细目以 [PLAN.md](PLAN.md) 为准，交接记录见 [HANDOFF.md](HANDOFF.md)。

## 常用入口

- 工具链安装：`bash scripts/setup-toolchain.sh`
- Web 前端构建：在 `ui/` 下运行 `npm run build`（同时更新 `server/frontend/dist/`）。
- Go 服务端：在 `server/` 下运行 `go run .`，默认地址 `http://localhost:2233`。
- Windows NSIS 构建：见 [WINDOWS-BUILD.md](WINDOWS-BUILD.md)。
- Android 当前仅完成过 ARM64 APK 构建；Gradle 官方 Maven Central 在此环境返回 403，工程配置使用 Aliyun Maven 镜像。完整多平台一键构建脚本仍未完成。
