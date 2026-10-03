# Web TMDb 功能交接

更新时间：2026-10-03。工作目录：`/Users/zzf/code/SakuraReel-Multilingual`。

## 2026-10-03 UI 重设计续接

已按五张参考图实施 Web 分步导入与本地详情重设计。TMDb 页面统一现有粉色主题；后续按用户反馈对齐原手动添加弹窗的桌面 512px 面板与手机底部圆角面板，设置／语言／搜索／选季／预览各自独立显示。详情采用背景渐隐、居中 Logo、个人记录卡片与分组资料；编辑与更新不再叠加在详情上。

新增 `Icon.tsx` 与扩展档案获取 `server/internal/tmdb/archive.go`，扩展 Go／TypeScript 元数据字段并保存头像、单集关联图片。新增 `GET /api/tmdb/config`；通过 `TMDB_READ_TOKEN`／`TMDB_API_KEY` 配置默认凭据，`TMDB_API_BASE`／`TMDB_IMAGE_BASE` 控制服务端地址。默认凭据不接受客户端代理，个人凭据失败不回退。没有真实配置时默认 API 入口隐藏。

预览支持 `previous_token`、`retry_fields` 与 `refresh_images`，扩展档案和图片可分别重新获取，继续保留选中字段和图片；不完整字段通过 `failed_fields` 标识并禁止导入。原有 token 会话绑定、过期、版本冲突、去重与个人记录保护继续有效。

测试脚本生成桌面、平板、手机三种尺寸的五页截图，使用独立临时库与模拟凭据。真实默认 API／个人 Key 完整联调仍需有效凭据。详细验收步骤和配置见 `WEB-TMDB-ACCEPTANCE.md`。所有源码仍未提交；已有 iOS 工程改动未触碰。

## 用户要求与当前阶段

用户要求先完成 Web 端 TMDb 数据获取、资料导入管理和本地详情，再由用户验收、提出修改。多平台适配／封装要等 Web 验收后再讨论。目前实现和自动化验证已完成，接下来按用户反馈继续修改，不应从零重写或直接转做原生端。

必须保持的边界：

- TMDb 刮削与呈现是重点。
- 主页、排行榜仅允许接入添加／详情入口和保存后数据刷新；保留原有布局、样式、分类、排序和拖拽行为。
- 时光机页面及其样式没有修改，继续保持。
- 本轮不修改 Tauri／Rust，不开展原生端适配、打包或发布。
- 作品资料保存在 Go 服务所在电脑的 SQLite 与图片目录，详情读取本地资料，不能变成打开详情即在线刮削。
- TMDb 更新只写选中的作品资料，不能覆盖个人评分、短评、观看年月、收藏状态、播放链接或排序。
- 用户已确认番剧＝日本动画 TV；节目＝其他 TV；电影＝全部电影，包括动画电影。
- 整剧、各普通季和特别篇分别收藏；特别篇的季号为 0，整剧的季号为 null。

## 验收服务

- 当前验收地址：`http://localhost:2333/`，也可用 `http://127.0.0.1:2333/`。
- 交接时已通过健康检查。该地址也是用户目前在应用内浏览器打开的页面。
- 数据目录：`dist/web-acceptance/data/`，含 `anime.db` 和按需创建的 `posters/`。这是独立验收库，不是正式收藏库。保留用户在这里产生的验收数据。
- 当前运行的是编译后的 Go 服务：`dist/web-acceptance/sakurareel-web`。修改源码不会自动更新正在运行的页面。
- 每次 Web 修改后先执行 `cd ui && npm run build`，它会同时更新 `server/frontend/dist/`；再重新构建 Go 服务、停止旧监听进程并用同一数据目录启动新服务。不要重复占用端口，也不要清空数据目录。
- 没有读取或保存用户的真实 TMDb Key。用户可在「＋ → API 设置」自行填写；无需把 Key 发到聊天中。完整真实 API 联调尚未做，已有完整的模拟服务浏览器测试及直接连接可达性检查。

重建和启动命令（先确认并停止旧验收服务）：

```sh
cd /Users/zzf/code/SakuraReel-Multilingual/ui
npm run build
cd ../server
go build -o ../dist/web-acceptance/sakurareel-web .
cd ..
./dist/web-acceptance/sakurareel-web -data ./dist/web-acceptance/data -port 2333
```

验收操作说明见 [WEB-TMDB-ACCEPTANCE.md](WEB-TMDB-ACCEPTANCE.md)。

## 实现入口

前端：

