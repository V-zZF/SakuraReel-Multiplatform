# SakuraReel

个人影视/番剧收藏库。一套 React 界面跑在 **Windows / macOS / iOS / Android** 四个 App 上，
数据每台设备本地保存（离线全功能），服务端在线时自动双向同步；浏览器访问照旧可用。

> 当前版本：**SakuraReel-Multi v0.1**

## 目录

| 目录 | 内容 | 阶段 |
|------|------|------|
| `ui/` | 共用 React 前端（Tailwind + Framer Motion + dnd-kit），Web 与四个 App 都用这一份 | D |
| `src-tauri/` | Tauri 外壳 + Rust 本地数据库 + 同步引擎 | E / F / G |
| `server/` | Go 服务端：原有 REST API + 网页托管 + 同步接口 | B / C |
| `scripts/` | 构建与打包脚本 | H |
| `docs/` | 计划与规格文档 | — |

## 先读这个

分步实施计划见 [docs/PLAN.md](docs/PLAN.md)。计划里标 **【你】** 的步骤需要实机验证。

## 当前状态

**阶段 A（地基）已完成**：目录骨架已就位，四端工具链已装好（Rust 1.98.1 / Node 24.9.0 / Go 1.27.1 / JDK 21 / Android SDK+NDK 27.3 / Xcode 27）。

重装工具链：`bash scripts/setup-toolchain.sh`。

下一步：阶段 B —— 把 `MAL` 的 Go 后端搬进 `server/`，给表加同步字段，跑一次数据迁移。
