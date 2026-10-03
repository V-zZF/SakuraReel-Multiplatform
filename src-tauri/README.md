# src-tauri — Tauri 外壳、本地库与同步引擎

当前职责：

- 外壳：四个平台共用一套 Tauri v2 工程（桌面 + iOS + Android）
- 本地库：`rusqlite`，表结构沿用服务端的 `anime` 表
- 同步引擎：`push` / `pull` / 海报按需下载 / `position` 收敛

海报文件名改用 `<uid>.<ext>`（现在是"标题 + `_2`"，两端会算出不同名字导致分叉）。

## 原生 TMDb（v0.7.11 起）

`src/tmdb/` 通过 Rust HTTP 客户端访问 TMDb，处理搜索、季度、导入预览、图片下载、重复检查和资料编辑。共享 React 界面通过 `native_request` invoke 调用，保存到本机 `anime.db` 的 metadata JSON 字段和 `posters/`，不需要 Go 服务。

旧数据库在启动时原地迁移，增加 metadata 与 local_revision。local_revision 用于原生资料编辑的并发检查；数据库 server_rev 仍保留原有本地脏记录语义。为了复用共享界面的 expected_rev 协议，原生 API 返回的 server_rev 表示 local_revision。

个人 TMDb Key／读取令牌只驻留会话与预览内存。图片最多六并发，关联路径去重，预下载结果在最终提交时复用；失败或取消后清理本次文件，数据库以事务保存。原生到 Go 的自动同步仍未实现。

验证命令：`cargo test --locked --lib`；手动检查步骤见 [原生 TMDb 验收](../docs/NATIVE-TMDB-ACCEPTANCE.md)。