- `ui/src/components/tmdb/TMDbSearch.tsx`：API 设置、语言／代理、搜索／热门／分页、整剧与季选择、预览差异、字段／图片勾选、确认导入、重复收藏入口。
- `ui/src/components/tmdb/WorkDetail.tsx`：本地详情、个人记录优先呈现、演职员和季度／单集摘要、播放链接、两种编辑及 TMDb 更新入口。
- `ui/src/components/tmdb/MetadataEditor.tsx`：手动资料编辑，列表通过表单控件编辑，不向用户展示 JSON。
- `ui/src/components/tmdb/Surface.tsx`、`useUnsaved.ts`、`tmdb.css`：独立样式、弹层、焦点处理、未保存确认及浏览器返回。
- `ui/src/data/tmdb.ts`：Web API、预览／搜索类型、设置存取；Key 存 sessionStorage，语言和代理偏好存 localStorage。
- `ui/src/data/runtime.ts`：电影时长及剧集估算；整剧估算不包含特别篇，缺集数／时长时显示未知。
- `ui/src/App.tsx`：仅接入新入口和数据回写；通过 `!isTauri()` 限定新流程在 Web 启用。
- `ui/src/components/AnimeModal.tsx`：沿用手动添加／个人记录编辑，Web 加未保存确认；个人编辑不发送片名和海报字段。
- `ui/src/components/LeaderBoard.tsx`：增加保存后刷新信号，未改布局或排序算法。

服务端：

- `server/internal/model/metadata.go`：结构化作品资料、人物、季度和单集类型。
- `server/internal/db/sqlite.go`：schema_version 3，新增 metadata JSON 列，保留旧字段；TMDb 来源组合的唯一索引排除删除墓碑。
- `server/internal/db/metadata.go`：事务内再次检查重复和 server_rev；已有收藏仅更新资料、片名和海报，个人记录保持原值。
- `server/internal/tmdb/`：TMDb 请求、作品／季资料及图片候选，翻译缺失尽量补充原语言文本；整剧按季获取单集资料，并发上限 4。
- `server/internal/handler/tmdb.go`：搜索、验证、季列表、预览、确认导入、本地图片下载。预览 token 绑定浏览器会话、30 分钟过期、内存上限 100 项。导入下载失败会清理本次文件并不写入收藏。
- `server/internal/handler/metadata.go`：手动资料更新，字段白名单和乐观版本检查，不允许通过该接口改 TMDb 来源。
- `server/internal/handler/anime.go`：新增 SVG 图片响应隔离头，其余沿用旧 CRUD。
- `server/internal/db/sync.go`：同步保留／返回 metadata；旧推送缺少资料时保留服务端资料，并修复原 PullAnime 使用空 Context 的问题。未增加自动多端同步。

新增路由：`POST /api/tmdb/{validate,search,seasons,preview,import}`；`PUT /api/anime/{id}/metadata`。详情沿用 `GET /api/anime/{id}`。

## 验证与已知行为

已通过：

- `cd ui && npm run test:web`：包含类型检查、构建和 Playwright 浏览器测试。
- `cd ui && npm run lint`：只有原有 RatingCircle 的 Fast Refresh 警告。
- `cd server && go test ./... -race -timeout 45s`。
- `cd server && go vet ./...`。
- 额外验证电影、整剧、特别篇和资料不足时的总时长计算。
- 主页／排行榜实际鼠标拖拽、排行榜详情入口和时光机入口均通过浏览器回归。

测试文件：`server/internal/db/metadata_test.go`、`server/internal/handler/tmdb_test.go`、`ui/scripts/tmdb-smoke.mjs`。Playwright 已加入 devDependencies；新环境需 `npx playwright install chromium`。浏览器测试自建临时 SQLite 和模拟 TMDb 服务，不依赖真实 Key，也不触碰验收或正式数据。

当前需了解的行为：

- TV 搜索按 TMDb 原始分页过滤分类，所以部分页可能为空；没有重新聚合跨页结果。
- 导入已有收藏默认只勾选可补充的空字段，非空字段须主动勾选覆盖；远端缺失字段默认不选中。
- 图片候选最多每类 12 张。选中后下载到本地，支持常见位图及 SVG Logo／背景；SVG 用独立 CSP 响应。
- 季资料部分失败会显示提示，单集摘要默认不选中，避免覆盖成不完整列表。
- 预览仅在服务进程内缓存，重启或过期后需要重新获取。
- 现有同步接口兼容不等于原生端已适配这些资料或图片；后者仍在本轮范围外。

## 工作区状态与继续方式

所有本轮改动尚未提交，新增文件也尚未加入暂存区。新对话须先检查 `git status` 并保留这些改动。

