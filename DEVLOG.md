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

---

## 2026-09-22 — 阶段 B（B1–B5）：服务端搬入 + 同步字段 + 一次性迁移

### 做完的

| 步骤 | 内容 |
|---|---|
| B1 | `MAL` 后端搬进 `server/`：`main.go`、`internal/{db,handler,model}`、`go.mod`/`go.sum`；模块名保持 `mal` |
| B2 | `anime` 补 `uid` / `updated_at` / `deleted_at` / `server_rev`；新增 `rev` 计数器表与 `meta` 表；删历史列 `home_position`、`ranking_position` |
| B3 | 迁移：127 条补 `uid`（UUID v4）与 `updated_at`（取 `created_at`） |
| B4 | 迁移：127 张海报改名 `<uid>.jpg`，同步 `poster` 字段 |
| B5 | 写路径：create / update / delete / reorder 补写 `updated_at` 与 `server_rev` |

旧的 `cmd/migrate-posters`（标题改名工具）已删除，换成 `cmd/migrate`（一次性迁移，幂等）。

### 这一阶段新增的决定

| 决策点 | 选择 | 理由 |
|---|---|---|
| `uid` 形态 | UUID v4（`github.com/google/uuid`，36 字符带连字符） | 已经是依赖树里的包；字符串 uid 两端都好用，也直接当海报文件名 |
| 删除语义 | **写墓碑**（`deleted_at`），不物理删行；**海报文件保留** | 各端要能拉到"这条被删了"；文件留着，另一端同步时还能取图 |
| 读路径 | 所有 SELECT 都加 `deleted_at = ''` | 墓碑对浏览器完全不可见，REST 行为与以前一致 |
| 基线 `rev` | 迁移时按 `id` 顺序给老数据分配 `1..127` | 这样 `since=0` 的全量拉取不会漏掉老行（`server_rev = 0` 会被 `rev > since` 排除） |
| 服务端数据目录 | 新增 `-data <目录>` 参数（不传时行为不变） | B6 要对着数据副本跑，不能碰线上数据 |
| 验证端口 | 新增 `-port <端口>` 参数，默认仍是 **2233** | 验证时用 `2333`，可以和线上服务并存，互不干扰 |
| `server/frontend/dist` | 从 `MAL/frontend/dist` 原样拷一份进仓库 | 阶段 B 要求"浏览器旧页面照旧可用"；阶段 D 换成 `ui/dist` 后删除 |
| 服务端版本号 | `appVersion` 1.2.1 → **1.3.0** | 沿用 MAL"每次迭代递增"的惯例 |

### 表的最终形态

`anime`：`id` `uid` `title` `category` `rating` `note` `poster` `watch_date` `play_link`
`position` `leaderboard_position` `created_at` `updated_at` `deleted_at` `server_rev`

辅助表：`rev`（单行计数器，`id=1`）、`meta`（键值对，当前存 `schema_version=2`）。
索引：`idx_anime_uid`（唯一，空 uid 不参与）、`idx_anime_server_rev`（增量拉取用）。

### 我这边跑过的检查（只到编译 + 数据层面）

- 备份：`/Users/zzf/code/MAL-backup-20260922-stageB/`（`anime.db` sha256 与原件一致 + `posters/` 133 个文件）
- `go build ./...` / `go build -o mal .` / `go build -o migrate ./cmd/migrate` / `go vet ./...` 全过
- 迁移跑在副本 `/Users/zzf/code/SakuraReel-scratch/stageB`：**127 条**、uid 127 条去重后 127 个、
  `updated_at == created_at`、`poster == uid.jpg`、posters 目录仍 **133 个文件**、`rev = 127`
- 再跑一次迁移：0 改动（幂等，可反复跑）
- 空库跑一次：新表结构建得对（含 `meta` / `rev` / 两个索引）
- **没做的**：启动服务器、点界面、增删改查 —— 按分工留给 B6

### 踩坑

1. **索引必须等列补齐之后再建**。旧库原本没有 `uid` / `server_rev` 列，先建索引会报
   `no such column: uid`。`ensureSchema` 现在分两段：先建表 + 补列/删列，再建索引。
2. 一次性迁移要能对着**副本**跑才安全，所以给服务端和迁移命令都加了 `-data`。

### 数据事实（B6 的核对基准）

