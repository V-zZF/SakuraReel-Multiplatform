package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"mal/internal/db"
	"mal/internal/model"
	"mal/internal/tmdb"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type tmdbInput struct {
	PreviousToken string       `json:"previous_token"`
	RetryFields   []string     `json:"retry_fields"`
	RefreshImages string       `json:"refresh_images"`
	Options       tmdb.Options `json:"options"`
	Query         string       `json:"query"`
	Category      string       `json:"category"`
	Page          int          `json:"page"`
	MediaType     string       `json:"media_type"`
	TMDbID        int64        `json:"tmdb_id"`
	SeasonNumber  *int         `json:"season_number"`
	ExistingID    int64        `json:"existing_id"`
}

func decodeTMDb(w http.ResponseWriter, r *http.Request) (tmdbInput, *tmdb.Client, bool) {
	var in tmdbInput
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		fail(w, 400, "请求格式错误")
		return in, nil, false
	}
	resolved, err := tmdb.Resolve(in.Options)
	if err != nil {
		fail(w, 400, err.Error())
		return in, nil, false
	}
	c, err := tmdb.New(resolved)
	if err != nil {
		fail(w, 400, err.Error())
		return in, nil, false
	}
	return in, c, true
}
func TMDbConfig(w http.ResponseWriter, r *http.Request) {
	ok(w, map[string]bool{"default_available": tmdb.DefaultAvailable()})
}
func TMDbValidate(w http.ResponseWriter, r *http.Request) {
	_, c, valid := decodeTMDb(w, r)
	if !valid {
		return
	}
	var out any
	if err := c.Get(r.Context(), "/configuration", nil, &out); err != nil {
		fail(w, 502, err.Error())
		return
	}
	ok(w, map[string]bool{"valid": true})
}
func TMDbSearch(w http.ResponseWriter, r *http.Request) {
	in, c, valid := decodeTMDb(w, r)
	if !valid {
		return
	}
	if in.Page == 0 {
		in.Page = 1
	}
	if in.Page < 1 || in.Page > 500 {
		fail(w, 400, "页码须为 1–500")
		return
	}
	if in.Category != "anime" && in.Category != "tv" && in.Category != "movie" {
		fail(w, 400, "无效的作品分类")
		return
	}
	media := "tv"
	if in.Category == "movie" {
		media = "movie"
	}
	params := url.Values{"page": {strconv.Itoa(in.Page)}, "include_adult": {"false"}}
	path := "/discover/" + media
	params.Set("sort_by", "popularity.desc")
	if strings.TrimSpace(in.Query) != "" {
		path = "/search/" + media
		params.Set("query", strings.TrimSpace(in.Query))
	} else if in.Category == "anime" {
		params.Set("with_genres", "16")
		params.Set("with_origin_country", "JP")
	}
	var out struct {
		Page       int         `json:"page"`
		TotalPages int         `json:"total_pages"`
		Results    []tmdb.Work `json:"results"`
	}
	if err := c.Get(r.Context(), path, params, &out); err != nil {
		fail(w, 502, err.Error())
		return
	}
	results := []map[string]any{}
	// Classification applies to every returned page. TMDb text search has no genre
	// filter; enrich TV hits when origin_country is omitted rather than guessing.
	for _, work := range out.Results {
		if media == "tv" && len(work.OriginCountry) == 0 {
			var detail tmdb.Work
			if err := c.Get(r.Context(), fmt.Sprintf("/tv/%d", work.ID), nil, &detail); err != nil {
				fail(w, 502, err.Error())
				return
			}
			work.OriginCountry = detail.OriginCountry
			work.Genres = detail.Genres
		}
		if (in.Category == "anime" && !work.IsAnime()) || (in.Category == "tv" && work.IsAnime()) {
			continue
		}
		results = append(results, map[string]any{"id": work.ID, "title": work.DisplayTitle(), "date": work.Date(), "overview": work.Overview, "poster": c.ImageURL(work.PosterPath, "w342"), "media_type": media})
	}
	ok(w, map[string]any{"page": in.Page, "total_pages": min(out.TotalPages, 500), "results": results, "filtered": media == "tv"})
}

// Preview tokens keep untrusted download URLs and API credentials out of import
// payloads. They expire and are bounded, and are bound to the browser's owner token.
type preparedImport struct {
	Signature string
	Fields    map[string]json.RawMessage
	Poster    string
	Files     []string
}

func cleanPrepared(p *preparedImport) {
	if p != nil {
		for _, name := range p.Files {
			os.Remove(filepath.Join(postersDir, name))
		}
	}
}

type previewEntry struct {
	Prepared   *preparedImport
	Candidate  tmdb.Candidate
	Options    tmdb.Options
	ExistingID int64
	Revision   int64
	Owner      string
	Expires    time.Time
}

