# SakuraReel 多端化 — 分步实施计划

目标：一套 React UI 跑在 Windows / macOS / iOS / Android 四个 App 上；
数据每台设备本地 SQLite（离线全功能），服务端在线时双向同步；浏览器访问照旧。

已定前提：复用现有 UI · 自用不上架 · 记录级后写覆盖（LWW）· 界面暂不做多语言。

> 进度记录见 [../DEVLOG.md](../DEVLOG.md)；新窗口接手见 [HANDOFF.md](HANDOFF.md)。

---

## 分工约定

| | 谁做 | 内容 |
|---|---|---|
| 代码 | 我 | 写代码、配构建、配工程 |
| 编译 | 我 | 只跑「能不能编译过」：`cargo check` / `go build` / `npm run build` |
| 实机 | **你** | 装工具链、跑起来、点界面、真机装包、看数据对不对 |
| 测试 | 默认都不写 | 不写 UI 自动化测试、不写 E2E、不写快照测试 |

- 计划里标 **【你】** 的步骤我做完就停下来交给你，不再自己往下推。
- 我**不**主动搭测试脚手架。同步合并逻辑要不要写几条 Rust 单测，你说了才写（默认不写）。

---

## 阶段 A — 地基 ✅

| 步骤 | 内容 | 状态 |
|---|---|---|
| A1 | 建 monorepo 骨架：`ui/` `src-tauri/` `server/` `docs/` `scripts/` + `.gitignore` + README | ✅ 完成 |
| A2 | 装工具链（Rust / Node / Go / JDK 21 / Android SDK + NDK） | ✅ 完成 |

换机器或重装：`bash scripts/setup-toolchain.sh`（可重复运行，已装好的会跳过）。

### 装好的版本

| 工具 | 版本 | 位置 |
|---|---|---|
| Rust | 1.98.1 | `~/.cargo/bin` |
| Node | v24.9.0（npm 11.6.0） | `~/.local/node` |
| Go | 1.27.1 | `~/.local/go` |
| Temurin JDK 21 | 21.0.12.1 | `~/.local/jdk-21` |
| Android SDK | platform-tools / android-36 / build-tools 36.0.0 | `~/Library/Android/sdk` |
| Android NDK | 27.3.13750724 | `~/Library/Android/sdk/ndk/` |
| Xcode | 27.0（iOS 27.0 SDK + 模拟器） | 系统自带 |

几点说明：

- 单独装 JDK 21 是因为系统里的 Oracle JDK 26 超出 Gradle 支持范围。
- Rust 交叉目标已装：`aarch64-apple-ios`、`aarch64-apple-ios-sim`、`aarch64-linux-android`、`armv7-linux-androideabi`、`x86_64-linux-android`。
- 环境变量（`JAVA_HOME` / `ANDROID_HOME` / `NDK_HOME` / `GOPROXY`）写在 `~/.zshrc` 的 `>>> sakurareel toolchain >>>` 区块，不需要时整块删掉即可。
- npm registry 已设为 `registry.npmmirror.com`。
- Tauri CLI 不单独装，用 `ui/` 里的 `@tauri-apps/cli`（npm 装，避免本地编译 CLI）。

---

## 阶段 B — 服务端搬入（先不碰同步）✅

| 步骤 | 内容 | 状态 |
|---|---|---|
| B1 | 把 `MAL` 后端搬进 `server/`：`main.go`、`internal/`、`go.mod`，先原样能跑 | ✅ |
| B2 | 建表加同步列：`uid` / `updated_at` / `deleted_at` / `server_rev`，外加 `rev` 计数器表与 `meta` 表 | ✅ |
| B3 | 写迁移：老 127 条补 `uid` 与 `updated_at`（取 `created_at`） | ✅ |
| B4 | 写迁移：海报改名成 `<uid>.<ext>`，同步更新 `poster` 字段 | ✅ |
| B5 | 现有 REST 写路径（create/update/delete/reorder）补写 `updated_at` 与 `server_rev` | ✅ |
| **B6** | **你验证**：拿一份 `anime.db` + `posters/` 副本跑迁移，确认仍是 127 条、海报都能显示；浏览器旧页面增删改查排序全正常 | ✅ 用户实机验证通过 |

