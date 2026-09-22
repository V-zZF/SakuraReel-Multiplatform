# 开发日志

## 2026-09-22 — 多端化项目启动 + 阶段 A（地基）

### 目标

把 `MAL`（Go + React 的局域网 Web 应用）变成能在 **Windows / macOS / iOS / Android** 上运行的 App：
保留同一套 UI 与数据库结构，各端离线可用，服务端在线时同步数据，后续迭代不再按平台各写一遍。

### 为什么放弃原来那两条路

- `MyAnimeList-MacOS` 与 `SakuraReel` 走的是 SwiftUI 原生路线。SwiftUI 覆盖不到 Android 与 Windows，
  两端的代码复用率撑不起四端目标，因此冻结这两个仓库（只借鉴经验，不搬代码）。
- 现有 React 界面与数据层的耦合极低：**全部 API 访问只集中在 `frontend/src/hooks/useAnime.ts` 一个文件**
  （外加 `LeaderBoard.tsx` 里两处 `request()`）。这意味着"复用界面 + 只换外壳"的代价最小，
  Tailwind / Framer Motion / dnd-kit 都无需改动。

### 已确认的关键决策（后续不要推翻）

| 决策点 | 选择 |
|---|---|
| UI 技术路线 | 复用现有 React UI，装进 **Tauri v2** 外壳；四端共用一套代码 |
| 发行方式 | 自用不上架（iOS 侧载、桌面直接给安装包、Android 装 APK） |
| 数据架构 | **各端本地 SQLite（离线全功能可用）** + 服务端在线时双向同步 |
| 冲突策略 | **记录级后写覆盖（LWW）** + 删除墓碑，防止旧副本复活 |
| 浏览器入口 | 保留：同一份 UI 由 Go 服务端托管，现有 REST API 不动 |
| 界面多语言 | 本次不做（目录名里的 Multilingual 暂只作项目代号） |
| 代码仓库 | 新仓 monorepo，`MAL` 冻结为历史 |
| 初始数据 | 只用 `MAL` 的数据库（127 条），不并入 SakuraReel 的数据 |
| 同步入口 | 页脚状态行 + 点击弹出设置面板（只此一处 UI 新增） |
| 海报命名 | 由 `标题+_2` 改为 `<uid>.<ext>`（标题命名在两端会各自算出不同后缀，导致分叉） |

完整分步计划见 [docs/PLAN.md](docs/PLAN.md)。

### 阶段 A — 完成

**A1 仓库骨架**：`ui/`、`src-tauri/`、`server/`、`docs/`、`scripts/` + `.gitignore` + README，
并已 `git init`（分支 `main`，尚无任何提交）。

**A2 工具链**：全部装在用户目录，不需要 sudo。

| 工具 | 版本 | 位置 |
|---|---|---|
| Rust | 1.98.1 | `~/.cargo/bin` |
| Node | v24.9.0（npm 11.6.0） | `~/.local/node` |
| Go | 1.27.1 | `~/.local/go` |
| Temurin JDK 21 | 21.0.12.1 | `~/.local/jdk-21` |
| Android SDK | platform-tools / android-36 / build-tools 36.0.0 | `~/Library/Android/sdk` |
| Android NDK | 27.3.13750724 | `~/Library/Android/sdk/ndk/` |
| Xcode | 27.0（iOS 27.0 SDK + 模拟器） | 系统自带 |

Rust 交叉目标已装：`aarch64-apple-ios`、`aarch64-apple-ios-sim`、`aarch64-linux-android`、
`armv7-linux-androideabi`、`x86_64-linux-android`。

安装脚本：[scripts/setup-toolchain.sh](scripts/setup-toolchain.sh)（可重复运行，已装好的会跳过）。
环境变量写在 `~/.zshrc` 的 `>>> sakurareel toolchain >>>` 区块；npm registry 已设为 npmmirror。

### 关键技术验证

- crates.io 取 `libc`、npmmirror 取 `react`（19.3.0）均正常 → Rust 与前端依赖不会卡在网络上。
- `tauri` crate 2.11.6 / `@tauri-apps/cli` 2.11.5 / `rusqlite` 0.40.2 均可获取，按 v2 稳定线走（不用 3.0 alpha）。
- 下载速度实测约 2.4 MB/s，国内镜像（aliyun 的 Go、npmmirror 的 Node、TUNA 的 Adoptium、
  腾讯云的 Android 工具）都可达。

### 踩坑记录（下次别再踩）

1. **macOS 自带 bash 3.2 会把变量名后面紧跟的全角括号吞进变量名**：
   `log "安装 $NDK_VER（约 1GB）"` 会报 `NDK_VER（: unbound variable`。写成 `${NDK_VER}` 即可。
2. **`nohup ... &` 起的后台下载会被会话回收**：命令一返回，进程就没了，进度停在半截。
   长任务要跑成"活的会话"，不能靠后台挂起。
3. **`rm -rf` 会被工具链拦下**：改用移到废纸篓（可恢复）代替删除。
4. **Adoptium 的 mac JDK 包是 `.jdk` bundle 结构**（`<版本>/Contents/Home/...`），
   解包要 `--strip-components=3`，否则 `JAVA_HOME` 会少一层 `Contents/Home`。
5. **系统里的 Oracle JDK 26 太新**，Gradle 不支持，因此另外装了 JDK 21 专供 Android 构建。

### 待办（下一步：阶段 B）

| 步骤 | 内容 | 谁做 |
|---|---|---|
| B1 | 把 `MAL` 后端搬进 `server/`（`main.go` / `internal/` / `go.mod`），先原样能跑 | 我 |
| B2 | 建表补同步字段：`uid` / `updated_at` / `deleted_at` / `server_rev` + `rev` 计数器 + `meta` 表 | 我 |
| B3 | 一次性迁移：127 条补 `uid` 与 `updated_at`（取 `created_at`） | 我 |
| B4 | 一次性迁移：海报改名 `<uid>.<ext>` 并同步 `poster` 字段 | 我 |
| B5 | 现有 REST 写路径补写 `updated_at` / `server_rev` | 我 |
| B6 | 用数据副本跑迁移，核对仍是 127 条 / 133 张海报，浏览器旧页面行为不变 | **用户** |

阶段 B 开工前必须先备份 `MAL/anime.db` 与 `MAL/posters/`（`MAL/.gitignore` 忽略了这两项，**仓库里没有备份**）。

### 备注

- `MAL` 现有数据库：127 条（看过 112 / 在看 8 / 想看 7），海报 133 张（35MB）。
- 线上库的 `anime` 表还留着两个历史遗留列 `home_position` 与 `ranking_position`，代码已不再引用；
  迁移时顺手清掉（决定：新结构不含这两列）。
- `MAL/frontend/node_modules` 是 Mac 原生的（含 `@rolldown/binding-darwin-arm64`），
  阶段 D 搬进 `ui/` 后建议重装一次，避免路径残留。

### 版本

- **SakuraReel-Multi v0.1** —— 阶段 A 里程碑，提交时打 tag `v0.1`。
- 版本号目前记在 `README.md` 与本文档。等 `ui/` 与 `src-tauri/` 落地后，
  按旧项目（MAL）的惯例同步到 `ui/package.json`、`src-tauri/Cargo.toml`、
  `src-tauri/tauri.conf.json`，以及页面页脚。
