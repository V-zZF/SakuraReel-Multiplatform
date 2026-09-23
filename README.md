# SakuraReel

个人影视/番剧收藏库。一套 React 界面跑在 **Windows / macOS / iOS / Android** 四个 App 上，
数据每台设备本地保存（离线全功能），服务端在线时自动双向同步；浏览器访问照旧可用。

> 当前版本：**SakuraReel-Multi v0.4**

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

**阶段 A（地基）✅**：目录骨架已就位，四端工具链已装好（Rust 1.98.1 / Node 24.9.0 / Go 1.27.1 / JDK 21 / Android SDK+NDK 27.3 / Xcode 27）。
重装工具链：`bash scripts/setup-toolchain.sh`。

**阶段 B（服务端搬入）✅**：`MAL` 后端已搬进 `server/`；`anime` 表补上同步字段
（`uid` / `updated_at` / `deleted_at` / `server_rev`）并新增 `rev` 计数器表与 `meta` 表；
一次性迁移（补 uid + 海报改名 `<uid>.<ext>`）已在数据副本上跑通并核对：
仍是 127 条、133 张海报，浏览器旧页面增删改查排序正常。

服务端跑起来：

```bash
cd server
go run .                                  # 浏览器打开 http://localhost:2233
go run . -data <数据目录> -port 2333       # 对着数据副本验证，不碰线上数据
```

**阶段 C（同步接口）**：C1–C4 已完成并通过 `go build`；C5 的 curl 实机验证已交给用户，结果待确认。

下一步：阶段 D —— 搬入 React 前端、抽取数据接口并保持浏览器行为不变。

**阶段 D（前端搬入）**：D1–D3 已完成并通过 `npm run build`、`go build`；D4 浏览器实机验证待用户完成。
