# src-tauri — Tauri 外壳、本地库与同步引擎

阶段 E 初始化。规划职责：

- 外壳：四个平台共用一套 Tauri v2 工程（桌面 + iOS + Android）
- 本地库：`rusqlite`，表结构沿用服务端的 `anime` 表
- 同步引擎：`push` / `pull` / 海报按需下载 / `position` 收敛

海报文件名改用 `<uid>.<ext>`（现在是"标题 + `_2`"，两端会算出不同名字导致分叉）。
