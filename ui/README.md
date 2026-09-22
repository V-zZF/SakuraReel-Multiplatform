# ui — 共用前端

阶段 D 会把 `MAL/frontend` 整体搬进来，作为 **Web 与四个 App 共用的唯一一份界面**。

搬入后在此新增：

- `src/data/`：统一数据访问接口 + 两套实现
  - `http.ts` —— 浏览器 / 服务端托管模式，走 `/api/*`
  - `tauri.ts` —— App 模式，走 Rust `invoke`

界面组件本身不改；只有 `hooks/useAnime.ts` 与 `LeaderBoard.tsx` 里两处直接 `request()` 需要重接。
