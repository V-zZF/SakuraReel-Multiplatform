package db

import (
	"database/sql"
	"fmt"
	"time"

	"mal/internal/model"

	_ "modernc.org/sqlite"
)

// DB 全局数据库实例
var DB *sql.DB

// schemaVersion 当前库结构版本，记录在 meta 表
const schemaVersion = "2"

// timeLayout 与 SQLite datetime('now','localtime') 的输出格式一致
const timeLayout = "2006-01-02 15:04:05"

// Now 返回本地时间字符串（与历史 created_at 格式一致）
func Now() string { return time.Now().Format(timeLayout) }

// ========== 建表 / 结构升级 ==========

const schemaAnime = `
	CREATE TABLE IF NOT EXISTS anime (
		id                   INTEGER PRIMARY KEY AUTOINCREMENT,
		uid                  TEXT    NOT NULL DEFAULT '',
		title                TEXT    NOT NULL,
		category             TEXT    NOT NULL DEFAULT 'wantwatch',
		rating               INTEGER NOT NULL DEFAULT 0,
		note                 TEXT    NOT NULL DEFAULT '',
		poster               TEXT    NOT NULL DEFAULT '',
		watch_date           TEXT    NOT NULL DEFAULT '',
		play_link            TEXT    NOT NULL DEFAULT '',
		position             INTEGER NOT NULL DEFAULT 0,
		leaderboard_position INTEGER NOT NULL DEFAULT 0,
		created_at           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
		updated_at           TEXT    NOT NULL DEFAULT '',
		deleted_at           TEXT    NOT NULL DEFAULT '',
		server_rev           INTEGER NOT NULL DEFAULT 0
	);`

// meta 表：键值对，存 schema_version / device_id / server_url 等（同步用）
const schemaMeta = `
	CREATE TABLE IF NOT EXISTS meta (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);`

// rev 表：全局修订号计数器（单行，id 恒为 1），每次写操作递增
const schemaRev = `
	CREATE TABLE IF NOT EXISTS rev (
		id      INTEGER PRIMARY KEY CHECK (id = 1),
		current INTEGER NOT NULL DEFAULT 0
	);`

const seedRev = `INSERT OR IGNORE INTO rev (id, current) VALUES (1, 0);`

// uid 唯一（空 uid 不参与，避免历史数据未回填时冲突）；server_rev 建索引供增量拉取
const schemaUIDIndex = `CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_uid ON anime(uid) WHERE uid <> '';`
const schemaRevIndex = `CREATE INDEX IF NOT EXISTS idx_anime_server_rev ON anime(server_rev);`

// addableColumns 旧库缺列时按此补齐（顺序 = 历史 ALTER 顺序）
var addableColumns = []struct{ name, ddl string }{
	{"uid", "uid TEXT NOT NULL DEFAULT ''"},
	{"watch_date", "watch_date TEXT NOT NULL DEFAULT ''"},
	{"position", "position INTEGER NOT NULL DEFAULT 0"},
	{"play_link", "play_link TEXT NOT NULL DEFAULT ''"},
	{"leaderboard_position", "leaderboard_position INTEGER NOT NULL DEFAULT 0"},
	{"updated_at", "updated_at TEXT NOT NULL DEFAULT ''"},
	{"deleted_at", "deleted_at TEXT NOT NULL DEFAULT ''"},
	{"server_rev", "server_rev INTEGER NOT NULL DEFAULT 0"},
}

// legacyColumns 历史遗留列，已无代码引用，结构升级时删除
var legacyColumns = []string{"home_position", "ranking_position"}

// Init 初始化数据库连接并建表
func Init(dbPath string) error {
	var err error
	DB, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("打开数据库失败: %w", err)
	}

	// 连接池配置（SQLite 建议单连接）
	DB.SetMaxOpenConns(1)
	DB.SetConnMaxLifetime(time.Hour)

	// 建表 + 旧库结构升级
	added, dropped, err := ensureSchema(DB)
	if err != nil {
		return fmt.Errorf("建表失败: %w", err)
	}
	if len(added) > 0 || len(dropped) > 0 {
		fmt.Printf("🔧 结构升级：新增列 %v，删除历史列 %v\n", added, dropped)
	}

	// 同步字段回填（幂等）：补 uid / updated_at，并给老数据分配基线 rev
	rep, err := backfillSyncFields(DB)
	if err != nil {
		return fmt.Errorf("同步字段迁移失败: %w", err)
	}
	if rep.changed() {
		fmt.Printf("🔧 同步字段迁移：补 uid %d 条，补 updated_at %d 条，分配基线 rev %d 条\n",
			rep.UIDBackfilled, rep.UpdatedAtBackfilled, rep.RevAssigned)
	}

	return nil
}

