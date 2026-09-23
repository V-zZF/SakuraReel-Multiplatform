package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"mal/internal/db"
	"mal/internal/handler"
)

// 版本号（每次迭代递增）
const appVersion = "1.3.0"

//go:embed frontend/dist
var embeddedDist embed.FS

func main() {
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "用法: %s [选项]\n\n选项:\n", filepath.Base(os.Args[0]))
		flag.PrintDefaults()
	}
	dataDir := flag.String("data", "", "数据目录（内含 anime.db 与 posters/）；默认程序所在目录，go run 时用当前目录")
	port := flag.Int("port", 2233, "监听端口（默认 2233；验证时用 2333 可与线上服务并存）")
	flag.Parse()

	if *port < 1 || *port > 65535 {
		log.Fatalf("❌ 端口超出范围: %d", *port)
	}

	// 数据库路径：程序所在目录的 anime.db
	execPath, _ := os.Executable()
	baseDir := filepath.Dir(execPath)
	dbPath := filepath.Join(baseDir, "anime.db")

	// go run 时 os.Executable() 返回临时目录，改用当前工作目录
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		dbPath = "anime.db"
	}

	// -data 指定数据目录（常用于对着数据副本起服务，不碰线上数据）
	if *dataDir != "" {
		abs, err := filepath.Abs(*dataDir)
		if err != nil {
			log.Fatalf("❌ 数据目录无效: %v", err)
		}
		dbPath = filepath.Join(abs, "anime.db")
	}

	// 海报目录固定与数据库同级
	postersDir := filepath.Join(filepath.Dir(dbPath), "posters")
	handler.SetPostersDir(postersDir)

	fmt.Printf("📂 数据库路径: %s\n", dbPath)
	fmt.Printf("🖼️  海报目录: %s\n", postersDir)
	fmt.Println("🔧 初始化数据库...")

	if err := db.Init(dbPath); err != nil {
		log.Fatalf("❌ 数据库初始化失败: %v", err)
	}
	defer db.Close()

	fmt.Println("✅ 数据库初始化成功")

	// 从嵌入文件系统中提取 frontend/dist 子目录
	distFS, err := fs.Sub(embeddedDist, "frontend/dist")
	if err != nil {
		log.Fatalf("❌ 前端资源加载失败: %v", err)
	}

	// 注册路由
	mux := http.NewServeMux()

	// 健康检查
	mux.HandleFunc("GET /api/health", healthHandler)
	// 版本信息
	mux.HandleFunc("GET /api/version", handler.Version(appVersion))

	// 番剧 CRUD API
	mux.HandleFunc("GET /api/anime", handler.ListAnime)            // 列表（支持 ?category=）
	mux.HandleFunc("GET /api/anime/{id}", handler.GetAnime)        // 单条
	mux.HandleFunc("POST /api/anime", handler.CreateAnime)         // 创建
	mux.HandleFunc("PUT /api/anime/{id}", handler.UpdateAnime)     // 更新
	mux.HandleFunc("PUT /api/anime/reorder", handler.ReorderAnime) // 批量排序
	mux.HandleFunc("DELETE /api/anime/{id}", handler.DeleteAnime)  // 删除

	// 文件上传
	mux.HandleFunc("POST /api/upload", handler.UploadPoster)

	// 海报图片静态服务
	mux.HandleFunc("GET /api/posters/{filename}", handler.ServePosters)

	// 多端同步（不改变浏览器现有 REST API）
	mux.HandleFunc("POST /api/sync/push", handler.SyncPush)
	mux.HandleFunc("GET /api/sync/pull", handler.SyncPull)
	mux.HandleFunc("POST /api/sync/poster", handler.SyncUploadPoster)
	mux.HandleFunc("GET /api/sync/poster", handler.SyncDownloadPoster)
	mux.HandleFunc("GET /api/sync/state", handler.SyncState)

	// 前端 SPA：嵌入的 React 应用
	mux.Handle("/", spaHandler(distFS))

	// 启动服务
	fmt.Printf("🚀 番剧收藏库服务启动: http://localhost:%d  (v%s)\n", *port, appVersion)
	fmt.Printf("📱 局域网访问: http://<你的电脑IP>:%d\n", *port)
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("按 Ctrl+C 停止服务")

	if err := http.ListenAndServe(fmt.Sprintf(":%d", *port), corsMiddleware(mux)); err != nil {
		log.Fatalf("❌ 服务启动失败: %v", err)
	}
}

// healthHandler 健康检查
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(`{"ok":true,"status":"running"}`))
}

// spaHandler 返回 SPA 请求处理器：先尝试匹配文件，否则返回 index.html
func spaHandler(distFS fs.FS) http.Handler {
	fileServer := http.FileServerFS(distFS)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 尝试直接打开请求的文件
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		f, err := distFS.Open(path[1:]) // 去掉开头的 /
		if err != nil {
			// 文件不存在 → 返回 index.html（SPA 路由）
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()

		fileServer.ServeHTTP(w, r)
	})
}

// corsMiddleware 跨域中间件
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
