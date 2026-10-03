package db

import (
	"database/sql"
	"errors"
	"mal/internal/model"
	"path/filepath"
	"testing"
)

func testDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "anime.db")
	if err := Init(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { Close() })
	return path
}
func TestLegacyMigrationAndPreservation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(`CREATE TABLE anime(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,category TEXT NOT NULL,rating INTEGER NOT NULL,note TEXT NOT NULL,poster TEXT NOT NULL,created_at TEXT NOT NULL); INSERT INTO anime(title,category,rating,note,poster,created_at) VALUES('旧收藏','watched',9,'保留短评','','2026-01-01 00:00:00')`)
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()
	if err = Init(path); err != nil {
		t.Fatal(err)
	}
	Close()
	if err = Init(path); err != nil {
		t.Fatal(err)
	}
	defer Close()
	a, err := GetAnime(1)
	if err != nil {
		t.Fatal(err)
	}
	if a.Title != "旧收藏" || a.Rating != 9 || a.Note != "保留短评" || a.Metadata != nil {
		t.Fatalf("migration changed record: %+v", a)
	}
}
func TestProfileSaveDuplicateAndRevision(t *testing.T) {
	testDB(t)
	a := &model.Anime{Title: "原片名", Category: "watched", Rating: 8, Note: "个人短评", WatchDate: "2026-01", PlayLink: "https://example.com", Position: 7, LeaderboardPosition: 12}
	if _, err := CreateAnime(a); err != nil {
		t.Fatal(err)
	}
	m := &model.Metadata{TMDbID: 10, MediaType: "tv", Overview: "简介"}
	saved, err := SaveProfile(a.ID, a.ServerRev, "作品名", "", a.Category, m)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Rating != 8 || saved.Note != a.Note || saved.Position != 7 || saved.LeaderboardPosition != 12 || saved.WatchDate != a.WatchDate || saved.PlayLink != a.PlayLink {
		t.Fatal("personal data changed")
	}
	if _, err = SaveProfile(a.ID, a.ServerRev, "过时更新", "", a.Category, m); !errors.Is(err, ErrChanged) {
		t.Fatalf("expected stale rejection: %v", err)
	}
	if _, err = SaveProfile(0, 0, "整剧", "", "wantwatch", m); err == nil {
		t.Fatal("duplicate created")
	} else {
		var dup *DuplicateError
		if !errors.As(err, &dup) || dup.ID != a.ID {
			t.Fatalf("wrong duplicate: %v", err)
		}
	}
	for _, season := range []int{0, 1, 2} {
		s := season
		clone := *m
		clone.SeasonNumber = &s
		if _, err = SaveProfile(0, 0, "一季", "", "wantwatch", &clone); err != nil {
			t.Fatal(err)
		}
	}
	all, err := ListAnime("")
	if err != nil || len(all) != 4 {
		t.Fatalf("wrong season count %d, %v", len(all), err)
	}
	if err = DeleteAnime(saved.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = SaveProfile(0, 0, "重新收藏", "", "wantwatch", m); err != nil {
		t.Fatal(err)
	}
}
func TestOldSyncKeepsMetadata(t *testing.T) {
	testDB(t)
	m := &model.Metadata{TMDbID: 99, MediaType: "movie", Overview: "本地资料"}
	a, err := SaveProfile(0, 0, "电影", "", "wantwatch", m)
	if err != nil {
		t.Fatal(err)
	}
	incoming := *a
	incoming.Metadata = nil
	incoming.UpdatedAt = "2099-01-01 00:00:00"
	incoming.Rating = 10
	accepted, _, _, err := PushAnime([]model.Anime{incoming})
	if err != nil {
		t.Fatal(err)
	}
	if len(accepted) != 1 || accepted[0].Metadata == nil || accepted[0].Metadata.Overview != "本地资料" {
		t.Fatal("legacy sync erased metadata")
	}
	rows, _, err := PullAnime(0)
	if err != nil || len(rows) != 1 || rows[0].Metadata == nil || rows[0].Rating != 10 {
		t.Fatal("sync does not include metadata")
	}
	a, err = GetAnime(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	a.Note = "更新个人记录"
	if err = UpdateAnime(a.ID, a); err != nil {
		t.Fatal(err)
	}
	a, err = GetAnime(a.ID)
	if err != nil || a.Metadata == nil || a.Metadata.Overview != "本地资料" {
		t.Fatal("personal update erased metadata")
	}
}

func TestReorderingRetainsMetadata(t *testing.T) {
	testDB(t)
	a, err := SaveProfile(0, 0, "电影", "", "watched", &model.Metadata{TMDbID: 1, MediaType: "movie", Overview: "保留资料"})
	if err != nil {
		t.Fatal(err)
	}
	items := []struct {
		ID       int64 `json:"id"`
		Position int   `json:"position"`
	}{{a.ID, 4}}
	if err = UpdatePositions(items); err != nil {
		t.Fatal(err)
	}
	if err = UpdateLeaderboardPositions(items); err != nil {
		t.Fatal(err)
	}
	if err = CompactPositions("watched"); err != nil {
		t.Fatal(err)
	}
	current, err := GetAnime(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Metadata == nil || current.Metadata.Overview != "保留资料" || current.Position != 0 || current.LeaderboardPosition != 4 {
		t.Fatalf("reorder changed data: %+v", current)
	}
}

func TestImportPersonalRecordsAtomicAndProtected(t *testing.T) {
	testDB(t)
	personal := &model.Anime{Rating: 7, Note: "导入短评", WatchDate: "2025-06", PlayLink: "https://example.org/watch"}
	m := &model.Metadata{TMDbID: 4242, MediaType: "movie"}
	a, err := SaveImportProfile(0, 0, "自定片名", "", "watching", m, personal)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := GetAnime(a.ID)
	if err != nil || stored.Title != "自定片名" || stored.Category != "watching" || stored.Rating != 7 || stored.Note != personal.Note || stored.WatchDate != personal.WatchDate || stored.PlayLink != personal.PlayLink {
		t.Fatalf("records not saved with import: %+v %v", stored, err)
	}
	changed := &model.Anime{Rating: 1, Note: "不得覆盖", WatchDate: "2026-01", PlayLink: "https://example.org/new"}
	updated, err := SaveImportProfile(a.ID, a.ServerRev, "更新资料", "", "watched", m, changed)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Category != a.Category || updated.Rating != a.Rating || updated.Note != a.Note || updated.WatchDate != a.WatchDate || updated.PlayLink != a.PlayLink {
		t.Fatal("update replaced personal records")
	}
	if _, err = SaveImportProfile(0, 0, "重复", "", "wantwatch", m, changed); err == nil {
		t.Fatal("duplicate import allowed")
	}
	stored, _ = GetAnime(a.ID)
	if stored.Note != a.Note {
		t.Fatal("duplicate altered personal records")
	}
}
