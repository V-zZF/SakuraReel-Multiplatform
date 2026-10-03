# 开发日志

## 2026-10-03 — v0.7.10 本地图片保存加速与安装包发布

- Go Web 导入改为最多 6 张图片并行下载；演员、制作人员及单集资料中的相同关联图片只下载一次，失败也统一报告给引用该图片的资料组。
- 保留图片画质、预下载复用、字段选择与个人记录语义；下载失败时等待工作线程结束并清理本次图片，避免写入不完整收藏。
- 固定每张图片 10ms 模拟网络延迟的基准：12 张图片串行约 144ms，并行约 30ms（约 4.7 倍）。真实网络收益取决于延迟、带宽与图片数量。
- 源码版本统一为 **0.7.10**，发布 Android ARM64 APK（沿用原发布密钥，versionCode 7010）与 Apple Silicon macOS DMG（ad hoc 签名，未 Apple 公证），附 SHA-256 校验文件。
- 补齐 README 的下载、安装、签名、打包与功能边界说明。TMDb 元数据导入及此次下载优化只适用于 Web/Go，原生 App 的 TMDb 适配仍待实现；实机交互验收仍待进行。

## 2026-10-03 — v0.7.9 Web TMDb 导入与作品详情

- Web 新增 TMDb 分步导入、图片与结构化资料本地保存、个人记录填写及离线作品详情；支持服务端默认 API 和浏览器会话个人凭据。
- 重做搜索、选季、预览与详情，统一粉色主题和手动添加弹窗尺寸；补齐卡片入场动画、手机两列作品与正方形记录卡片。
- 前端、Tauri、Apple 配置与 Go 服务版本统一为 **0.7.9**。本次交付源码及 Web 构建，不生成桌面或移动安装包。

## 2026-09-26 — v0.6.3 时光机标题裁切修复

- 修复时光机作品标题在底部详情区被裁切的问题：详情区按内容自然增高，标题、日期和评分不再被 flex 压缩；保留底部留白。
- 源码版本更新为 **0.6.3**；Android 版本号按 Tauri 配置由 `0.6.3` 派生为 `versionCode=6003`。构建并签名 Android ARM64 APK（`apksigner verify` 通过）及 Apple Silicon macOS DMG（`hdiutil verify` 通过），均保存在本地 `dist/`。iPhone IPA 因 Xcode 工程未配置开发者团队、现有 provisioning profile 与应用 Bundle ID 不匹配，当前未能导出。

## 2026-09-26 — v0.6.2 交互细节与播放链接修复

- 时光机从季度进入本季作品时，封面从中心向两侧展开；返回时收拢。移除底部左右按钮，保留点选、拖动、触屏滑动和键盘方向键，并调整底部信息区留白。
- 首页卡片增加轻微鼠标跟随倾斜、抬升和阴影；排行榜反馈更明显。编辑拖拽、触屏和系统“减少动态效果”分别适配。
- Tauri App 的播放链接改用官方 Opener 插件交给系统默认应用打开；浏览器仍使用普通链接。插件权限仅放行 HTTP/HTTPS URL。
- 源码版本更新为 **0.6.2**，Android `versionCode=6002`。前端构建、TypeScript、lint 和 `cargo check` 通过；lint 仅有既存 `RatingCircle.tsx` Fast Refresh 警告。当前未生成 v0.6.2 安装包，既有 v0.6.1 APK/DMG 仍是上一版。

## 2026-09-25 — G 阶段时光机、品牌图标与 v0.6.1 安装包