开始本轮前已经存在以下两处用户的 iOS 工程改动，本轮没有修改它们，不要覆盖、回滚或混入本轮提交：

- `src-tauri/gen/apple/sakurareel.xcodeproj/project.pbxproj`
- `src-tauri/gen/apple/sakurareel.xcodeproj/xcshareddata/xcschemes/sakurareel_iOS.xcscheme`

`server/frontend/dist/` 的旧资源删除与新资源新增来自正常前端构建。`dist/web-acceptance/` 与数据库／图片属于被忽略的运行产物，不能提交个人数据或 Key。

下一步先根据用户给出的具体验收反馈修改对应模块。保留已实现功能与边界，完成相关测试后更新正在运行的验收服务。不要把这次交接解释为用户已通过验收或已授权多平台工作。

## 分步页面与动效补充验收（2026-10-03）

- 搜索、范围选择、预览、详情和资料编辑统一粉色操作色、线性图标、卡片和固定操作栏；资料编辑按组呈现，图片上传提供预览与替换入口。
- 页面前进／返回使用对应方向的过渡，面板从触发位置展开；详情与编辑切换保持遮罩连续，退出中的页面不可操作。分段选中背景平滑移动，卡片与按钮提供克制的悬停／按下反馈。
- 系统减少动态效果时关闭位移与缩放；键盘焦点保持在当前面板。未保存确认使用紧凑面板。
- 浏览器测试新增前进／返回方向、悬停反馈、减少动态效果和焦点循环检查；桌面、平板、手机均保存五页及资料编辑截图。
- 本轮 UI 打磨保留主页、排行榜、时光机组件及全局样式。App 仅调整 TMDb 与详情之间的页面切换容器。

## 添加记录流程调整（2026-10-03）

当前流程见下方「交互修订」：先预览，再在准备图片时填写个人记录。

各弹窗对齐原手动表单的 512px 桌面宽度、手机最大 85vh 底部面板、24px 圆角和内边距、14px 正文和控件、18px 标题、12px 控件圆角。主要操作改放底部，搜索齿轮仍在标题栏。

新增验收：延迟资料响应时填写表单、逐字改写片名、个人记录随导入保存、无效输入拒绝、重复／图片失败导入不写入个人记录、更新保持个人记录、三种尺寸的添加表单截图与宽度／字号检查。

手机主页按最新要求固定每行两张卡片，640px 及以上保留原有自适应布局。浏览器验收覆盖 320／390／430px 两列及无横向溢出，并保留桌面拖拽回归。排行榜和时光机未调整。

## 交互修订（2026-10-03）

当前顺序为搜索／选范围 → 导入预览 → 点击「应用所选字段」 → 个人记录表单 → 保存并收藏。选中图片和对应演职员／单集图片在填写期间通过 prepare_only 请求准备，顶部小提示显示实际进度；准备阶段不写收藏。最终保存复用已准备的图片并一次提交资料与个人记录。取消返回预览，失败显示恢复入口；已有收藏更新不打开新收藏表单。

搜索和预览固定内容视口高度，加载时不缩小。搜索底部手动添加只有悬浮按钮，没有白底或模糊横条。详情去掉标题栏，背景图直接位于顶部，关闭按钮固定在右上角；官网、分享、播放、更多均位于背景图区域底部。评分、观看年月、短评卡片可点击或用键盘打开个人编辑，定位对应字段。

扩展档案已从详情、预览和资料编辑分组移除；不再请求别名、翻译、关键词、分级／发行、外部 ID。预告片保留独立请求和展示。旧收藏已有扩展字段兼容保留，不清除。

手机详情的评分、观看年月、总时长采用等宽正方形卡片，减少图标、数值和标签的纵向间隙；观看年月可两行显示。验收检查正方形比例及内容不溢出。

本次构建、浏览器回归、Go race 测试与 vet 通过；320／390／430px 三种手机宽度的正方形记录卡片及内容边界已检查。2333 验收服务已重建重启，沿用原有数据目录。lint 仅有原有 RatingCircle 热更新警告。

## 详情入场与默认 API（2026-10-03）

详情首次打开启用从点击卡片位置展开的缩放、位移与淡入动画；减少动态效果设置继续生效。浏览器测试检查实际动画帧及最终缩放。

2333 验收服务的默认 API 已配置并通过真实验证。凭据只存于被 Git 忽略的 `dist/web-acceptance/service.env.json`（权限 0600），不写入文档、前端或收藏。重启时运行 `python3 dist/web-acceptance/start-service.py`，沿用原数据目录；指引页提供「跳过，使用默认 API（不稳定）」。
