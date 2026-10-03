package handler

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"mal/internal/db"
	"mal/internal/model"
)

const (
	maxUploadSize = 10 << 20 // 10MB
)

// postersDir 海报目录（默认：当前工作目录下的 posters/）
var postersDir = "posters"

// SetPostersDir 覆盖海报目录（服务端按数据目录调用；空字符串忽略）
func SetPostersDir(dir string) {
	if dir != "" {
		postersDir = dir
	}
}

// ========== 响应工具函数 ==========

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func ok(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": data})
}

func created(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "data": data})
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

// ========== 番剧 CRUD ==========

// ListAnime GET /api/anime?category=xxx
func ListAnime(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	if category != "" && !model.ValidCategory(category) {
		fail(w, http.StatusBadRequest, "无效的分类，可选值：watched / watching / wantwatch")
		return
	}

	list, err := db.ListAnime(category)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if list == nil {
		list = []model.Anime{}
	}
	ok(w, list)
}

// GetAnime GET /api/anime/{id}
func GetAnime(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, http.StatusBadRequest, "无效的 ID")
		return
	}

	anime, err := db.GetAnime(id)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if anime == nil {
		fail(w, http.StatusNotFound, "影视剧不存在")
		return
	}
	ok(w, anime)
}

// CreateAnime POST /api/anime
func CreateAnime(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title     string `json:"title"`
		Category  string `json:"category"`
		Rating    int    `json:"rating"`
		Note      string `json:"note"`
		Poster    string `json:"poster"`
		WatchDate string `json:"watch_date"`
		PlayLink  string `json:"play_link"`
		Position  int    `json:"position"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		fail(w, http.StatusBadRequest, "JSON 格式错误")
		return
	}

	// 校验
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		fail(w, http.StatusBadRequest, "片名不能为空")
		return
	}
	if len(input.Title) > 200 {
		fail(w, http.StatusBadRequest, "片名不能超过 200 字")
		return
	}
	if !model.ValidCategory(input.Category) {
		fail(w, http.StatusBadRequest, "无效的分类，可选值：watched / watching / wantwatch")
		return
	}
	if !model.ValidRating(input.Rating) {
		fail(w, http.StatusBadRequest, "评分范围 0-10（0 表示未评分）")
		return
	}
	if len(input.Note) > 500 {
		fail(w, http.StatusBadRequest, "短评不能超过 500 字")
		return
	}
	if input.WatchDate != "" && !validWatchDate(input.WatchDate) {
		fail(w, http.StatusBadRequest, "观看年月格式错误，应为 YYYY-MM（如 2026-07）")
		return
	}
	input.PlayLink = strings.TrimSpace(input.PlayLink)
	if input.PlayLink != "" && !validPlayLink(input.PlayLink) {
		fail(w, http.StatusBadRequest, "播放链接必须以 http:// 或 https:// 开头，最长 2000 字符")
		return
	}

	// 计算主页 position
	var homePos int
	if input.WatchDate != "" {
		// 有日期：插入该月份组的开头（position=0），同月组其他项后移
		db.ShiftPositionsForWatchDate(input.Category, input.WatchDate)
		homePos = 0
	} else {
		// 无日期：放末尾
		homePos = db.GetMaxPosition(input.Category)
	}

	// 计算排行榜 position（最大值+1，配合 DESC 排序实现最新最前）
	leaderPos := db.GetMaxLeaderboardPosition()

	anime := &model.Anime{
		Title:               input.Title,
		Category:            input.Category,
		Rating:              input.Rating,
		Note:                input.Note,
		Poster:              input.Poster,
		WatchDate:           input.WatchDate,
		PlayLink:            input.PlayLink,
		Position:            homePos,
		LeaderboardPosition: leaderPos,
	}

	id, err := db.CreateAnime(anime)
	if err != nil {
		fail(w, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}

	anime.ID = id

	// 海报文件名固定为 <uid>.<ext>：把上传时的随机名改成 uid
	if anime.Poster != "" {
		newName := RenamePosterForUID(anime.Poster, anime.UID)
		if newName != anime.Poster {
			anime.Poster = newName
			db.UpdateAnime(id, anime)
		}
	}

	created(w, anime)
}

// UpdateAnime PUT /api/anime/{id}
func UpdateAnime(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, http.StatusBadRequest, "无效的 ID")
		return
	}

	// 先查是否存在
	existing, err := db.GetAnime(id)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if existing == nil {
		fail(w, http.StatusNotFound, "影视剧不存在")
		return
	}

	var input struct {
		Title     *string `json:"title"`
		Category  *string `json:"category"`
		Rating    *int    `json:"rating"`
		Note      *string `json:"note"`
		Poster    *string `json:"poster"`
		WatchDate *string `json:"watch_date"`
		PlayLink  *string `json:"play_link"`
		Position  *int    `json:"position"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		fail(w, http.StatusBadRequest, "JSON 格式错误")
		return
	}

	// 记录旧值用于判断
	oldCategory := existing.Category
	oldWatchDate := existing.WatchDate

	// 只更新传入的字段
	if input.Title != nil {
		t := strings.TrimSpace(*input.Title)
		if t == "" {
			fail(w, http.StatusBadRequest, "片名不能为空")
			return
		}
		if len(t) > 200 {
			fail(w, http.StatusBadRequest, "片名不能超过 200 字")
			return
		}
		existing.Title = t
	}
	if input.Category != nil {
		if !model.ValidCategory(*input.Category) {
			fail(w, http.StatusBadRequest, "无效的分类")
			return
		}
		existing.Category = *input.Category
	}
	if input.Rating != nil {
		if !model.ValidRating(*input.Rating) {
			fail(w, http.StatusBadRequest, "评分范围 0-10")
			return
		}
		existing.Rating = *input.Rating
	}
	if input.Note != nil {
		if len(*input.Note) > 500 {
			fail(w, http.StatusBadRequest, "短评不能超过 500 字")
			return
		}
		existing.Note = *input.Note
	}
	if input.PlayLink != nil {
		link := strings.TrimSpace(*input.PlayLink)
		if link != "" && !validPlayLink(link) {
			fail(w, http.StatusBadRequest, "播放链接必须以 http:// 或 https:// 开头，最长 2000 字符")
			return
		}
		existing.PlayLink = link
	}
	if input.Poster != nil {
		existing.Poster = *input.Poster
	}
	if input.WatchDate != nil {
		if *input.WatchDate != "" && !validWatchDate(*input.WatchDate) {
			fail(w, http.StatusBadRequest, "观看年月格式错误，应为 YYYY-MM（如 2026-07）")
			return
		}
		existing.WatchDate = *input.WatchDate
	}
	if input.Position != nil {
		existing.Position = *input.Position
	}

	// 分类变更 → 重算 position
	if existing.Category != oldCategory {
		// 从旧分类移除：压缩旧分类
		db.CompactPositions(oldCategory)
		// 加入新分类
		if existing.WatchDate != "" {
			db.ShiftPositionsForWatchDate(existing.Category, existing.WatchDate)
			existing.Position = 0
		} else {
			existing.Position = db.GetMaxPosition(existing.Category)
		}
	} else if existing.WatchDate != oldWatchDate && existing.WatchDate != "" {
		// 同分类内日期变更：放到新月组开头
		db.ShiftPositionsForWatchDate(existing.Category, existing.WatchDate)
		existing.Position = 0
	}

	if err := db.UpdateAnime(id, existing); err != nil {
		fail(w, http.StatusInternalServerError, "更新失败: "+err.Error())
		return
	}

	// 换了新海报（poster 指向新上传的随机名）→ 改名为 <uid>.<ext>
	if existing.Poster != "" {
		newName := RenamePosterForUID(existing.Poster, existing.UID)
		if newName != existing.Poster {
			existing.Poster = newName
			db.UpdateAnime(id, existing)
		}
	}

	ok(w, existing)
}

