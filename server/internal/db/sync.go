package db

import (
	"database/sql"
	"fmt"

	"mal/internal/model"
)

// SyncRejection keeps the server copy so a client can resolve a rejected push.
type SyncRejection struct {
	UID    string      `json:"uid"`
	Reason string      `json:"reason"`
	Server model.Anime `json:"server"`
}

// PushAnime applies a batch in one transaction. Each accepted record receives its
// own revision; a failed batch rolls back every write and revision.
func PushAnime(incoming []model.Anime) ([]model.Anime, []SyncRejection, int64, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, nil, 0, err
	}
	defer tx.Rollback()

	accepted := make([]model.Anime, 0, len(incoming))
	rejected := make([]SyncRejection, 0)
	for _, a := range incoming {
		current, err := scanAnimeRow(tx.QueryRow("SELECT "+listColumns+" FROM anime WHERE uid = ?", a.UID))
		if err != nil {
			return nil, nil, 0, err
		}
		if current != nil {
			// A tombstone is terminal for this uid. A new item needs a new uid.
			if current.DeletedAt != "" && a.DeletedAt == "" {
				rejected = append(rejected, SyncRejection{a.UID, "deleted", *current})
				continue
			}
			if a.UpdatedAt <= current.UpdatedAt {
				rejected = append(rejected, SyncRejection{a.UID, "stale", *current})
				continue
			}
		}

		rev, err := nextRevTx(tx)
		if err != nil {
			return nil, nil, 0, err
		}
		a.ServerRev = rev
		if current == nil {
			result, err := tx.Exec(`INSERT INTO anime
				(uid,title,category,rating,note,poster,watch_date,play_link,position,leaderboard_position,created_at,updated_at,deleted_at,server_rev)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				a.UID, a.Title, a.Category, a.Rating, a.Note, a.Poster, a.WatchDate, a.PlayLink, a.Position, a.LeaderboardPosition,
				a.CreatedAt, a.UpdatedAt, a.DeletedAt, rev)
			if err != nil {
				return nil, nil, 0, err
			}
			a.ID, err = result.LastInsertId()
			if err != nil {
				return nil, nil, 0, err
			}
		} else {
			a.ID = current.ID
			// created_at is immutable after the first insert.
			a.CreatedAt = current.CreatedAt
			_, err = tx.Exec(`UPDATE anime SET title=?,category=?,rating=?,note=?,poster=?,watch_date=?,play_link=?,position=?,leaderboard_position=?,updated_at=?,deleted_at=?,server_rev=? WHERE uid=?`,
				a.Title, a.Category, a.Rating, a.Note, a.Poster, a.WatchDate, a.PlayLink, a.Position, a.LeaderboardPosition,
				a.UpdatedAt, a.DeletedAt, rev, a.UID)
			if err != nil {
				return nil, nil, 0, err
			}
		}
		accepted = append(accepted, a)
	}
	var latest int64
	if err := tx.QueryRow("SELECT current FROM rev WHERE id = 1").Scan(&latest); err != nil {
		return nil, nil, 0, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, 0, err
	}
	return accepted, rejected, latest, nil
}

// PullAnime returns rows and the cursor from one SQLite snapshot, including tombstones.
func PullAnime(since int64) ([]model.Anime, int64, error) {
	tx, err := DB.BeginTx(nil, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()
	var latest int64
	if err := tx.QueryRow("SELECT current FROM rev WHERE id = 1").Scan(&latest); err != nil {
		return nil, 0, err
	}
	rows, err := tx.Query("SELECT "+listColumns+" FROM anime WHERE server_rev > ? AND server_rev <= ? ORDER BY server_rev ASC", since, latest)
	if err != nil {
		return nil, 0, err
	}
	list := make([]model.Anime, 0)
	for rows.Next() {
		a, err := scanAnime(rows)
		if err != nil {
			rows.Close()
			return nil, 0, err
		}
		list = append(list, *a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(); err != nil {
		return nil, 0, err
	}
	return list, latest, nil
}

// SyncPosterRecord includes tombstones because their image remains downloadable.
func SyncPosterRecord(uid string) (*model.Anime, error) {
	a, err := scanAnimeRow(DB.QueryRow("SELECT "+listColumns+" FROM anime WHERE uid = ?", uid))
	if err != nil {
		return nil, fmt.Errorf("查找海报记录: %w", err)
	}
	return a, nil
}

// SaveSyncPoster holds the sole database connection while checking the revision
// and replacing the file, so a concurrent push cannot invalidate the check.
func SaveSyncPoster(uid, poster string, rev int64, replace func() error) (bool, error) {
	tx, err := DB.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var currentPoster string
	var currentRev int64
	err = tx.QueryRow("SELECT poster, server_rev FROM anime WHERE uid = ?", uid).Scan(&currentPoster, &currentRev)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if currentPoster != poster || currentRev != rev {
		return false, nil
	}
	if err := replace(); err != nil {
		return false, err
	}
	return true, tx.Commit()
}