// ensureSchema 建表并升级旧库结构，返回新增与删除的列名
func ensureSchema(db *sql.DB) (added []string, dropped []string, err error) {
	for _, stmt := range []string{schemaAnime, schemaMeta, schemaRev, seedRev} {
		if _, err = db.Exec(stmt); err != nil {
			return nil, nil, err
		}
	}

	have, err := tableColumns(db, "anime")
	if err != nil {
		return nil, nil, err
	}

	for _, col := range addableColumns {
		if have[col.name] {
			continue
		}
		if _, err = db.Exec("ALTER TABLE anime ADD COLUMN " + col.ddl); err != nil {
			return added, dropped, fmt.Errorf("添加列 %s 失败: %w", col.name, err)
		}
		added = append(added, col.name)
	}

	for _, name := range legacyColumns {
		if !have[name] {
			continue
		}
		if _, err = db.Exec("ALTER TABLE anime DROP COLUMN " + name); err != nil {
			return added, dropped, fmt.Errorf("删除历史列 %s 失败: %w", name, err)
		}
		dropped = append(dropped, name)
	}

	// 索引要等列补齐之后再建（旧库原本没有 uid / server_rev 列）
	for _, stmt := range []string{schemaUIDIndex, schemaRevIndex} {
		if _, err = db.Exec(stmt); err != nil {
			return added, dropped, fmt.Errorf("建索引失败: %w", err)
		}
	}

	if err = setMeta(db, "schema_version", schemaVersion); err != nil {
		return added, dropped, err
	}
	return added, dropped, nil
}

// tableColumns 返回表的列名集合
func tableColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols := map[string]bool{}
	for rows.Next() {
		var (
			cid     int
			name    string
			ctype   string
			notNull int
			dflt    sql.NullString
			pk      int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols[name] = true
	}
	return cols, rows.Err()
}

// ========== meta / rev ==========

// SetMeta 写入 meta 键值
func SetMeta(key, value string) error { return setMeta(DB, key, value) }