- 完成 G 阶段共用时光机界面：按观看年月整理季度与作品，增加舞台、季度浏览、Cover Flow、短评翻面、键盘/读屏支持和减少动态效果适配；首页标题长按进入时光机。代码侧 `npm run build` 通过，Mac 与移动端实机验收仍待进行。
- 调整收藏卡片、排序动画和表单视觉；更新产品用语为“影视剧”，浏览器标题改为 SakuraReel。
- 将用户提供的 `SakuraReel-Complete-Icon-1024.svg` 合成为 Tauri 多尺寸图标，接入 macOS、iOS、Android 资源；配置 macOS bundle 图标。导航栏品牌标题改用圆润字体栈。DMG 内 `icon.icns` 与源图标校验一致。
- 项目版本统一为 **0.6.1**；Android `versionCode=6001`。构建 ARM64 Android Release APK 并用既有发布密钥签名，`apksigner verify` 通过；构建 Apple Silicon macOS DMG，`hdiutil verify` 通过。APK / DMG 位于本地 `dist/`，不纳入源码提交。
- 将 Tauri 生成的 Android Gradle 工程、平台资源与 iOS 版本号更新纳入仓库；同步 README、项目状态和交接文档。

## 2026-09-23 — macOS / iOS 拖拽与悬浮手感修整

- 首页网格改用 `rectSortingStrategy`；首页和排行榜的 dnd-kit 位移放在外层 DOM，Framer Motion 入场和悬浮动画放在内层，避免两个动画系统同时写 `transform`。
- 拖动项仅在拖动期间以外层透明度隐藏，结束即恢复；排行榜排序保存失败时提示并重新读取列表。
- 卡片悬浮改为较轻的弹簧位移与缩放，阴影和海报放大加平滑过渡。首页排序持久化移出 React 状态更新函数。
- `npm run build`、`npm run lint`、`git diff --check` 通过；lint 仅有既存的 `RatingCircle.tsx` Fast Refresh 警告。iOS 模拟器主界面已重新打开，拖拽动作待用户手动验收。

## 2026-09-23 — F1：iOS 工程与模拟器

- 生成 `src-tauri/gen/apple/` Xcode 工程；部署目标调至 iOS 15。`Info.plist` 配局域网 ATS 和本地网络用途说明。
- 适配刘海与底部手势区；开发服务器监听局域网地址。Rust 入口拆为 `lib.rs` 与桌面 `main.rs`，供 iOS 编译静态库。
- Xcode 27 的 iOS 27 模拟器首次启动被 UIKit 的 Scene 生命周期检查中断；按 Tauri/tao 当前配置加入 `UIApplicationSceneManifest` 和 `TaoSceneDelegate` 后，iPhone 18 Pro 模拟器启动成功，主界面可见。
- Xcode build 成功；CLI 后续 archive 因未配置 Apple 开发团队失败。模拟器 App 已手动安装并启动。真机 F2 验收未做。

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

## 2026-09-23 — 阶段 D（D1–D3）：前端搬入与数据层抽取

- 将 `MAL/frontend` 源码搬入 `ui/`，在 `ui/` 重新安装依赖；页脚版本号在源码中设为 `v0.4`。
- `npm run build` 生成 `ui/dist`，并将产物同步到 `server/frontend/dist` 供现有 `go:embed` 托管。Go 不支持从包目录嵌入 `../ui/dist`，所以保留这个构建产物副本。
- `ui/src/data/index.ts` 定义统一数据接口，`http.ts` 保留原 REST 请求地址、方法、JSON 包装、上传和海报 URL 语义；`useAnime.ts` 和排行榜的两处请求改由该接口调用。UI 布局及交互代码未改。
- 编译检查：`npm run build`、`go build ./...` 均通过。没有启动服务或执行浏览器点击。D4 留给用户；C5 仍未收到验证结果。

- **SakuraReel-Multi v0.4**：阶段 D 的 D1–D3 已提交并打 tag；D4 尚未由用户在浏览器验证，C5 结果也仍未知。

## 2026-09-23 — 阶段 E1：Tauri v2 桌面窗口工程

- 用户明确要求继续 E 阶段；D4 与 C5 仍保留待验证状态。
- 初始化 `src-tauri/`：Tauri v2 配置、Rust 入口、构建脚本和临时图标。开发窗口加载 `ui/` 的 Vite 页面；正式构建使用 `ui/dist`。
- `ui/` 增加 Tauri CLI；Vite API 代理支持通过 `VITE_API_PROXY_TARGET` 指向数据副本服务，默认值仍为 `http://localhost:2233`。
- 编译检查：`npm run build` 与 `cargo check` 通过。E2 由用户实机验证；在用户完成 E2 前不进入 E3。

