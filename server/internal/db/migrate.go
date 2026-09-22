package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

// backfillResult 同步字段回填结果
type backfillResult struct {
	UIDBackfilled       int
	UpdatedAtBackfilled int
	RevAssigned         int
}

func (r backfillResult) changed() bool {
	return r.UIDBackfilled > 0 || r.UpdatedAtBackfilled > 0 || r.RevAssigned > 0
}

// backfillSyncFields 回填同步字段（幂等，可反复运行）：
//  1. 缺 uid 的行补 uid
//  2. updated_at 为空的行取 created_at
//  3. server_rev 未分配的行按 id 顺序分配基线 rev（保证 since=0 的全量拉取不漏行）
func backfillSyncFields(db *sql.DB) (backfillResult, error) {
	var res backfillResult

	// 1. 补 uid
	ids, err := queryInt64s(db, "SELECT id FROM anime WHERE uid IS NULL OR uid = '' ORDER BY id")
	if err != nil {
		return res, err
	}
	if len(ids) > 0 {
		tx, err := db.Begin()
		if err != nil {
			return res, err
		}
		for _, id := range ids {
			if _, err := tx.Exec("UPDATE anime SET uid = ? WHERE id = ?", NewUID(), id); err != nil {
				tx.Rollback()
				return res, err
			}
		}
		if err := tx.Commit(); err != nil {
			return res, err
		}
		res.UIDBackfilled = len(ids)
	}

	// 2. updated_at 取 created_at
	r, err := db.Exec("UPDATE anime SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''")
	if err != nil {
		return res, err
	}
	if n, err := r.RowsAffected(); err == nil {
		res.UpdatedAtBackfilled = int(n)
	}

	// 3. 分配基线 rev
	ids, err = queryInt64s(db, "SELECT id FROM anime WHERE server_rev IS NULL OR server_rev <= 0 ORDER BY id")
	if err != nil {
		return res, err
	}
	if len(ids) > 0 {
		tx, err := db.Begin()
		if err != nil {
			return res, err
		}
		for _, id := range ids {
			rev, err := nextRevTx(tx)
			if err != nil {
				tx.Rollback()
				return res, err
			}
			if _, err := tx.Exec("UPDATE anime SET server_rev = ? WHERE id = ?", rev, id); err != nil {
				tx.Rollback()
				return res, err
			}
		}
		if err := tx.Commit(); err != nil {
			return res, err
		}
		res.RevAssigned = len(ids)
	}

	return res, nil
}