var previews = struct {
	sync.Mutex
	Items map[string]previewEntry
}{Items: map[string]previewEntry{}}

func TMDbPreview(w http.ResponseWriter, r *http.Request) {
	in, c, valid := decodeTMDb(w, r)
	if !valid {
		return
	}
	if (in.MediaType != "movie" && in.MediaType != "tv") || in.TMDbID <= 0 || (in.SeasonNumber != nil && (in.MediaType != "tv" || *in.SeasonNumber < 0)) {
		fail(w, 400, "作品标识无效")
		return
	}
	owner := r.Header.Get("X-Preview-Owner")
	if len(owner) < 16 || len(owner) > 100 {
		fail(w, 400, "缺少预览会话")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	var candidate tmdb.Candidate
	var err error
	if in.PreviousToken != "" && (len(in.RetryFields) > 0 || in.RefreshImages != "") {
		previews.Lock()
		prior, found := previews.Items[in.PreviousToken]
		previews.Unlock()
		sameSeason := func(a, b *int) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
		if !found || prior.Owner != owner || prior.Expires.Before(time.Now()) || prior.ExistingID != in.ExistingID || prior.Candidate.Metadata.TMDbID != in.TMDbID || prior.Candidate.Metadata.MediaType != in.MediaType || !sameSeason(prior.Candidate.Metadata.SeasonNumber, in.SeasonNumber) {
			fail(w, 410, "预览已过期，请重新获取资料")
			return
		}
		b, _ := json.Marshal(prior.Candidate)
		_ = json.Unmarshal(b, &candidate)
		allowed := map[string]bool{"aliases": true, "translations": true, "keywords": true, "external_ids": true, "videos": true, "certifications": true}
		for _, key := range in.RetryFields {
			if !allowed[key] {
				fail(w, 400, "无效的重试字段")
				return
			}
		}
		if len(in.RetryFields) > 0 {
			c.RetryArchive(ctx, in.MediaType, in.TMDbID, &candidate, in.RetryFields)
		}
		if in.RefreshImages != "" {
			err = c.RefreshImages(ctx, in.MediaType, in.TMDbID, in.SeasonNumber, in.RefreshImages, &candidate)
		}
	} else {
		candidate, err = c.Details(ctx, in.MediaType, in.TMDbID, in.SeasonNumber)
	}
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	var existing *model.Anime
	if in.ExistingID > 0 {
		existing, err = db.GetAnime(in.ExistingID)
		if err != nil || existing == nil {
			fail(w, 404, "收藏不存在")
			return
		}
	}
	duplicate, err := db.FindTMDb(&candidate.Metadata)
	if err != nil {
		fail(w, 500, "重复作品检查失败")
		return
	}
	var revision int64
	if existing != nil {
		revision = existing.ServerRev
	}
	token := randomHex(48)
	previews.Lock()
	for key, entry := range previews.Items {
		if entry.Expires.Before(time.Now()) {
			cleanPrepared(entry.Prepared)
			delete(previews.Items, key)
		}
	}
	if len(previews.Items) >= 100 {
		previews.Unlock()
		fail(w, 429, "预览过多，请稍后重试")
		return
	}
	previews.Items[token] = previewEntry{Candidate: candidate, Options: c.Options, ExistingID: in.ExistingID, Revision: revision, Owner: owner, Expires: time.Now().Add(30 * time.Minute)}
	previews.Unlock()
	possible := []model.Anime{}
	if existing == nil {
		all, e := db.ListAnime("")
		if e == nil {
			for _, a := range all {
				if a.Metadata == nil || a.Metadata.TMDbID == 0 {
					if strings.EqualFold(strings.TrimSpace(a.Title), strings.TrimSpace(candidate.Title)) {
						possible = append(possible, a)
					}
				}
			}
		}
	}
	ok(w, map[string]any{"token": token, "candidate": candidate, "existing": existing, "duplicate": duplicate, "possible_duplicates": possible})
}
func TMDbSeasons(w http.ResponseWriter, r *http.Request) {
	in, c, valid := decodeTMDb(w, r)
	if !valid {
		return
	}
	if in.TMDbID <= 0 {
		fail(w, 400, "作品 ID 无效")
		return
	}
	var work tmdb.Work
	if err := c.Get(r.Context(), fmt.Sprintf("/tv/%d", in.TMDbID), nil, &work); err != nil {
		fail(w, 502, err.Error())
		return
	}
	ok(w, work.Seasons)
}
func downloadImage(ctx context.Context, c *tmdb.Client, path, kind string) (string, error) {
	if !tmdb.ValidImagePath(path) {
		return "", fmt.Errorf("图片路径无效")
	}
	size := "original"
	if kind == "poster" {
		size = "w780"
	}
	if kind == "backdrop" {
		size = "w1280"
	}
	req, err := http.NewRequestWithContext(ctx, "GET", c.ImageURL(path, size), nil)
	if err != nil {
		return "", fmt.Errorf("图片地址无效")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("图片下载失败或超时")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("图片下载失败（HTTP %d）", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxUploadSize+1))
	if err != nil || len(b) > maxUploadSize {
		return "", fmt.Errorf("图片读取失败或超过 10MB")
	}
	mime := http.DetectContentType(b)
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[mime]
	if ext == "" && kind != "poster" && strings.EqualFold(filepath.Ext(path), ".svg") {
		dec := xml.NewDecoder(bytes.NewReader(b))
		for {
			token, e := dec.Token()
			if e != nil {
				break
			}
			if root, ok := token.(xml.StartElement); ok {
				if root.Name.Local == "svg" && (root.Name.Space == "" || root.Name.Space == "http://www.w3.org/2000/svg") {
					ext = ".svg"
				}
				break
			}
		}
	}
	if ext == "" {
		return "", fmt.Errorf("图片格式不支持，请选择 JPG／PNG／WebP 图片或 SVG Logo")
	}

	if err = os.MkdirAll(postersDir, 0755); err != nil {
		return "", fmt.Errorf("无法创建图片目录")
	}
	name := randomHex(32) + ext
	if err = os.WriteFile(filepath.Join(postersDir, name), b, 0644); err != nil {
		return "", fmt.Errorf("保存图片失败")
	}
	return name, nil
}
func TMDbImport(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token       string            `json:"token"`
		Fields      []string          `json:"fields"`
		Images      map[string]string `json:"images"`
		Category    string            `json:"category"`
		Personal    *model.Anime      `json:"personal"`
		PrepareOnly bool              `json:"prepare_only"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		fail(w, 400, "请求格式错误")
		return
	}
	previews.Lock()
	entry, found := previews.Items[in.Token]
	previews.Unlock()
	if !found || entry.Expires.Before(time.Now()) || entry.Owner != r.Header.Get("X-Preview-Owner") {
		fail(w, 410, "预览已过期，请重新获取资料")
		return
	}
	var a *model.Anime
	var err error
	if entry.ExistingID > 0 {
		a, err = db.GetAnime(entry.ExistingID)
		if err != nil || a == nil {
			fail(w, 404, "收藏不存在")
			return
		}
		if a.ServerRev != entry.Revision {
			fail(w, 409, db.ErrChanged.Error())
			return
		}
	} else {
		if !model.ValidCategory(in.Category) {
			fail(w, 400, "观看状态无效")
			return
		}
		if in.Personal != nil {
			p := in.Personal
			p.Title, p.Note, p.PlayLink = strings.TrimSpace(p.Title), strings.TrimSpace(p.Note), strings.TrimSpace(p.PlayLink)
			if p.Title == "" || len([]rune(p.Title)) > 200 || !model.ValidRating(p.Rating) || len([]rune(p.Note)) > 500 || (p.WatchDate != "" && !validWatchDate(p.WatchDate)) || (p.PlayLink != "" && !validPlayLink(p.PlayLink)) {
				fail(w, 400, "个人记录格式无效，请检查片名、评分、观看年月或观看链接")
				return
			}
		}
		a = &model.Anime{Title: entry.Candidate.Title, Category: in.Category}
	}
	fields := map[string]json.RawMessage{}
	if a.Metadata != nil {
		b, _ := json.Marshal(a.Metadata)
		json.Unmarshal(b, &fields)
	}
	b, _ := json.Marshal(entry.Candidate.Metadata)
	source := map[string]json.RawMessage{}
	json.Unmarshal(b, &source)
	// Association is confirmed with this preview, independently from field selection.
	for _, key := range []string{"tmdb_id", "media_type", "season_number", "language"} {
		fields[key] = source[key]
	}
	for _, key := range in.Fields {
		for _, failed := range entry.Candidate.FailedFields {
			if key == failed {
				fail(w, 400, "此资料尚未完整获取，请重试后导入")
				return
			}
		}
		if key == "title" {
			a.Title = entry.Candidate.Title
			continue
		}
		if !profileFields[key] || key == "backdrop" || key == "logo" {
			fail(w, 400, "无效的导入字段")
			return
		}
		fields[key] = source[key]
	}
	newUID := db.NewUID()
	downloaded := []string{}
	cleanup := func() {
		for _, name := range downloaded {
			os.Remove(filepath.Join(postersDir, name))
		}
	}
	signatureBytes, _ := json.Marshal(struct {
		Fields []string
		Images map[string]string
	}{in.Fields, in.Images})
	signature := string(signatureBytes)
	var ready *preparedImport
	previews.Lock()
	currentEntry := previews.Items[in.Token]
	if currentEntry.Prepared != nil && currentEntry.Prepared.Signature == signature {
		ready = currentEntry.Prepared
		currentEntry.Prepared = nil
		previews.Items[in.Token] = currentEntry
	}
	previews.Unlock()
	if ready != nil {
		fields = ready.Fields
		a.Poster = ready.Poster
		downloaded = ready.Files
	} else {
		imageErrors := map[string]string{}
		c, _ := tmdb.New(entry.Options)
		for kind, path := range in.Images {
			if kind != "poster" && kind != "backdrop" && kind != "logo" {
				cleanup()
				fail(w, 400, "无效的图片类型")
				return
			}
			allowed := false
			for _, img := range entry.Candidate.Images[kind] {
				if path == img.Path {
					allowed = true
					break
				}
			}
			if !allowed {
				cleanup()
				fail(w, 400, "图片不属于本次预览")
				return
			}
			name, e := downloadImage(r.Context(), c, path, kind)
			if e != nil {
				imageErrors[kind] = e.Error()
				continue
			}
			downloaded = append(downloaded, name)
			if kind == "poster" {
				a.Poster = name
			} else {
				value, _ := json.Marshal(name)
				fields[kind] = value
			}
		}
		// Only selected groups download their associated images. One path is saved once.
		imageCache := map[string]string{}
		saveImage := func(path, key string) string {
			if path == "" {
				return ""
			}
			if name, ok := imageCache[path]; ok {
				return name
			}
			name, e := downloadImage(r.Context(), c, path, "portrait")
			if e != nil {
				imageErrors[key] = "关联图片保存失败，可取消此资料组后重试"
				return path
			}
			downloaded = append(downloaded, name)
			imageCache[path] = name
			return name
		}
		savePeople := func(people []model.Person, key string) []model.Person {
			for i := range people {
				people[i].Photo = saveImage(people[i].Photo, key)
			}
			return people
		}
		for _, key := range in.Fields {
			if key == "cast" || key == "crew" || key == "creators" {
				var people []model.Person
				_ = json.Unmarshal(source[key], &people)
				fields[key], _ = json.Marshal(savePeople(people, key))
			}
			if key == "episodes" {
				var episodes []model.Episode
				_ = json.Unmarshal(source[key], &episodes)
				for i := range episodes {
					e := &episodes[i]
					e.Still = saveImage(e.Still, key)
					e.GuestStars = savePeople(e.GuestStars, key)
					e.Crew = savePeople(e.Crew, key)
				}
				fields[key], _ = json.Marshal(episodes)
			}
		}

		if len(imageErrors) > 0 {
			cleanup()
			writeJSON(w, 502, map[string]any{"ok": false, "error": "部分图片保存失败，收藏尚未写入。请重试或取消失败图片。", "image_errors": imageErrors})
			return
		}
	}
	if in.PrepareOnly {
		if r.Context().Err() != nil {
			cleanup()
			return
		}
		prepared := &preparedImport{Signature: signature, Fields: fields, Poster: a.Poster, Files: downloaded}
		previews.Lock()
		currentEntry, valid := previews.Items[in.Token]
		valid = valid && !currentEntry.Expires.Before(time.Now())
		if valid {
			cleanPrepared(currentEntry.Prepared)
			currentEntry.Prepared = prepared
			previews.Items[in.Token] = currentEntry
		}
		previews.Unlock()
		if !valid {
			cleanup()
			fail(w, 410, "预览已过期，请重新获取资料")
			return
		}
		ok(w, map[string]bool{"ready": true})
		return
	}
	b, _ = json.Marshal(fields)
	var m model.Metadata
	if json.Unmarshal(b, &m) != nil || !validMetadata(&m) {
		cleanup()
		fail(w, 400, "资料格式无效")
		return
	}
	if entry.ExistingID == 0 && a.Poster != "" {
		name := newUID + filepath.Ext(a.Poster)
		if err := os.Rename(filepath.Join(postersDir, a.Poster), filepath.Join(postersDir, name)); err != nil {
			cleanup()
			fail(w, 500, "海报保存失败")
			return
		}
		for i, old := range downloaded {
			if old == a.Poster {
				downloaded[i] = name
			}
		}
		a.Poster = name
	}
	if entry.ExistingID == 0 && in.Personal != nil {
		a.Title = in.Personal.Title
	}
	saved, err := db.SaveImportProfile(entry.ExistingID, entry.Revision, a.Title, a.Poster, a.Category, &m, in.Personal, newUID)
	if err != nil {
		cleanup()
		profileError(w, err)
		return
	}

	previews.Lock()
	delete(previews.Items, in.Token)
	previews.Unlock()
	ok(w, saved)
}