### 本窗口启动尝试与交接

- 用户随后要求我启动 App 并说明验收点。我从阶段 B 备份创建 `/Users/zzf/code/sr-e2/` 数据副本，迁移输出为 127 条记录、133 张海报、基线 rev 127。原库和备份未改。
- 用 `go run . -data /Users/zzf/code/sr-e2 -port 2333` 启动服务。首次 `tauri dev` 发现 `beforeDevCommand` 的工作目录已经是 `ui/`，原写法 `npm --prefix ui` 错指 `ui/ui/package.json`；已改为 `npm run dev`，构建前命令同样改为 `npm run build`。
- 修正后 `VITE_API_PROXY_TARGET=http://localhost:2333 npm run tauri -- dev` 完成 Rust 开发构建并运行 `target/debug/sakurareel`。前一次非交互会话随即退出；第二次用交互终端重新启动，但本轮会话被中断。最后核对时，2333、1420 均无监听进程，Tauri 进程也不在运行。**没有收到用户对窗口显示的确认，E2 未通过**。
- Tauri CLI 从仓库根目录识别 `src-tauri/`；`ui/package.json` 的 `tauri` 脚本因此先切到根目录。临时图标已生成 macOS/Windows/移动端规格，最终图标留待 H1。
- 本窗口 E1 代码、锁文件与文档仍是未提交工作区改动；没有提交或打 tag。D4、C5 仍待用户验证。

## 2026-09-23 — 阶段 E3–E6：本地 SQLite、海报与前端接线

- 用户确认 C5、D4、E2 均无问题；这三项按用户验收通过记录。用户要求后续实机测试集中做，因此 E7、E9 暂不逐项停下，仍标为待验证。
- E3：`src-tauri/src/local.rs` 建立 App 数据目录中的 SQLite，表字段与服务端同步结构一致；提供 `list/get/create/update/delete/reorder` Tauri 命令。创建用 UUID v4，删除写墓碑，排序与增删改刷新 `updated_at` 并将 `server_rev` 设为 0，留给阶段 G 同步。主页按月份与位置排序，排行榜按评分与榜单位置排序。
- E4：海报保存到 App 数据目录的 `posters/`；上传先写临时文件，保存记录时改为 `<uid>.<ext>`。Tauri asset 协议只放行该目录下的文件；删除记录不删海报。
- E5/E6：增加 `ui/src/data/tauri.ts`，通过 `isTauri()` 在本地命令与浏览器 HTTP 间选择。启动时取得海报目录，`convertFileSrc` 生成 WebView 图片 URL。现有 HTML 文件选择框将图片字节传给 `upload_poster`，无需原生选择器插件。
- E8 准备：`scripts/build-windows.ps1` 在 Windows 执行 `npm ci` 与 NSIS 构建；配置使用 WebView2 下载引导程序。当前仅有 macOS 环境，尚未产出 Windows 安装包，E8 不记为完成。
- 编译检查：`cargo check`、`npm run build`、`go build ./...` 均通过；未做实机功能测试。随后安装 rustfmt 并运行 `cargo fmt`。所有本阶段改动尚未提交。

## 2026-09-23 — v0.5 收尾：iOS 模拟器与拖拽交互

- F1：生成 iOS Xcode 工程，处理 iOS 27 Scene 启动要求；模拟器 App 已启动。将项目数据副本中的 127 条记录、133 张海报导入模拟器 App。F2 真机侧载与验收待完成。
- 根据 macOS/iOS 验收反馈，调整主页与排行榜的拖拽让位、排序后卡片显示及卡片悬浮动画；仍待用户复验。E7、E9 保持待验收状态。
- 自定义 `.icon` 接入依用户要求推迟；提供的原始文件未改，也未纳入 v0.5。项目中保留 Tauri 工程初始化时生成的临时图标。
- 将前端版本、页脚和 README 更新为 v0.5。`npm run build`、`cargo check`、`go build ./...` 通过；`npm run lint` 仅有既有的 `RatingCircle.tsx` Fast Refresh 提示。
