# 交接 — 下一个窗口从这里开始

## 粘贴给新窗口

```
继续 SakuraReel 多端化项目。仓库：/Users/zzf/code/SakuraReel-Multilingual
先读 DEVLOG.md 与 docs/PLAN.md（PLAN 是分步计划）。

当前进度：阶段 A ✅、阶段 B ✅（v0.2：MAL 后端已搬进 server/、anime 表补了同步字段、
一次性迁移做完，实机验证通过）。

现在做阶段 C 的 C1–C4：

- C1  POST /api/sync/push：批量收记录，逐条 LWW，服务端分配递增 rev，回传被拒条目
- C2  GET  /api/sync/pull?since=<rev>：回传 rev > since 的记录（含墓碑）+ latest_rev
- C3  POST /api/sync/poster 上传 / GET /api/sync/poster?uid= 下载
- C4  GET  /api/sync/state：回传 latest_rev（握手/探活用）

做完停下来，把 C5（你给我 curl 命令、我来跑）交给我验证。

硬约束：

- 只跑"能不能编译过"的检查（go build / cargo check / npm run build）。
  不要写测试脚手架，不要写 UI 自动化测试；实机运行与界面点击验证全部交给用户
- 服务端端口默认仍是 2233（`-port` 可改，验证时用 2333 与线上服务并存）；现有 REST API 的行为不要改变，浏览器端要继续可用
- 动数据之前先备份（anime.db 与 posters/ 都不进仓库）
- 环境变量在 ~/.zshrc 的 >>> sakurareel toolchain >>> 区块
  （JAVA_HOME / ANDROID_HOME / NDK_HOME / GOPROXY）；工具链重装跑 scripts/setup-toolchain.sh
- mac 自带 bash 3.2：变量名后面紧跟全角括号会被吞，一律写 ${VAR}
```

## 这个项目在做什么

把 `MAL`（Go + React 的局域网 Web 应用）改造成 Windows / macOS / iOS / Android 四端 App：
复用现有 React 界面装进 Tauri v2 外壳，数据每端本地 SQLite（离线全功能），服务端在线时双向同步；
浏览器访问照旧保留。

## 当前状态

**阶段 A ✅**：仓库骨架（`ui/` `src-tauri/` `server/` `docs/` `scripts/`）+ 四端工具链全部装好并验证过。
已 `git init`（分支 `main`），阶段 A 提交为 `v0.1`。

**阶段 B ✅（v0.2，已提交并打 tag）**：

- `server/` 里是搬进来的 MAL 后端（模块名仍是 `mal`）；前端产物临时放 `server/frontend/dist`（阶段 D 换 `ui/dist`）。
- `anime` 表加了 `uid`（UUID v4）/ `updated_at` / `deleted_at` / `server_rev`，新增 `rev` 计数器表与 `meta` 表，
  删掉历史列 `home_position` / `ranking_position`。
- 一次性迁移：`go run ./cmd/migrate -data <数据目录>`（幂等）——补 uid、补 updated_at（取 created_at）、
  海报改名 `<uid>.<ext>`；服务端与迁移命令都支持 `-data`，方便对着副本跑。
- DELETE 改成写墓碑 + 保留海报文件；所有读路径过滤墓碑，浏览器行为不变。
- 服务端 `appVersion` 1.2.1 → 1.3.0。

服务端跑法：`go run .`（默认 2233）；对着数据副本验证用 `go run . -data <数据目录> -port 2333`。
阶段 B 的完整记录（含 B6 验证）见 [../DEVLOG.md](../DEVLOG.md)。
数据备份在 `/Users/zzf/code/MAL-backup-20260922-stageB/`。

## 不要推翻的决策

| 决策点 | 选择 |
|---|---|
| UI | 复用现有 React，装进 Tauri v2 外壳，四端一套代码 |
| 数据 | 各端本地 SQLite + 服务端在线时同步（服务端不是唯一数据源） |
| 冲突 | 记录级后写覆盖（LWW）+ 删除墓碑 |
| 删除 | 写 `deleted_at` 墓碑，不物理删行；海报文件保留（同步后统一回收孤儿） |
| 发布 | 自用不上架 |
| 浏览器入口 | 保留，现有 REST API 不动，只新增同步接口 |
| 多语言 | 本次不做 |
| 海报命名 | `<uid>.<ext>`（不再用标题命名） |
| `uid` | UUID v4（36 字符带连字符）；同时也是海报文件名的前缀 |
| `rev` | 全局递增计数器（`rev` 表单行）；服务端每次写操作分配，客户端按 `since` 增量拉取 |
| 初始数据 | 只用 MAL 的 127 条（另有 6 个无引用的孤儿海报文件，保留不动） |

## 环境事实

| 工具 | 版本 | 位置 |
|---|---|---|
| Rust | 1.98.1 | `~/.cargo/bin` |
| Node | v24.9.0 | `~/.local/node` |
| Go | 1.27.1 | `~/.local/go` |
| Temurin JDK 21 | 21.0.12.1 | `~/.local/jdk-21` |
| Android SDK + NDK | android-36 / build-tools 36.0.0 / NDK 27.3.13750724 | `~/Library/Android/sdk` |
| Xcode | 27.0（iOS 27.0 SDK） | 系统自带 |

`tauri` crate 2.11.6、`@tauri-apps/cli` 2.11.5、`rusqlite` 0.40.2 均可达；crates.io 与 npmmirror 都已验证能拉包。
Go 模块缓存最初是空的，`go build` 会从 goproxy.cn 拉依赖（偶尔 IPv6 抖动，重试即可）。

## 分工（用户明确要求过）

- **我做**：写代码、配构建、跑编译检查。
- **用户做**：装工具链之外的实机验证、真机装包、点界面、看数据对不对。
- **不写**：UI 自动化测试、E2E、快照测试。同步合并逻辑要不要加少量 Rust 单测，等用户发话。

计划里每个 **【你】** 步骤都是用户的活，做完就停下交接，不要自己往下推。
