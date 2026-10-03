package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"mal/internal/db"
	"mal/internal/model"
	"mal/internal/tmdb"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestTMDbImportLifecycle(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "test.db")); err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prior := postersDir
	SetPostersDir(t.TempDir())
	defer func() { postersDir = prior }()
	previews.Lock()
	previews.Items = map[string]previewEntry{}
	previews.Unlock()
	var imageDownloads atomic.Int32
	brokenImage := false
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/images/") {
			imageDownloads.Add(1)
			if brokenImage && strings.HasSuffix(r.URL.Path, "/shared.png") {
				w.WriteHeader(500)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2)))
			return
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			w.WriteHeader(401)
			return
		}
		writeJSON(w, 200, map[string]any{"id": 10, "title": "测试电影", "overview": "远端简介", "release_date": "2026-01-01", "runtime": 120, "credits": map[string]any{
			"cast": []map[string]any{{"id": 1, "name": "演员", "profile_path": "/shared.png"}},
			"crew": []map[string]any{{"id": 1, "name": "演员", "profile_path": "/shared.png"}},
		}, "poster_path": "/poster.png", "images": map[string]any{"posters": []map[string]string{{"file_path": "/poster.png"}}}})
	}))
	defer fixture.Close()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /preview", TMDbPreview)
	mux.HandleFunc("POST /import", TMDbImport)
	mux.HandleFunc("PUT /anime/{id}/metadata", EditMetadata)
	mux.HandleFunc("POST /validate", TMDbValidate)
	request := func(path, method, owner string, body any) (int, map[string]json.RawMessage) {
		t.Helper()
		b, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(b))
		r.Header.Set("X-Preview-Owner", owner)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		out := map[string]json.RawMessage{}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return w.Code, out
	}
	options := map[string]string{"key": "test-key", "api_base": fixture.URL, "image_base": fixture.URL + "/images", "language": "zh-CN"}
	owner := "test-browser-owner-123"
	status, out := request("/preview", "POST", owner, map[string]any{"options": options, "media_type": "movie", "tmdb_id": 10})
	if status != 200 {
		t.Fatalf("preview: %d %s", status, out["error"])
	}
	var preview struct {
		Token string `json:"token"`
	}
	json.Unmarshal(out["data"], &preview)
	all, _ := db.ListAnime("")
	if len(all) != 0 {
		t.Fatal("preview wrote a collection")
	}
	payload := map[string]any{"token": preview.Token, "category": "wantwatch", "fields": []string{"overview", "runtime", "cast", "crew"}, "images": map[string]string{"poster": "/poster.png"}}
	status, _ = request("/import", "POST", "other-browser-owner-456", payload)
	if status != 410 {
		t.Fatal("preview not scoped to browser")
	}
	payload["personal"] = map[string]any{"title": "自定义电影", "rating": 11}
	status, _ = request("/import", "POST", owner, payload)
	if status != 400 {
		t.Fatal("invalid personal rating accepted")
	}
	payload["personal"] = map[string]any{"title": "自定义电影", "rating": 7, "note": "导入短评", "watch_date": "2025-06", "play_link": "https://example.org/watch"}
	brokenImage = true
	status, out = request("/import", "POST", owner, payload)
	if status != 502 || out["image_errors"] == nil {
		t.Fatal("missing explicit image failure")
	}
	all, _ = db.ListAnime("")
	if len(all) != 0 {
		t.Fatal("failed download wrote a collection")
	}
	if files, err := os.ReadDir(postersDir); err != nil || len(files) != 0 {
		t.Fatalf("failed import left images behind: %v %v", files, err)
	}
	brokenImage = false
	payload["prepare_only"] = true
	status, out = request("/import", "POST", owner, payload)
	if status != 200 {
		t.Fatalf("prepare failed: %s", out["error"])
	}
	all, _ = db.ListAnime("")
	if len(all) != 0 {
		t.Fatal("preparing images created a collection")
	}
	preparedDownloads := imageDownloads.Load()
	if preparedDownloads != 4 {
		t.Fatalf("expected poster and one shared portrait per attempt, got %d downloads", preparedDownloads)
	}
	delete(payload, "prepare_only")
	status, out = request("/import", "POST", owner, payload)
	if status != 200 {
		t.Fatalf("import: %d %s", status, out["error"])
	}
	if imageDownloads.Load() != preparedDownloads {
		t.Fatal("final save downloaded prepared images again")
	}
	var a model.Anime
	json.Unmarshal(out["data"], &a)
	if a.Metadata == nil || a.Metadata.Overview != "远端简介" || !validPosterName(a.UID, a.Poster) {
		t.Fatalf("bad saved metadata %+v", a)
	}
	if len(a.Metadata.Cast) != 1 || len(a.Metadata.Crew) != 1 || a.Metadata.Cast[0].Photo == "" || a.Metadata.Cast[0].Photo != a.Metadata.Crew[0].Photo || !localImageName(a.Metadata.Cast[0].Photo) {
		t.Fatalf("associated images were not localized and shared: %+v", a.Metadata)
	}
	if a.Title != "自定义电影" || a.Rating != 7 || a.Note != "导入短评" || a.WatchDate != "2025-06" || a.PlayLink != "https://example.org/watch" {
		t.Fatalf("personal record import lost fields: %+v", a)
	}
	a.Rating = 9
	a.Note = "我的短评"
	a.WatchDate = "2026-02"
	db.UpdateAnime(a.ID, &a)
	// Duplicate import returns existing id without creating another collection.
	status, out = request("/preview", "POST", owner, map[string]any{"options": options, "media_type": "movie", "tmdb_id": 10})
	json.Unmarshal(out["data"], &preview)
	payload["token"] = preview.Token
	payload["images"] = map[string]string{}
	status, out = request("/import", "POST", owner, payload)
	if status != 409 || out["existing_id"] == nil {
		t.Fatal("duplicate was not rejected")
	}
	// A preview may only merge checked fields, never personal data.
	status, out = request("/preview", "POST", owner, map[string]any{"options": options, "media_type": "movie", "tmdb_id": 10, "existing_id": a.ID})
	json.Unmarshal(out["data"], &preview)
	payload["token"] = preview.Token
	payload["fields"] = []string{"release_date"}
	status, out = request("/import", "POST", owner, payload)
	if status != 200 {
		t.Fatalf("update: %s", out["error"])
	}
	json.Unmarshal(out["data"], &a)
	if a.Rating != 9 || a.Note != "我的短评" || a.WatchDate != "2026-02" || a.Metadata.Overview != "远端简介" || a.Metadata.ReleaseDate != "2026-01-01" {
		t.Fatal("merge changed unselected or personal data")
	}
	status, _ = request("/anime/1/metadata", "PUT", owner, map[string]any{"title": "电影", "poster": a.Poster, "expected_rev": a.ServerRev, "fields": map[string]any{"tmdb_id": 11}})
	if status != 400 {
		t.Fatal("manual source tampering allowed")
	}
}
func TestSearchClassificationAndErrors(t *testing.T) {
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("api_key") == "bad" {
			w.WriteHeader(401)
			return
		}
		if r.URL.Query().Get("query") == "limited" {
			w.WriteHeader(429)
			return
		}
		writeJSON(w, 200, map[string]any{"page": 1, "total_pages": 3, "results": []map[string]any{
			{"id": 1, "name": "日本动画", "genre_ids": []int{16}, "origin_country": []string{"JP"}},
			{"id": 2, "name": "其他动画", "genre_ids": []int{16}, "origin_country": []string{"US"}},
			{"id": 3, "name": "日本节目", "genre_ids": []int{18}, "origin_country": []string{"JP"}},
		}})
	}))
	defer fixture.Close()
	for _, tt := range []struct {
		category, key, query string
		count, status        int
	}{{"anime", "test", "", 1, 200}, {"tv", "test", "", 2, 200}, {"movie", "test", "", 3, 200}, {"anime", "bad", "", 0, 502}, {"tv", "test", "limited", 0, 502}} {
		b, _ := json.Marshal(map[string]any{"options": map[string]string{"key": tt.key, "api_base": fixture.URL}, "category": tt.category, "query": tt.query, "page": 1})
		r := httptest.NewRequest("POST", "/", bytes.NewReader(b))
		w := httptest.NewRecorder()
		TMDbSearch(w, r)
		if w.Code != tt.status {
			t.Fatalf("%+v: %d", tt, w.Code)
		}
		if tt.status == 200 {
			var out struct {
				Data struct {
					Results []any `json:"results"`
				} `json:"data"`
			}
			json.Unmarshal(w.Body.Bytes(), &out)
			if len(out.Data.Results) != tt.count {
				t.Fatalf("wrong classification %+v", tt)
			}
		}
	}
}

