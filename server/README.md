# server — Go 服务端

从 `MAL` 搬过来的 Go 服务端（模块名仍是 `mal`），负责两件事：

1. 浏览器入口：托管 React 界面 + 提供原有 REST API（端口 `2233`，行为不变）
2. 同步服务端：各端本地 SQLite 的「共同副本」，阶段 C 起新增 `/api/sync/*` 接口

## 目录

| 路径 | 内容 |
|---|---|
| `main.go` | 启动、路由注册、SPA 托管（`//go:embed frontend/dist`） |
| `internal/db/` | SQLite：建表、结构升级、CRUD、排序、`rev` 计数器、一次性迁移 |
| `internal/handler/` | HTTP 处理器（REST + 上传 + 海报静态服务） |
| `internal/model/` | `Anime` 数据结构 |
| `cmd/migrate/` | 一次性迁移命令（补同步字段、海报改名 `<uid>.<ext>`） |
| `frontend/dist/` | 临时占位：从 MAL 拷贝的前端产物，阶段 D 换成 `ui/dist`（见该目录 README） |

## 跑起来

```bash
# 开发模式（数据目录 = 当前目录）
go run .

# 编译单文件二进制
go build -o mal .
./mal

# 对着别的数据目录跑（常用于验证迁移，不碰线上数据）
./mal -data ~/some/data-copy -port 2333
```

数据目录里有 `anime.db` 与 `posters/`；不传 `-data` 时默认在程序所在目录（`go run` 时是当前目录）。
端口默认 `2233`，`-port` 可改（验证时用 `2333`，可以和线上服务并存互不干扰）。

## 一次性迁移（阶段 B3 / B4）

```bash
go run ./cmd/migrate -data ~/some/data-copy   # 幂等，可反复跑
```

做三件事：结构升级 → 补 `uid` / `updated_at` → 海报改名 `<uid>.<ext>` 并同步 `poster` 字段。
**先备份数据再跑**（`anime.db` 与 `posters/` 都不进仓库）。

## 表结构（阶段 B 之后）

`anime` 关键列：

| 列 | 含义 |
|---|---|
| `uid` | 全局唯一 ID（UUID v4），海报文件名 = `<uid>.<ext>`；同步按它认记录 |
| `updated_at` | 最后修改时间（本地时间字符串，格式与 `created_at` 一致） |
| `deleted_at` | 非空 = 删除墓碑；REST 列表/详情一律不返回墓碑行 |
| `server_rev` | 服务端全局递增修订号，每次写操作分配；同步增量拉取按它走 |

另有两张辅助表：

| 表 | 用途 |
|---|---|
| `rev` | 单行计数器（`id=1`），全局修订号源头 |
| `meta` | 键值对（`schema_version` / 将来的 `device_id`、`server_url` 等） |

历史遗留列 `home_position`、`ranking_position` 已在结构升级时删除。

## 注意

- 删除是**写墓碑**（不打真删行），海报文件也**保留**在磁盘上：其他设备拉到这条记录时还要能取到图。
  孤儿海报（含 MAL 里本来就没被引用的 6 个文件）留待后续阶段统一回收。
- 排序写路径会逐条刷新 `updated_at` / `server_rev`；同分类 position 压缩、月份组位移也会顺带刷。
- 同步接口（`/api/sync/push|pull|poster|state`）已在阶段 C 新增，现有 REST 不动。

## 同步接口（阶段 C）

所有 JSON 响应沿用 `{ "ok": true, "data": ... }`；错误为 `{ "ok": false, "error": "..." }`。

| 接口 | 请求 | `data` |
|---|---|---|
| `POST /api/sync/push` | `{ "records": [Anime, ...] }`，每批 1–100 条、JSON 最多 1MB | `{ "accepted": [Anime, ...], "rejected": [{ "uid", "reason", "server": Anime }], "latest_rev" }` |
| `GET /api/sync/pull?since=N` | `N` 为非负整数，首次用 0 | `{ "records": [Anime, ...], "latest_rev" }`；按 `server_rev` 升序，包含墓碑 |
| `GET /api/sync/state` | 无 | `{ "latest_rev" }` |
| `POST /api/sync/poster` | multipart：`uid`、`server_rev`、`poster` 文件，最多 10MB | `{ "uid", "poster", "server_rev" }` |
| `GET /api/sync/poster?uid=UUID` | 无 | 原始图片字节（也可下载墓碑记录保留的图片） |

`Anime` 字段见 `internal/model/anime.go`。push 按 `uid` 识别记录，忽略客户端传来的 `id` 与 `server_rev`；返回的 accepted 项带服务端分配的值。`updated_at`、`created_at`、`deleted_at` 用 `YYYY-MM-DD HH:MM:SS`。已有记录只接受**严格晚于**服务端 `updated_at` 的版本；相等也拒绝，避免同秒更新反复覆盖。已删除的 `uid` 不接受普通记录复活，新增请用新 `uid`。被拒项的 `reason` 为 `stale` 或 `deleted`，`server` 是当前完整服务端记录。一个批次内逐条处理，数据库错误则整个批次回滚。

海报文件名必须等于记录的 `poster` 字段（`<uid>.<ext>`），上传扩展名和图片内容必须一致。上传须带当前记录的 `server_rev`，过期返回 409；先 push 带 `poster` 的记录，再用 accepted 项的 `server_rev` 上传图片。海报上传只传文件，不改变记录或递增 `rev`。
