# 交接 — 下一个窗口从这里开始

## 粘贴给新窗口

```
继续 SakuraReel 多端化项目。仓库：/Users/zzf/code/SakuraReel-Multilingual
先读 DEVLOG.md 与 docs/PLAN.md（PLAN 是分步计划，阶段 A 已完成）。

现在做阶段 B 的 B1–B5，做完停下来把 B6 交给用户验证：

- B1  把 /Users/zzf/code/MAL 的 Go 后端（main.go、internal/、go.mod）搬进 server/，先原样能跑
- B2  给 anime 表补同步字段：uid / updated_at / deleted_at / server_rev，
      外加全局 rev 计数器表与 meta 表；顺手去掉历史遗留列 home_position、ranking_position
- B3  一次性迁移：127 条补 uid 与 updated_at（updated_at 取 created_at）
- B4  一次性迁移：海报改名 <uid>.<ext>，并同步 poster 字段
- B5  现有 REST 写路径（create / update / delete / reorder）补写 updated_at 与 server_rev
- B6  交给用户：用数据副本跑迁移，核对仍是 127 条与 133 张海报，浏览器旧页面行为不变

硬约束：

- 动手前先备份 /Users/zzf/code/MAL/anime.db 与 posters/（仓库里没有备份，二者都被 .gitignore 忽略）
- 只跑"能不能编译过"的检查（go build / cargo check / npm run build）。
  不要写测试脚手架，不要写 UI 自动化测试；实机运行与界面点击验证全部交给用户
- 服务端端口仍是 2233；现有 REST API 的行为不要改变，浏览器端要继续可用
- 环境变量在 ~/.zshrc 的 >>> sakurareel toolchain >>> 区块
  （JAVA_HOME / ANDROID_HOME / NDK_HOME / GOPROXY）；工具链重装跑 scripts/setup-toolchain.sh
- mac 自带 bash 3.2：变量名后面紧跟全角括号会被吞，一律写 ${VAR}
```

## 这个项目在做什么

把 `MAL`（Go + React 的局域网 Web 应用）改造成 Windows / macOS / iOS / Android 四端 App：
复用现有 React 界面装进 Tauri v2 外壳，数据每端本地 SQLite（离线全功能），服务端在线时双向同步；
浏览器访问照旧保留。

## 当前状态

**阶段 A 已完成**：仓库骨架（`ui/` `src-tauri/` `server/` `docs/` `scripts/`）+ 四端工具链全部装好并验证过。
仓库已 `git init`（分支 `main`），但**尚无任何提交**。

细节见 [DEVLOG.md](../DEVLOG.md)，分步计划见 [PLAN.md](PLAN.md)。

## 不要推翻的决策

| 决策点 | 选择 |
|---|---|
| UI | 复用现有 React，装进 Tauri v2 外壳，四端一套代码 |
| 数据 | 各端本地 SQLite + 服务端在线时同步（服务端不是唯一数据源） |
| 冲突 | 记录级后写覆盖（LWW）+ 删除墓碑 |
| 发行 | 自用不上架 |
| 浏览器入口 | 保留，现有 REST API 不动，只新增同步接口 |
| 多语言 | 本次不做 |
| 海报命名 | `<uid>.<ext>`（不再用标题命名） |
| 初始数据 | 只用 MAL 的 127 条 |

## 环境事实

| 工具 | 版本 | 位置 |
|---|---|---|
| Rust | 1.98.1 | `~/.cargo/bin` |
| Node | v24.9.0 | `~/.local/node` |
| Go | 1.27.1 | `~/.local/go` |
| Temurin JDK 21 | 21.0.12.1 | `~/.local/jdk-21` |
| Android SDK + NDK | android-36 / build-tools 36.0.0 / NDK 27.3.13750724 | `~/Library/Android/sdk` |
| Xcode | 27.0（iOS 27.0 SDK） | 系统自带 |

`tauri` crate 2.11.6、`@tauri-apps/cli` 2.11.5、`rusqlite` 0.40.2 均可达；crates.io 与 npmmirror 都已验证能拉包。

## 分工（用户明确要求过）

- **我做**：写代码、配构建、跑编译检查。
- **用户做**：装工具链之外的实机验证、真机装包、点界面、看数据对不对。
- **不写**：UI 自动化测试、E2E、快照测试。同步合并逻辑要不要加少量 Rust 单测，等用户发话。

计划里每个 **【你】** 步骤都是用户的活，做完就停下交接，不要自己往下推。
