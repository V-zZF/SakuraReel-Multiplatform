# 交接 — 阶段 D4 待用户验证

## 粘贴给下一个窗口

```text
继续 SakuraReel 多端化项目。先读 DEVLOG.md、docs/PLAN.md、docs/HANDOFF.md。
D1–D3 已完成且 npm run build / go build ./... 通过。现在停在 D4，待用户在浏览器用数据副本实机点击验证。C5 仍未收到用户 curl 验证结果，不要记为通过。未经用户完成 D4，不进入阶段 E。
```

## 项目与进度

目标是一套 React UI 运行在 Windows / macOS / iOS / Android 的 Tauri v2 App 中；各端本地 SQLite 离线可用，服务端在线时双向同步，浏览器入口继续保留。计划和分工以 [PLAN.md](PLAN.md) 为准。

| 阶段 | 状态 | 要点 |
|---|---|---|
| A | ✅ `v0.1` | 仓库骨架和四端工具链 |
| B | ✅ `v0.2` | Go 服务端搬入、同步字段、一次性迁移；用户已验证浏览器行为 |
| C1–C4 | ✅ `v0.3` | Go 同步接口；仅 `go build ./...` 通过 |
| C5 | 待用户确认 | curl 推、拉、海报上传下载命令已在上一窗口交付；没有收到结果 |
| D1–D3 | ✅ `v0.4` 编译通过 | 前端搬入 `ui/`，抽数据接口，接回现有页面 |
| D4 | 【用户】 | 浏览器逐项点击验证；到此停止 |

## 阶段 C 已有的接口

`server/main.go` 注册 `POST /api/sync/push`、`GET /api/sync/pull?since=N`、`POST/GET /api/sync/poster`、`GET /api/sync/state`。数据库逻辑在 `server/internal/db/sync.go`，HTTP 处理在 `server/internal/handler/sync.go`。协议详情见 [../server/README.md](../server/README.md)。

- push 每批 1–100 条，以 `uid` 识别记录；`updated_at` 严格较新的版本获胜，相等拒绝；已删除的同 `uid` 不复活。逐条分配服务端 `server_rev`，返回 `accepted`、`rejected`（含服务端记录）和 `latest_rev`。
- pull 取 `server_rev > since` 的行，**包含墓碑**，记录与 `latest_rev` 来自同一数据库快照。
- 海报用 `<uid>.<ext>`；上传 multipart 字段为 `uid`、`server_rev`、`poster`，10MB 上限；下载 `?uid=` 返回图片字节。上传须匹配当前记录修订号，文件传输不递增 rev。
- 现有 `/api/anime*`、`/api/upload`、`/api/posters/*` 未改；默认端口仍为 2233，`-port 2333` 可与线上服务并存。

## 阶段 D 接手要点

- 前端来源：`/Users/zzf/code/MAL/frontend`。`ui/` 已包含前端源码，`server/frontend/dist` 由 `ui/npm run build` 自动同步，页脚版本号已在源码改为 `v0.4`。
- 前端 API 集中在 `frontend/src/hooks/useAnime.ts`，另外 `LeaderBoard.tsx` 有两处 `request()`。迁移时保持调用语义和响应形状。D2/D3 是纯重构，界面不应变化。
- `go:embed` 不能用 `../ui/dist` 引用 Go package 目录外文件。已由构建脚本将 `ui/dist` 同步到 `server/frontend/dist`，`go build` 通过。不要让浏览器入口失效。
- Node v24.9.0、npm 11.6.0 已在 `~/.local/node`；MAL 旧 `node_modules` 含 macOS 原生依赖，搬入后建议在 `ui/` 重新安装。npm registry 是 npmmirror。
- 数据目录由服务端 `-data` 指定，默认仍在程序所在目录（`go run` 时为当前目录）。`anime.db` 与 `posters/` 不进仓库；已有阶段 B 备份在 `/Users/zzf/code/MAL-backup-20260922-stageB/`。新验证请先复制数据，再用 2333 端口。

## 保持的决策与分工

React UI 复用、Tauri v2 四端外壳、各端本地 SQLite、记录级 LWW + 删除墓碑、`uid` 为 UUID v4、海报以 uid 命名；浏览器现有 REST 行为保留。多语言本次不做。

我负责代码和编译检查；用户负责实机运行、点击界面和数据核对。计划中每个 **【你】** 步骤都必须停下来交给用户。只跑 `go build` / `cargo check` / `npm run build`，不写测试脚手架、UI 自动化、E2E 或快照测试。

环境变量位于 `~/.zshrc` 的 `>>> sakurareel toolchain >>>` 区块；重装用 `scripts/setup-toolchain.sh`。macOS 自带 bash 3.2 中变量名紧跟全角括号会被吞，写 `${VAR}`。

## 阶段 D 当前状态

D1–D3 已完成，`ui/npm run build` 与 `server/go build ./...` 通过。Go 仍以 `frontend/dist` 为嵌入路径，这份产物由 `ui/scripts/copy-to-server.mjs` 在前端构建后自动同步；`ui/dist` 同时保留。D4 浏览器实机点击尚未进行，应由用户用数据副本和 2333 端口验证。C5 的 curl 验证结果仍未知，不能记作通过。
