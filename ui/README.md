# ui — 共用 React 前端

这里是浏览器和后续 Tauri App 共用的界面源码，来自 `MAL/frontend`。数据访问统一经 `src/data/`：`index.ts` 定义接口并选择实现，目前由 `http.ts` 调用现有 `/api/*`。

在本目录运行 `npm ci`、`npm run build`。构建先生成 `ui/dist`，再由 `scripts/copy-to-server.mjs` 把相同产物同步到 `server/frontend/dist`，供 Go 的 `go:embed` 打进单文件服务端。Go 不允许嵌入包目录外的 `../ui/dist`，因此服务端仍嵌入 `frontend/dist`；请勿手改构建产物。开发服务器继续代理 `/api` 到 `localhost:2233`。
