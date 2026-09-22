# server — Go 服务端

阶段 B 会把 `MAL` 的后端搬进来：`main.go`、`internal/`（`db` / `handler` / `model`）、`go.mod`。

之后新增：

- 建表补同步列（`uid` / `updated_at` / `deleted_at` / `server_rev`）+ `rev` 计数器 + `meta` 表
- 一次性迁移命令：127 条补 `uid`、海报改名 `<uid>.<ext>`
- 同步接口：`/api/sync/push`、`/api/sync/pull`、`/api/sync/poster`、`/api/sync/state`

原有 REST API 与网页托管保持不动，浏览器端继续可用。
