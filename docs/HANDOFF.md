# 交接 — 下一个窗口做阶段 D

## 粘贴给下一个窗口

```text
继续 SakuraReel 多端化项目。仓库：/Users/zzf/code/SakuraReel-Multilingual
先读 DEVLOG.md、docs/PLAN.md、docs/HANDOFF.md。

当前版本 v0.3：阶段 A、B 完成；阶段 C 的 C1–C4 已实现并通过 go build。
C5 的 curl 命令已交给用户，但本窗口没有收到实机验证结果，不要写成已通过。

现在做阶段 D 的 D1–D3：
- D1 把 MAL/frontend 搬进 ui/，使 web 构建可用，并让 Go 服务继续托管新构建的前端。
- D2 抽 ui/src/data/ 统一数据接口，先实现 http.ts。
- D3 把 hooks/useAnime.ts 和 LeaderBoard.tsx 的 API 调用接到 data/。
完成后只跑 npm run build / go build 编译检查，停在 D4，交给用户在浏览器实机点击验证。

硬约束：现有 REST 和同步 API 行为不变，浏览器端继续可用；UI 外观与交互不改。
只做编译检查，不写测试脚手架、UI 自动化或 E2E。动 anime.db 或 posters/ 前先备份。
```

## 项目与进度

目标是一套 React UI 运行在 Windows / macOS / iOS / Android 的 Tauri v2 App 中；各端本地 SQLite 离线可用，服务端在线时双向同步，浏览器入口继续保留。计划和分工以 [PLAN.md](PLAN.md) 为准。

| 阶段 | 状态 | 要点 |
|---|---|---|
| A | ✅ `v0.1` | 仓库骨架和四端工具链 |
| B | ✅ `v0.2` | Go 服务端搬入、同步字段、一次性迁移；用户已验证浏览器行为 |
| C1–C4 | ✅ `v0.3` | Go 同步接口；仅 `go build ./...` 通过 |
| C5 | 待用户确认 | curl 推、拉、海报上传下载命令已在上一窗口交付；没有收到结果 |
| D1–D3 | 下一窗口执行 | 前端搬入 `ui/`，抽数据接口，接回现有页面 |
| D4 | 【用户】 | 浏览器逐项点击验证；到此停止 |

## 阶段 C 已有的接口

`server/main.go` 注册 `POST /api/sync/push`、`GET /api/sync/pull?since=N`、`POST/GET /api/sync/poster`、`GET /api/sync/state`。数据库逻辑在 `server/internal/db/sync.go`，HTTP 处理在 `server/internal/handler/sync.go`。协议详情见 [../server/README.md](../server/README.md)。

- push 每批 1–100 条，以 `uid` 识别记录；`updated_at` 严格较新的版本获胜，相等拒绝；已删除的同 `uid` 不复活。逐条分配服务端 `server_rev`，返回 `accepted`、`rejected`（含服务端记录）和 `latest_rev`。
- pull 取 `server_rev > since` 的行，**包含墓碑**，记录与 `latest_rev` 来自同一数据库快照。
- 海报用 `<uid>.<ext>`；上传 multipart 字段为 `uid`、`server_rev`、`poster`，10MB 上限；下载 `?uid=` 返回图片字节。上传须匹配当前记录修订号，文件传输不递增 rev。
- 现有 `/api/anime*`、`/api/upload`、`/api/posters/*` 未改；默认端口仍为 2233，`-port 2333` 可与线上服务并存。

## 阶段 D 接手要点

- 前端来源：`/Users/zzf/code/MAL/frontend`。目前 `ui/` 是骨架；`server/frontend/dist` 是阶段 B 临时纳入仓库的旧产物。D1 要从 `ui/` 源码构建，不再手改旧产物；页脚版本号需在源码正式改成 `v0.3` 或下一阶段版本。
- 前端 API 集中在 `frontend/src/hooks/useAnime.ts`，另外 `LeaderBoard.tsx` 有两处 `request()`。迁移时保持调用语义和响应形状。D2/D3 是纯重构，界面不应变化。
- `go:embed` 不能用 `../ui/dist` 引用 Go package 目录外文件。D1 需要设计构建产物进入 Go 可嵌入路径的方式，同时保持 `ui/dist` 为前端构建产物，并让 `go build` 继续通过。不要让浏览器入口失效。
- Node v24.9.0、npm 11.6.0 已在 `~/.local/node`；MAL 旧 `node_modules` 含 macOS 原生依赖，搬入后建议在 `ui/` 重新安装。npm registry 是 npmmirror。
- 数据目录由服务端 `-data` 指定，默认仍在程序所在目录（`go run` 时为当前目录）。`anime.db` 与 `posters/` 不进仓库；已有阶段 B 备份在 `/Users/zzf/code/MAL-backup-20260922-stageB/`。新验证请先复制数据，再用 2333 端口。

## 保持的决策与分工

React UI 复用、Tauri v2 四端外壳、各端本地 SQLite、记录级 LWW + 删除墓碑、`uid` 为 UUID v4、海报以 uid 命名；浏览器现有 REST 行为保留。多语言本次不做。

我负责代码和编译检查；用户负责实机运行、点击界面和数据核对。计划中每个 **【你】** 步骤都必须停下来交给用户。只跑 `go build` / `cargo check` / `npm run build`，不写测试脚手架、UI 自动化、E2E 或快照测试。

环境变量位于 `~/.zshrc` 的 `>>> sakurareel toolchain >>>` 区块；重装用 `scripts/setup-toolchain.sh`。macOS 自带 bash 3.2 中变量名紧跟全角括号会被吞，写 `${VAR}`。