// DeleteAnime DELETE /api/anime/{id}
func DeleteAnime(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, http.StatusBadRequest, "无效的 ID")
		return
	}

	anime, err := db.GetAnime(id)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if anime == nil {
		fail(w, http.StatusNotFound, "影视剧不存在")
		return
	}

	// 删除 = 写删除墓碑（db.DeleteAnime 只打 deleted_at，不物理删行）。
	// 海报文件保留：其他设备拉到这条记录时需要能取到图，等同步完成后再统一回收。
	if err := db.DeleteAnime(id); err != nil {
		fail(w, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}

	// 压缩同分类 position
	db.CompactPositions(anime.Category)

	ok(w, nil)
}

// ReorderAnime PUT /api/anime/reorder
func ReorderAnime(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Scope string `json:"scope"` // "home" | "leaderboard"
		Items []struct {
			ID       int64 `json:"id"`
			Position int   `json:"position"`
		} `json:"items"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		fail(w, http.StatusBadRequest, "JSON 格式错误")
		return
	}
	if len(input.Items) == 0 {
		fail(w, http.StatusBadRequest, "排序列表不能为空")
		return
	}

	var err error
	if input.Scope == "leaderboard" {
		err = db.UpdateLeaderboardPositions(input.Items)
	} else {
		// 默认 "home" 或空
		err = db.UpdatePositions(input.Items)
	}

	if err != nil {
		fail(w, http.StatusInternalServerError, "更新排序失败: "+err.Error())
		return
	}

	ok(w, nil)
}

// ========== 文件上传 ==========

// UploadPoster POST /api/upload
func UploadPoster(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		fail(w, http.StatusRequestEntityTooLarge, "文件大小不能超过 10MB")
		return
	}

	file, header, err := r.FormFile("poster")
	if err != nil {
		fail(w, http.StatusBadRequest, "请选择海报文件（字段名: poster）")
		return
	}
	defer file.Close()

	// 校验文件类型
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowedExts[ext] {
		fail(w, http.StatusBadRequest, "不支持的图片格式，允许：jpg / jpeg / png / webp / gif")
		return
	}

	// 读取文件头校验真实类型
	if !validImageType(file) {
		fail(w, http.StatusBadRequest, "文件不是有效的图片格式")
		return
	}

	// 生成随机文件名
	filename := randomHex(16) + ext

	// 确保 posters 目录存在
	if err := os.MkdirAll(postersDir, 0755); err != nil {
		fail(w, http.StatusInternalServerError, "创建上传目录失败")
		return
	}

	// 保存文件
	dstPath := filepath.Join(postersDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		fail(w, http.StatusInternalServerError, "保存文件失败")
		return
	}
	defer dst.Close()

	file.Seek(0, io.SeekStart)
	if _, err := io.Copy(dst, file); err != nil {
		fail(w, http.StatusInternalServerError, "写入文件失败")
		return
	}

	created(w, map[string]string{"filename": filename})
}

// ========== 海报文件重命名 ==========

// PosterNameForUID 生成海报文件名：<uid><ext>
func PosterNameForUID(uid, ext string) string {
	return uid + ext
}

// RenamePosterForUID 把海报文件改名为 <uid>.<ext>，返回新文件名。
// 文件名固定为 uid（不再跟标题走）：两端各自算标题后缀会分叉，uid 不会。
// 文件不存在、uid 为空或改名失败时返回原文件名（保持可用）。
func RenamePosterForUID(oldFilename, uid string) string {
	if oldFilename == "" || uid == "" {
		return oldFilename
	}

	ext := filepath.Ext(oldFilename)
	newFilename := PosterNameForUID(uid, ext)
	if newFilename == oldFilename {
		return oldFilename
	}

	oldPath := filepath.Join(postersDir, oldFilename)
	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		return oldFilename // 原文件不存在，放弃改名
	}

	newPath := filepath.Join(postersDir, newFilename)
	if err := os.Rename(oldPath, newPath); err != nil {
		return oldFilename // 改名失败，保持原名
	}

	return newFilename
}

// ========== 校验函数 ==========

// validPlayLink 校验播放链接格式：可为空，非空时必须以 http:// 或 https:// 开头，最长 2000 字符
func validPlayLink(s string) bool {
	if len(s) > 2000 {
		return false
	}
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}

func validWatchDate(s string) bool {
	if len(s) != 7 {
		return false
	}
	if s[4] != '-' {
		return false
	}
	for i, c := range s {
		if i == 4 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	month := (s[5]-'0')*10 + (s[6] - '0')
	return month >= 1 && month <= 12
}

func validImageType(file multipart.File) bool {
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	file.Seek(0, io.SeekStart)
	contentType := http.DetectContentType(buf[:n])
	return strings.HasPrefix(contentType, "image/")
}

func randomHex(n int) string {
	bytes := make([]byte, n/2)
	rand.Read(bytes)
	return fmt.Sprintf("%x", bytes)
}

// ========== 海报静态服务 ==========

func ServePosters(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	filename = filepath.Base(filename)
	if strings.EqualFold(filepath.Ext(filename), ".svg") {
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:")
		w.Header().Set("X-Content-Type-Options", "nosniff")
	}
	http.ServeFile(w, r, filepath.Join(postersDir, filename))
}

func Version(version string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		fmt.Fprintf(w, `{"ok":true,"data":{"version":"%s"}}`, version)
	}
}
