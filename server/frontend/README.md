# 嵌入式前端产物

`dist/` 由 `ui/npm run build` 从 `ui/` 源码生成并同步至此，供 `server/main.go` 的 `go:embed frontend/dist` 使用。Go 的嵌入路径必须位于包目录内，因此这里保留一份 `ui/dist` 的副本。不要直接修改此目录的文件；改前端请修改 `ui/src/` 后重新构建。
