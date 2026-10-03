package db

import (
	"database/sql"
	"errors"
	"fmt"
	"mal/internal/model"
	"strings"
)

var ErrChanged = errors.New("记录已变化，请重新预览后保存")

// DuplicateError exposes the existing collection without merging personal records.
type DuplicateError struct{ ID int64 }

func (e *DuplicateError) Error() string { return "作品已收藏" }
func FindTMDb(m *model.Metadata, uid ...string) (*model.Anime, error) {
	if m == nil || m.TMDbID <= 0 {
		return nil, nil
	}
	season := -1
	if m.SeasonNumber != nil {
		season = *m.SeasonNumber
	}
	return scanAnimeRow(DB.QueryRow(listQuery+` AND json_extract(metadata, '$.media_type')=? AND json_extract(metadata, '$.tmdb_id')=? AND COALESCE(json_extract(metadata, '$.season_number'), -1)=?`, m.MediaType, m.TMDbID, season))
}

// SaveProfile serializes the final duplicate/revision check with the write. Only
// metadata, title and poster can change on an existing collection.
func SaveProfile(id, expected int64, title, poster, category string, m *model.Metadata, uid ...string) (*model.Anime, error) {
	return saveProfile(id, expected, title, poster, category, m, nil, uid...)
}

// SaveImportProfile saves new personal records atomically with the imported profile.
// Existing records keep their personal fields unchanged.
func SaveImportProfile(id, expected int64, title, poster, category string, m *model.Metadata, personal *model.Anime, uid ...string) (*model.Anime, error) {
	return saveProfile(id, expected, title, poster, category, m, personal, uid...)
}
func saveProfile(id, expected int64, title, poster, category string, m *model.Metadata, personal *model.Anime, uid ...string) (*model.Anime, error) {
	title = strings.TrimSpace(title)
	if title == "" || len([]rune(title)) > 200 {
		return nil, errors.New("片名不能为空且不能超过 200 字")
	}
	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var a *model.Anime
	if id > 0 {
		a, err = scanAnimeRow(tx.QueryRow(getQuery, id))
		if err != nil {
			return nil, err
		}
		if a == nil || a.ServerRev != expected {
			return nil, ErrChanged
		}
	} else {
		a = &model.Anime{UID: NewUID(), Category: category, CreatedAt: Now()}
		if personal != nil {
			a.Rating, a.Note, a.WatchDate, a.PlayLink = personal.Rating, personal.Note, personal.WatchDate, personal.PlayLink
		}
		if len(uid) > 0 {
			a.UID = uid[0]
		}
	}
	if m != nil && m.TMDbID > 0 {
		season := -1
		if m.SeasonNumber != nil {
			season = *m.SeasonNumber
		}
		var duplicate int64
		err = tx.QueryRow(`SELECT id FROM anime WHERE deleted_at='' AND id<>? AND json_extract(metadata, '$.media_type')=? AND json_extract(metadata, '$.tmdb_id')=? AND COALESCE(json_extract(metadata, '$.season_number'), -1)=?`, id, m.MediaType, m.TMDbID, season).Scan(&duplicate)
		if err == nil {
			return nil, &DuplicateError{duplicate}
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
	}
	a.Title, a.Poster, a.Metadata, a.UpdatedAt = title, poster, m, Now()
	a.ServerRev, err = nextRevTx(tx)
	if err != nil {
		return nil, err
	}
	if id > 0 {
		_, err = tx.Exec(`UPDATE anime SET title=?,poster=?,metadata=?,updated_at=?,server_rev=? WHERE id=?`, title, poster, model.EncodeMetadata(m), a.UpdatedAt, a.ServerRev, id)
	} else {
		if err = tx.QueryRow(`SELECT COALESCE(MAX(position),-1)+1 FROM anime WHERE category=? AND deleted_at=''`, category).Scan(&a.Position); err != nil {
			return nil, err
		}
		if err = tx.QueryRow(`SELECT COALESCE(MAX(leaderboard_position),-1)+1 FROM anime WHERE deleted_at=''`).Scan(&a.LeaderboardPosition); err != nil {
			return nil, err
		}
		var res sql.Result
		res, err = tx.Exec(`INSERT INTO anime(uid,title,category,poster,metadata,position,leaderboard_position,created_at,updated_at,server_rev,rating,note,watch_date,play_link) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, a.UID, title, category, poster, model.EncodeMetadata(m), a.Position, a.LeaderboardPosition, a.CreatedAt, a.UpdatedAt, a.ServerRev, a.Rating, a.Note, a.WatchDate, a.PlayLink)
		if err == nil {
			a.ID, err = res.LastInsertId()
		}
	}
	if err != nil {
		return nil, fmt.Errorf("保存资料: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return a, nil
}