// queryInt64s 执行单列整数查询
func queryInt64s(db *sql.DB, query string, args ...any) ([]int64, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []int64
	for rows.Next() {
		var v int64
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// renamePostersToUID 把海报文件改名为 <uid>.<ext> 并同步 poster 字段。
//   - 已经是 <uid>.<ext> 的跳过（alreadyOK）
//   - 原文件不存在：不动 poster 字段（避免指向不存在的文件），记入 missing
//   - 目标文件名已被占用：跳过并记入 skipped（不覆盖已有文件）
func renamePostersToUID(db *sql.DB, postersDir string) (renamed, alreadyOK int, missing, skipped []string, err error) {
	rows, err := db.Query("SELECT id, uid, poster FROM anime WHERE poster IS NOT NULL AND poster <> '' ORDER BY id")
	if err != nil {
		return 0, 0, nil, nil, err
	}

	type rec struct {
		id     int64
		uid    string
		poster string
	}
	var recs []rec
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.uid, &r.poster); err != nil {
			rows.Close()
			return 0, 0, nil, nil, err
		}
		recs = append(recs, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, nil, nil, err
	}

	for _, r := range recs {
		if r.uid == "" {
			skipped = append(skipped, fmt.Sprintf("id=%d 无 uid，跳过", r.id))
			continue
		}

		target := r.uid + filepath.Ext(r.poster)
		if target == r.poster {
			alreadyOK++
			continue
		}

		oldPath := filepath.Join(postersDir, r.poster)
		if _, statErr := os.Stat(oldPath); statErr != nil {
			missing = append(missing, fmt.Sprintf("id=%d %s", r.id, r.poster))
			continue
		}

		newPath := filepath.Join(postersDir, target)
		if _, statErr := os.Stat(newPath); statErr == nil {
			skipped = append(skipped, fmt.Sprintf("id=%d 目标文件名已存在: %s", r.id, target))
			continue
		}

		if err := os.Rename(oldPath, newPath); err != nil {
			return renamed, alreadyOK, missing, skipped, fmt.Errorf("id=%d 重命名失败: %w", r.id, err)
		}
		if _, err := db.Exec("UPDATE anime SET poster = ? WHERE id = ?", target, r.id); err != nil {
			// 回滚文件名，保持库与磁盘一致
			os.Rename(newPath, oldPath)
			return renamed, alreadyOK, missing, skipped, fmt.Errorf("id=%d 更新 poster 字段失败: %w", r.id, err)
		}
		renamed++
	}

	return renamed, alreadyOK, missing, skipped, nil
}

// MigrateReport 一次性迁移的结果（供命令行打印与人工核对）
type MigrateReport struct {
	DBPath     string
	PostersDir string

	TotalRows   int // anime 总行数（含墓碑）
	LiveRows    int // 未删除的行数
	Tombstones  int // 墓碑行数
	UIDTotal    int // 有 uid 的行数
	UIDDistinct int // 去重后的 uid 数（应等于 UIDTotal）

	AddedColumns        []string
	DroppedColumns      []string
	UIDBackfilled       int
	UpdatedAtBackfilled int
	RevAssigned         int

	PosterFiles     int // posters 目录里的文件数
	PosterRenamed   int
	PosterAlreadyOK int
	PosterMissing   []string
	PosterSkipped   []string

	LatestRev int64
}

// Migrate 对给定数据副本执行一次性迁移：
//  1. 结构升级（补同步列 uid / updated_at / deleted_at / server_rev，删历史列，建 meta / rev 表）
//  2. 补 uid 与 updated_at（取 created_at），并给老数据分配基线 rev
//  3. 海报改名 <uid>.<ext> 并同步 poster 字段
//
// 幂等：对已迁移过的库再跑一次不会有新的改动。
func Migrate(dbPath, postersDir string) (*MigrateReport, error) {
	if _, err := os.Stat(dbPath); err != nil {
		return nil, fmt.Errorf("找不到数据库文件 %s: %w", dbPath, err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	rep := &MigrateReport{DBPath: dbPath, PostersDir: postersDir}

	rep.AddedColumns, rep.DroppedColumns, err = ensureSchema(conn)
	if err != nil {
		return rep, err
	}

	backfill, err := backfillSyncFields(conn)
	if err != nil {
		return rep, err
	}
	rep.UIDBackfilled = backfill.UIDBackfilled
	rep.UpdatedAtBackfilled = backfill.UpdatedAtBackfilled
	rep.RevAssigned = backfill.RevAssigned

	if err := os.MkdirAll(postersDir, 0o755); err != nil {
		return rep, fmt.Errorf("创建海报目录失败: %w", err)
	}
	rep.PosterRenamed, rep.PosterAlreadyOK, rep.PosterMissing, rep.PosterSkipped, err = renamePostersToUID(conn, postersDir)
	if err != nil {
		return rep, err
	}

	if err := conn.QueryRow("SELECT COUNT(*) FROM anime").Scan(&rep.TotalRows); err != nil {
		return rep, err
	}
	if err := conn.QueryRow("SELECT COUNT(*) FROM anime WHERE deleted_at = ''").Scan(&rep.LiveRows); err != nil {
		return rep, err
	}
	rep.Tombstones = rep.TotalRows - rep.LiveRows
	if err := conn.QueryRow(
		"SELECT COUNT(*), COUNT(DISTINCT uid) FROM anime WHERE uid IS NOT NULL AND uid <> ''",
	).Scan(&rep.UIDTotal, &rep.UIDDistinct); err != nil {
		return rep, err
	}
	if err := conn.QueryRow("SELECT current FROM rev WHERE id = 1").Scan(&rep.LatestRev); err != nil {
		return rep, err
	}

	entries, err := os.ReadDir(postersDir)
	if err != nil {
		return rep, err
	}
	for _, e := range entries {
		if !e.IsDir() {
			rep.PosterFiles++
		}
	}

	return rep, nil
}