func setMeta(db *sql.DB, key, value string) error {
	_, err := db.Exec(
		"INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	return err
}

// GetMeta 读取 meta 键值，不存在时返回 ok=false
func GetMeta(key string) (value string, ok bool, err error) {
	err = DB.QueryRow("SELECT value FROM meta WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

// CurrentRev 读取当前全局修订号
func CurrentRev() (int64, error) {
	var rev int64
	err := DB.QueryRow("SELECT current FROM rev WHERE id = 1").Scan(&rev)
	return rev, err
}

// NextRev 分配一个全局递增的业务修订号（单条写路径用）
func NextRev() (int64, error) {
	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	rev, err := nextRevTx(tx)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return rev, nil
}

// nextRevTx 在事务内递增并返回新的修订号
func nextRevTx(tx *sql.Tx) (int64, error) {
	if _, err := tx.Exec("UPDATE rev SET current = current + 1 WHERE id = 1"); err != nil {
		return 0, err
	}
	var rev int64
	if err := tx.QueryRow("SELECT current FROM rev WHERE id = 1").Scan(&rev); err != nil {
		return 0, err
	}
	return rev, nil
}

// ========== 基础 CRUD 函数 ==========

// 全字段扫描列表（用于 SELECT 查询）；已删除（墓碑）记录一律排除
const listColumns = "id, uid, title, category, rating, note, poster, watch_date, play_link, position, leaderboard_position, created_at, updated_at, deleted_at, server_rev"
const listQuery = "SELECT " + listColumns + " FROM anime WHERE deleted_at = ''"
const getQuery = "SELECT " + listColumns + " FROM anime WHERE deleted_at = '' AND id = ?"

func scanAnime(rows *sql.Rows) (*model.Anime, error) {
	var a model.Anime
	err := rows.Scan(&a.ID, &a.UID, &a.Title, &a.Category, &a.Rating, &a.Note, &a.Poster, &a.WatchDate,
		&a.PlayLink, &a.Position, &a.LeaderboardPosition, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt, &a.ServerRev)
	return &a, err
}

func scanAnimeRow(row *sql.Row) (*model.Anime, error) {
	var a model.Anime
	err := row.Scan(&a.ID, &a.UID, &a.Title, &a.Category, &a.Rating, &a.Note, &a.Poster, &a.WatchDate,
		&a.PlayLink, &a.Position, &a.LeaderboardPosition, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt, &a.ServerRev)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

// ListAnime 获取番剧列表，可按分类过滤
func ListAnime(category string) ([]model.Anime, error) {
	var rows *sql.Rows
	var err error

	if category == "" {
		// 排行榜：按 leaderboard_position 降序（新→旧）
		rows, err = DB.Query(listQuery + " ORDER BY rating DESC, leaderboard_position DESC")
	} else {
		// 主页：按月份降序（晚→早），同月内按 position 升序
		rows, err = DB.Query(listQuery+" AND category = ? ORDER BY watch_date DESC, position ASC, created_at DESC", category)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.Anime
	for rows.Next() {
		a, err := scanAnime(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *a)
	}
	return list, rows.Err()
}

// GetAnime 获取单个番剧（已删除的返回 nil）
func GetAnime(id int64) (*model.Anime, error) {
	return scanAnimeRow(DB.QueryRow(getQuery, id))
}

// CreateAnime 创建番剧：自动分配 uid，写入 created_at / updated_at 与服务端修订号
func CreateAnime(a *model.Anime) (int64, error) {
	if a.UID == "" {
		a.UID = NewUID()
	}

	now := Now()
	a.CreatedAt = now
	a.UpdatedAt = now
	a.DeletedAt = ""

	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	rev, err := nextRevTx(tx)
	if err != nil {
		return 0, err
	}
	a.ServerRev = rev

	result, err := tx.Exec(
		"INSERT INTO anime (uid, title, category, rating, note, poster, watch_date, play_link, position, leaderboard_position, created_at, updated_at, deleted_at, server_rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		a.UID, a.Title, a.Category, a.Rating, a.Note, a.Poster, a.WatchDate, a.PlayLink, a.Position, a.LeaderboardPosition,
		now, now, "", rev,
	)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	a.ID = id
	return id, nil
}

// UpdateAnime 更新番剧所有字段，并刷新 updated_at / server_rev
func UpdateAnime(id int64, a *model.Anime) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rev, err := nextRevTx(tx)
	if err != nil {
		return err
	}
	now := Now()

	if _, err := tx.Exec(
		"UPDATE anime SET title=?, category=?, rating=?, note=?, poster=?, watch_date=?, play_link=?, position=?, leaderboard_position=?, updated_at=?, server_rev=? WHERE id=? AND deleted_at = ''",
		a.Title, a.Category, a.Rating, a.Note, a.Poster, a.WatchDate, a.PlayLink, a.Position, a.LeaderboardPosition,
		now, rev, id,
	); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	a.UpdatedAt = now
	a.ServerRev = rev
	return nil
}

// DeleteAnime 删除番剧：写删除墓碑（不物理删行，供同步识别"另一端已删除"）
func DeleteAnime(id int64) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rev, err := nextRevTx(tx)
	if err != nil {
		return err
	}
	now := Now()

	if _, err := tx.Exec(
		"UPDATE anime SET deleted_at=?, updated_at=?, server_rev=? WHERE id=? AND deleted_at = ''",
		now, now, rev, id,
	); err != nil {
		return err
	}
	return tx.Commit()
}

// ========== 排序相关函数 ==========

// UpdatePositions 批量更新主页排序位置（事务保证原子性），逐条刷新 updated_at / server_rev
func UpdatePositions(items []struct {
	ID       int64 `json:"id"`
	Position int   `json:"position"`
}) error {
	return updatePositionColumn("position", items)
}

// UpdateLeaderboardPositions 批量更新排行榜排序位置（事务保证原子性），逐条刷新 updated_at / server_rev
func UpdateLeaderboardPositions(items []struct {
	ID       int64 `json:"id"`
	Position int   `json:"position"`
}) error {
	return updatePositionColumn("leaderboard_position", items)
}

// updatePositionColumn 排序写路径的公共实现（列名只允许 position / leaderboard_position）
func updatePositionColumn(column string, items []struct {
	ID       int64 `json:"id"`
	Position int   `json:"position"`
}) error {
	if column != "position" && column != "leaderboard_position" {
		return fmt.Errorf("非法排序列: %s", column)
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := Now()
	for _, item := range items {
		rev, err := nextRevTx(tx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(
			"UPDATE anime SET "+column+"=?, updated_at=?, server_rev=? WHERE id=? AND deleted_at = ''",
			item.Position, now, rev, item.ID,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetMaxPosition 获取某分类最大 position（用于新卡片插入末尾）
func GetMaxPosition(category string) int {
	var maxPos int
	err := DB.QueryRow(
		"SELECT COALESCE(MAX(position), -1) FROM anime WHERE category = ? AND deleted_at = ''", category,
	).Scan(&maxPos)
	if err != nil {
		return 0
	}
	return maxPos + 1
}

// GetMaxLeaderboardPosition 获取排行榜最大 leaderboard_position
func GetMaxLeaderboardPosition() int {
	var maxPos int
	err := DB.QueryRow(
		"SELECT COALESCE(MAX(leaderboard_position), -1) FROM anime WHERE deleted_at = ''",
	).Scan(&maxPos)
	if err != nil {
		return 0
	}
	return maxPos + 1
}

// ShiftPositionsForWatchDate 将同分类+同月内所有 position >= 当前值的项 +1
// 用于新卡片插入月份组开头时，为 position 0 空出位置
func ShiftPositionsForWatchDate(category, watchDate string) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rev, err := nextRevTx(tx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(
		"UPDATE anime SET position = position + 1, updated_at = ?, server_rev = ? WHERE category = ? AND watch_date = ? AND deleted_at = ''",
		Now(), rev, category, watchDate,
	); err != nil {
		return err
	}
	return tx.Commit()
}

// CompactPositions 删除后压缩同分类 position（消除空位）
func CompactPositions(category string) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.Query(
		"SELECT id FROM anime WHERE category = ? AND deleted_at = '' ORDER BY position ASC", category,
	)
	if err != nil {
		return err
	}

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	now := Now()
	for i, id := range ids {
		rev, err := nextRevTx(tx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE anime SET position=?, updated_at=?, server_rev=? WHERE id=?", i, now, rev, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Close 关闭数据库连接
func Close() {
	if DB != nil {
		DB.Close()
	}
}