func TestSVGLogoLocalStorage(t *testing.T) {
	prior := postersDir
	SetPostersDir(t.TempDir())
	defer func() { postersDir = prior }()
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="red"/></svg>`))
	}))
	defer fixture.Close()
	client, err := tmdb.New(tmdb.Options{Key: "test", APIBase: fixture.URL, ImageBase: fixture.URL})
	if err != nil {
		t.Fatal(err)
	}
	name, err := downloadImage(context.Background(), client, "/logo.svg", "logo")
	if err != nil || !strings.HasSuffix(name, ".svg") {
		t.Fatalf("SVG was not saved: %s %v", name, err)
	}
	r := httptest.NewRequest("GET", "/api/posters/"+name, nil)
	r.SetPathValue("filename", name)
	w := httptest.NewRecorder()
	ServePosters(w, r)
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("SVG logo was not served with isolation")
	}
}

func TestServerCredentialsStayOnServer(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("api_key") != "server-secret" {
			w.WriteHeader(401)
			return
		}
		writeJSON(w, 200, map[string]any{})
	}))
	defer upstream.Close()
	t.Setenv("TMDB_API_KEY", "server-secret")
	t.Setenv("TMDB_READ_TOKEN", "")
	t.Setenv("TMDB_API_BASE", upstream.URL)
	t.Setenv("TMDB_IMAGE_BASE", upstream.URL+"/images")
	config := httptest.NewRecorder()
	TMDbConfig(config, httptest.NewRequest("GET", "/api/tmdb/config", nil))
	if strings.Contains(config.Body.String(), "server-secret") || !strings.Contains(config.Body.String(), "true") {
		t.Fatal("configuration exposed credentials or omitted availability")
	}
	for _, tt := range []struct {
		options map[string]string
		status  int
	}{{map[string]string{"credential_mode": "server"}, 200}, {map[string]string{"credential_mode": "server", "api_base": upstream.URL}, 400}, {map[string]string{"credential_mode": "server", "image_base": upstream.URL}, 400}, {map[string]string{"credential_mode": "personal", "key": "wrong", "api_base": upstream.URL}, 502}} {
		// Personal key must be used as supplied, never silently replaced with default.
		b, _ := json.Marshal(map[string]any{"options": tt.options})
		out := httptest.NewRecorder()
		TMDbValidate(out, httptest.NewRequest("POST", "/", bytes.NewReader(b)))
		if out.Code != tt.status || strings.Contains(out.Body.String(), "server-secret") {
			t.Fatalf("status or credential leak: %d %s", out.Code, out.Body.String())
		}
	}
	if calls != 2 {
		t.Fatalf("untrusted proxies received a request: %d", calls)
	}
	t.Setenv("TMDB_API_KEY", "")
	out := httptest.NewRecorder()
	TMDbValidate(out, httptest.NewRequest("POST", "/", strings.NewReader(`{"options":{"credential_mode":"server"}}`)))
	if out.Code != 400 {
		t.Fatal("missing server key accepted")
	}
}