> B3/B4/B5 动的是数据，**先备份** `anime.db` 与 `posters/` 再跑。
> 备份已放在 `/Users/zzf/code/MAL-backup-20260922-stageB/`（原件 sha256 一致）。

### 阶段 B 记录（B1–B5）

- **搬入**：`server/` 里是 `MAL` 后端（模块名仍是 `mal`），前端产物临时放在
  `server/frontend/dist`（阶段 D 换成 `ui/dist`）。旧的标题改名工具 `cmd/migrate-posters`
  删除，换成 `cmd/migrate`（一次性迁移，幂等）。
- **表结构**：`anime` 加 `uid`（UUID v4）/ `updated_at` / `deleted_at` / `server_rev`；
  新增 `rev` 计数器表与 `meta` 表；删历史列 `home_position`、`ranking_position`。
- **删除语义**：DELETE 改成写墓碑（`deleted_at`），不物理删行，海报文件也保留；
  所有读路径过滤墓碑，浏览器行为与以前一致。
- **基线 rev**：迁移时给老数据按 `id` 顺序分配 `1..127`，保证 `since=0` 的全量拉取不漏行。
- **新增 `-data` 参数**（服务端与迁移命令）：对着数据副本跑，不碰线上数据；不传时行为不变。
- **新增 `-port` 参数**（默认仍是 2233）：验证时用 `-port 2333`，可与线上服务并存。
- **我跑过的**：`go build ./...` / `go vet ./...` + 副本迁移（127 条 / 133 文件 / 幂等 / 空库建表）。
  起服务与界面点击（B6）由用户完成。

详细记录、核对基准与 B6 的命令见 [../DEVLOG.md](../DEVLOG.md)。

---

## 阶段 C — 同步接口（Go 侧）

| 步骤 | 内容 | 验收 |
|---|---|---|
| C1 | `POST /api/sync/push`：批量收记录，逐条 LWW，服务端分配递增 `rev`，回传被拒条目 | ✅ `go build` |
| C2 | `GET /api/sync/pull?since=<rev>`：回传 `rev > since` 的记录（含墓碑）+ `latest_rev` | ✅ `go build` |
| C3 | `POST /api/sync/poster` 上传 / `GET /api/sync/poster?uid=` 下载 | ✅ `go build` |
| C4 | `GET /api/sync/state`：回传 `latest_rev`（握手/探活用） | ✅ `go build` |
| **C5** | **你验证**：我给你几条现成 `curl` 命令，你推一条、拉一条、下一个海报，看结果对不对 | ✅ 用户确认无问题 |

---

## 阶段 D — 前端搬入（纯重构，UI 不动）

| 步骤 | 内容 | 验收 |
|---|---|---|
| D1 | `MAL/frontend` 搬进 `ui/`；构建生成 `ui/dist` 并同步到 Go 可嵌入的 `server/frontend/dist` | ✅ `npm run build` + `go build` |
| D2 | 抽 `ui/src/data/`：定统一接口 + 先只实现 `http.ts` | ✅ `npm run build` |
| D3 | 把 `hooks/useAnime.ts` 与 `LeaderBoard.tsx` 两处 `request()` 重接到 `data/` | ✅ `npm run build` |
| **D4** | **你验证**：浏览器里逐项点一遍（三个分类、排行榜、增删改、上传海报、拖拽排序、播放按钮），行为与改动前一致 | ✅ 用户确认无问题 |

> 这一步是纯重构，界面和交互**不该有任何变化**。有任何不同都是 bug，交回给我。

---

## 阶段 E — Tauri 桌面壳（先桌面，风险最低）