- MAL 原库：**127 条**（看过 112 / 在看 8 / 想看 7）、**posters 133 个文件**
- 这 6 个文件没有任何记录引用，属于历史孤儿，迁移**不动**它们：
  `f5ef943eb7bc00a9.jpg`、`进击的巨人.jpg`、`进击的巨人_第二季.jpg`、`进击的巨人_第二季_2.jpg`、
  `进击的巨人_第三季.jpg`、`进击的巨人_完结篇.jpg`
- 所以"127 条 / 133 个文件"这两个数在迁移前后都该一模一样。

### B6 验证（**【你】**，已通过）

```bash
# 1) 自己再做一份干净副本
mkdir -p ~/code/sr-b6
cp -p /Users/zzf/code/MAL/anime.db ~/code/sr-b6/anime.db
cp -Rp /Users/zzf/code/MAL/posters ~/code/sr-b6/posters

# 2) 跑迁移（幂等，可反复跑）
cd /Users/zzf/code/SakuraReel-Multilingual/server
go run ./cmd/migrate -data ~/code/sr-b6

# 3) 对着副本起服务（默认端口仍是 2233；验证用 2333，可与线上并存）
go run . -data ~/code/sr-b6 -port 2333     # 浏览器打开 http://localhost:2333
```

核对清单（全部通过）：

- 迁移输出：补 uid 127 / 补 updated_at 127 / 基线 rev 127 / 海报改名 127 / 目录文件 133 / 行数 127
- 三个分类条目数 112 / 8 / 7，卡片海报都能显示
- 新增、编辑（标题 / 评分 / 短评 / 观看年月 / 播放链接）、删除、拖拽排序、排行榜同分拖拽都正常
- 上传海报后卡片换图（新文件名形如 `<uid>.jpg`）
- 删除后卡片消失；副本目录里那张海报文件**还在**（是有意保留的，见上表）

验证时服务端跑在 `2333` 对着副本 `~/code/sr-b6`，接口侧同时确认过：`/api/version` = `1.3.0`、
列表 127（112 / 8 / 7）、单条 JSON 带 `uid` / `updated_at` / `deleted_at` / `server_rev`、
海报 `HTTP 200 image/jpeg`。

### 版本

- **SakuraReel-Multi v0.2** —— 阶段 B 里程碑，已提交并打 tag `v0.2`（阶段 A 是 `v0.1`）。
- 页脚版本号：`server/frontend/dist` 里的 `Made by VzZF · v1.2.1` 手改成 `· v0.2`
  （MAL 源码没动）。阶段 D 从 `ui/` 源码重新构建时，按同一规则把版本号正式写进源码，
  以后不再手改产物。
- 服务端自身的 `appVersion` 是 `1.3.0`（沿用 MAL「每次迭代递增」的惯例）：
  `curl http://localhost:2233/api/version` 可确认。

---

## 2026-09-23 — 阶段 C（C1–C4）：Go 同步接口

- 新增 `POST /api/sync/push`：按 `uid` 批量合并记录，每批 1–100 条、JSON 最多 1MB。已有记录以 `updated_at` 严格较晚者为胜；相等时拒绝。墓碑不能被同 `uid` 的普通记录复活。每条成功写入在同一事务里取得新 `server_rev`；返回 `accepted` 的服务端记录、`rejected` 的 `uid` / `reason` / 当前服务端记录，以及 `latest_rev`。数据库错误会回滚整批。
- 新增 `GET /api/sync/pull?since=N`：从一致的数据库快照取 `server_rev > N` 的行，含墓碑，按修订号升序；一起返回该快照的 `latest_rev`。`GET /api/sync/state` 只返回 `latest_rev`。
- 新增 `POST /api/sync/poster`（multipart：`uid` / `server_rev` / `poster`，10MB 上限）与 `GET /api/sync/poster?uid=`。上传只接受记录当前 `poster` 所指的 `<uid>.<ext>` 图片，且须匹配当前修订号；下载也支持墓碑的保留图片。文件传输不分配新 rev。
- 现有 REST 路由、默认端口 2233、嵌入的浏览器前端均未改。接口契约详见 `server/README.md`。
- 只执行 `go build ./...`，通过；没有启动服务、操作数据或执行实机验证。**C5 留给用户**：在新数据副本上以 2333 端口运行，用 curl 推送、拉取和上传下载海报。
- **SakuraReel-Multi v0.3**：阶段 C 的 C1–C4 代码和协议文档已提交并打 tag。C5 命令已交付，但尚未收到用户验证结果；下一个窗口从阶段 D 的 D1–D3 开始，D4 交用户验证。
