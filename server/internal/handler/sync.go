package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"mal/internal/db"
	"mal/internal/model"
)

const maxPushRecords = 100

func validSyncTime(s string) bool {
	if len(s) != len("2006-01-02 15:04:05") {
		return false
	}
	t, err := time.ParseInLocation("2006-01-02 15:04:05", s, time.Local)
	return err == nil && t.Format("2006-01-02 15:04:05") == s
}

func validSyncAnime(a model.Anime) bool {
	id, err := uuid.Parse(a.UID)
	if err != nil || id.Version() != 4 || len(a.UID) != 36 || strings.ToLower(a.UID) != a.UID {
		return false
	}
	if strings.TrimSpace(a.Title) == "" || len(a.Title) > 200 || !model.ValidCategory(a.Category) || !model.ValidRating(a.Rating) || len(a.Note) > 500 {
		return false
	}
	if !validSyncTime(a.CreatedAt) || !validSyncTime(a.UpdatedAt) {
		return false
	}
	if a.DeletedAt != "" && (!validSyncTime(a.DeletedAt) || a.DeletedAt > a.UpdatedAt) {
		return false
	}
	if a.WatchDate != "" && !validWatchDate(a.WatchDate) {
		return false
	}
	if a.PlayLink != "" && !validPlayLink(a.PlayLink) {
		return false
	}
	if a.Poster != "" && !validPosterName(a.UID, a.Poster) {
		return false
	}
	return true
}

func validPosterName(uid, name string) bool {
	if name != filepath.Base(name) || !strings.HasPrefix(name, uid+".") {
		return false
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return name == uid+strings.ToLower(filepath.Ext(name))
	default:
		return false
	}
}

// SyncPush accepts {"records":[...]} and returns accepted server copies and
// rejected entries with the current server copy. Incoming id/server_rev are ignored.
func SyncPush(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var input struct {
		Records []model.Anime `json:"records"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		fail(w, http.StatusBadRequest, "同步 JSON 格式错误或超过 1MB")
		return
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		fail(w, http.StatusBadRequest, "请求只能包含一个 JSON 对象")
		return
	}
	if len(input.Records) == 0 || len(input.Records) > maxPushRecords {
		fail(w, http.StatusBadRequest, "每批须包含 1–100 条记录")
		return
	}
	for _, a := range input.Records {
		if !validSyncAnime(a) {
			fail(w, http.StatusBadRequest, "同步记录字段无效（uid、日期、分类、海报等）")
			return
		}
	}
	accepted, rejected, latest, err := db.PushAnime(input.Records)
	if err != nil {
		fail(w, http.StatusInternalServerError, "同步写入失败: "+err.Error())
		return
	}
	ok(w, map[string]any{"accepted": accepted, "rejected": rejected, "latest_rev": latest})
}

func SyncPull(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("since")
	since, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || since < 0 {
		fail(w, http.StatusBadRequest, "since 须为非负整数")
		return
	}
	records, latest, err := db.PullAnime(since)
	if err != nil {
		fail(w, http.StatusInternalServerError, "同步读取失败: "+err.Error())
		return
	}
	ok(w, map[string]any{"records": records, "latest_rev": latest})
}

func SyncState(w http.ResponseWriter, r *http.Request) {
	latest, err := db.CurrentRev()
	if err != nil {
		fail(w, http.StatusInternalServerError, "读取修订号失败: "+err.Error())
		return
	}
	ok(w, map[string]int64{"latest_rev": latest})
}

// SyncUploadPoster requires uid and server_rev form fields plus a poster file.
// Revision matching prevents an older client from replacing a newer cover.
func SyncUploadPoster(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+(1<<20))
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		fail(w, http.StatusRequestEntityTooLarge, "文件大小不能超过 10MB")
		return
	}
	uid := r.FormValue("uid")
	if _, err := uuid.Parse(uid); err != nil {
		fail(w, http.StatusBadRequest, "无效的 uid")
		return
	}
	rev, err := strconv.ParseInt(r.FormValue("server_rev"), 10, 64)
	if err != nil || rev <= 0 {
		fail(w, http.StatusBadRequest, "无效的 server_rev")
		return
	}
	a, err := db.SyncPosterRecord(uid)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if a == nil || a.Poster == "" {
		fail(w, http.StatusNotFound, "记录或海报不存在")
		return
	}
	if rev != a.ServerRev {
		fail(w, http.StatusConflict, "记录已更新，请先拉取最新版本")
		return
	}
	file, header, err := r.FormFile("poster")
	if err != nil {
		fail(w, http.StatusBadRequest, "缺少 poster 文件")
		return
	}
	defer file.Close()
	if !validPosterName(uid, a.Poster) || strings.ToLower(filepath.Ext(header.Filename)) != filepath.Ext(a.Poster) {
		fail(w, http.StatusBadRequest, "海报文件名与记录的 poster 字段不匹配")
		return
	}
	buf := make([]byte, 512)
	n, err := io.ReadFull(file, buf)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		fail(w, http.StatusBadRequest, "读取图片失败")
		return
	}
	contentType := http.DetectContentType(buf[:n])
	allowed := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
	if contentType != allowed[filepath.Ext(a.Poster)] {
		fail(w, http.StatusBadRequest, "图片内容与扩展名不符")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		fail(w, http.StatusBadRequest, "读取图片失败")
		return
	}
	if err := os.MkdirAll(postersDir, 0o755); err != nil {
		fail(w, http.StatusInternalServerError, "创建海报目录失败")
		return
	}
	tmp, err := os.CreateTemp(postersDir, ".sync-poster-*")
	if err != nil {
		fail(w, http.StatusInternalServerError, "保存海报失败")
		return
	}
	defer os.Remove(tmp.Name())
	count, copyErr := io.Copy(tmp, file)
	closeErr := tmp.Close()
	if copyErr != nil || closeErr != nil || count > maxUploadSize {
		fail(w, http.StatusRequestEntityTooLarge, "保存失败或文件超过 10MB")
		return
	}
	// Recheck and replace while database writes are serialized.
	saved, err := db.SaveSyncPoster(uid, a.Poster, rev, func() error {
		return os.Rename(tmp.Name(), filepath.Join(postersDir, a.Poster))
	})
	if err != nil {
		fail(w, http.StatusInternalServerError, "保存海报失败: "+err.Error())
		return
	}
	if !saved {
		fail(w, http.StatusConflict, "记录已更新，请先拉取最新版本")
		return
	}
	ok(w, map[string]any{"uid": uid, "poster": a.Poster, "server_rev": rev})
}

func SyncDownloadPoster(w http.ResponseWriter, r *http.Request) {
	uid := r.URL.Query().Get("uid")
	if _, err := uuid.Parse(uid); err != nil {
		fail(w, http.StatusBadRequest, "无效的 uid")
		return
	}
	a, err := db.SyncPosterRecord(uid)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if a == nil || a.Poster == "" || !validPosterName(uid, a.Poster) {
		fail(w, http.StatusNotFound, "海报不存在")
		return
	}
	path := filepath.Join(postersDir, a.Poster)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		fail(w, http.StatusNotFound, "海报文件不存在")
		return
	} else if err != nil {
		fail(w, http.StatusInternalServerError, "读取海报失败")
		return
	}
	http.ServeFile(w, r, path)
}