| 步骤 | 内容 | 验收 |
|---|---|---|
| E1 | `src-tauri/` 初始化，最小窗口能显示现有 UI | ✅ `cargo check`；窗口待 E2 实机确认 |
| **E2** | **你验证**：macOS 上双击能打开窗口、能看到界面 | ✅ 用户确认无问题 |
| E3 | Rust 建表 + CRUD：`list` / `get` / `create` / `update` / `delete` / `reorder`，语义照搬 Go | ✅ `cargo check`；实机待集中验证 |
| E4 | Rust 海报：保存字节到本地 `posters/`、读取、用 asset 协议给 WebView 显示 | ✅ `cargo check`；实机待集中验证 |
| E5 | 前端加 `data/tauri.ts`，按运行环境自动选实现；`posterSrc()` 两套 | ✅ `npm run build`；实机待集中验证 |
| E6 | 上传改走 HTML 文件选择框 → 字节 → `invoke`（四端通用，不碰原生选择器插件） | ✅ `npm run build`；实机待集中验证 |
| **E7** | **你验证**：macOS App 里增删改、传海报、拖拽排序、排行榜全对 | 待集中验证（用户要求后面统一测试） |
| E8 | Windows 打包（NSIS 安装包 + WebView2） | 构建脚本已备；待 Windows 环境出安装包 |
| **E9** | **你验证**：Windows 上装一次，打开看一眼 | 待集中验证（用户要求后面统一测试） |

---

## 阶段 F — Tauri 移动端

| 步骤 | 内容 | 验收 |
|---|---|---|
| F1 | iOS 工程初始化；`Info.plist` 配 ATS 局域网放行 + 本地网络权限说明；补安全区内边距 | ✅ Xcode 工程已生成，iOS 27 模拟器启动成功 |
| **F2** | **你验证**：侧载到 iPhone，能打开、能滚动、能点 | **【你】** |
| F3 | Android 工程初始化；放行局域网明文 HTTP；返回手势 = 回首页 / 关弹窗 | 我：能出 APK |
| **F4** | **你验证**：装 APK，能用 | **【你】** |
| F5 | 移动端 WebView 手感修整（拖拽、滚动惯性、点击延迟），按你反馈改 | 我：改完给你 |
| **F6** | **你验证**：手机上把排序拖拽点一遍 | **【你】** |

---

## 阶段 G — 同步引擎（Rust）+ 状态 UI

| 步骤 | 内容 | 验收 |
|---|---|---|
| G1 | 本地 `meta` 表：`device_id`、上次游标、服务器地址 | 我：`cargo check` |
| G2 | push：把脏记录推上去，处理被拒条目 | 我：`cargo check` |
| G3 | pull：拉增量、按 LWW 落到本地、墓碑生效 | 我：`cargo check` |
| G4 | 海报按需下载（记录指向缺失文件时才拉） | 我：`cargo check` |
| G5 | `position` 收敛：同步后按 `(watch_date desc, position asc, uid)` 确定性重排并回写压缩 | 我：`cargo check` |
| G6 | 触发时机：启动 / 手动 / 改动后 3s 防抖 / 窗口聚焦 / 每 5 分钟 | 我：`cargo check` |
| G7 | 页脚状态行（`已同步 · 12:03` / `离线 · 3 项待同步`）+ 点击弹出设置面板（服务器地址、立即同步） | 我：`npm run build` |
| **G8** | **你验证**：Mac + iPhone 两台互相同步；断网改几条再上线补同步；一端删掉的另一端不复活 | **【你】** |

---

## 阶段 H — 四端收尾

| 步骤 | 内容 | 验收 |
|---|---|---|
| H1 | 四端图标、应用名、版本号统一 | 我：改完 |
| H2 | `scripts/` 一键构建脚本（桌面两端 / iOS / Android 分开） | 我：跑一遍到出包 |
| H3 | 文档：README、同步说明、构建说明；搬入 `PRODUCT_SPEC.md` | 我：写完 |
| **H4** | **你验收**：四端各走一遍完整流程 | **【你】** |

---

## 风险与代价（已知，不再展开）

- Tauri v2 移动端较新（2.11.x 稳定版）。所以**先桌面（E）、后移动（F）**，风险分散、每阶段都能真机跑。
  万一移动端走不通，回退方案是「移动端 Capacitor + 桌面 Tauri」——UI 仍然一行不动，只是多一套壳。
- 记录级 LWW 会丢掉「另一端较晚但尚未同步的字段级修改」。已确认接受。
- 海报文件名变成 `<uid>.jpg`，不再可读，换来跨设备命名稳定。
- iOS 自用侧载 7 天要重签（自签工具或 AltStore 可自动续）。
