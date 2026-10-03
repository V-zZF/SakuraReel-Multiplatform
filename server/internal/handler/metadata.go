package handler

import (
	"encoding/json"
	"errors"
	"mal/internal/db"
	"mal/internal/model"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var profileFields = map[string]bool{"overview": true, "release_date": true, "original_title": true, "companies": true, "cast": true, "crew": true, "seasons": true, "episodes": true, "runtime": true, "episode_count": true, "episode_runtime": true, "backdrop": true, "logo": true, "season_name": true, "genres": true, "status": true, "tagline": true, "original_language": true, "countries": true, "spoken_languages": true, "last_air_date": true, "season_count": true, "vote_average": true, "vote_count": true, "budget": true, "revenue": true, "collection": true, "networks": true, "creators": true, "homepage": true, "keywords": true, "aliases": true, "translations": true, "certifications": true, "external_ids": true, "videos": true}

func validMetadata(m *model.Metadata) bool {
	if m == nil {
		return true
	}
	if m.TMDbID < 0 || (m.MediaType != "" && m.MediaType != "movie" && m.MediaType != "tv") || (m.TMDbID > 0 && m.MediaType == "") || (m.SeasonNumber != nil && (m.MediaType != "tv" || *m.SeasonNumber < 0)) {
		return false
	}
	if m.VoteAverage < 0 || m.VoteAverage > 10 || m.VoteCount < 0 || m.SeasonCount < 0 || m.Budget < 0 || m.Revenue < 0 {
		return false
	}
	for _, people := range [][]model.Person{m.Cast, m.Crew, m.Creators} {
		for _, p := range people {
			if p.Photo != "" && !localImageName(p.Photo) {
				return false
			}
		}
	}
	if m.Runtime < 0 || m.EpisodeCount < 0 || m.EpisodeRuntime < 0 || len(m.Overview) > 100000 {
		return false
	}
	for _, d := range []string{m.ReleaseDate, m.LastAirDate} {
		if d != "" {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				return false
			}
		}
	}
	for _, s := range m.Seasons {
		if s.Number < 0 || s.EpisodeCount < 0 || !validFullDate(s.AirDate) {
			return false
		}
	}
	for _, e := range m.Episodes {
		if e.Still != "" && !localImageName(e.Still) {
			return false
		}
		for _, p := range append(append([]model.Person{}, e.GuestStars...), e.Crew...) {
			if p.Photo != "" && !localImageName(p.Photo) {
				return false
			}
		}
		if e.VoteAverage < 0 || e.VoteAverage > 10 || e.VoteCount < 0 {
			return false
		}
		if e.SeasonNumber < 0 || e.Number < 0 || e.Runtime < 0 || !validFullDate(e.AirDate) {
			return false
		}
	}
	for _, name := range []string{m.Backdrop, m.Logo} {
		if name != "" && !localImageName(name) {
			return false
		}
	}
	return true
}
func validFullDate(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}
func localImageName(s string) bool {
	return !strings.ContainsAny(s, "/\\") && s != "." && s != ".." && len(s) < 200
}
func profileError(w http.ResponseWriter, err error) {
	var dup *db.DuplicateError
	if errors.As(err, &dup) {
		writeJSON(w, 409, map[string]any{"ok": false, "error": "作品已收藏，请打开已有收藏", "existing_id": dup.ID})
		return
	}
	if errors.Is(err, db.ErrChanged) {
		fail(w, 409, err.Error())
		return
	}
	fail(w, 500, "保存资料失败")
}
func EditMetadata(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, 400, "无效的 ID")
		return
	}
	var in struct {
		Title       string                     `json:"title"`
		Poster      string                     `json:"poster"`
		Fields      map[string]json.RawMessage `json:"fields"`
		ExpectedRev int64                      `json:"expected_rev"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		fail(w, 400, "资料格式错误")
		return
	}
	a, err := db.GetAnime(id)
	if err != nil || a == nil {
		fail(w, 404, "作品不存在")
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || len([]rune(in.Title)) > 200 || (in.Poster != "" && !localImageName(in.Poster)) {
		fail(w, 400, "片名或图片文件名无效")
		return
	}
	raw := map[string]json.RawMessage{}
	if a.Metadata != nil {
		b, _ := json.Marshal(a.Metadata)
		json.Unmarshal(b, &raw)
	}
	for key, value := range in.Fields {
		if !profileFields[key] || key == "external_ids" {
			fail(w, 400, "不允许编辑此资料字段")
			return
		}
		raw[key] = value
	}
	b, _ := json.Marshal(raw)
	var m model.Metadata
	if json.Unmarshal(b, &m) != nil || !validMetadata(&m) {
		fail(w, 400, "资料字段格式、日期或时长无效")
		return
	}
	saved, err := db.SaveProfile(id, in.ExpectedRev, in.Title, in.Poster, a.Category, &m)
	if err != nil {
		profileError(w, err)
		return
	}
	ok(w, saved)
}
