package model

// Anime 番剧数据结构
type Anime struct {
	ID                  int64  `json:"id"`
	UID                 string `json:"uid"` // 全局唯一 ID（同步用，海报文件名 = <uid>.<ext>）
	Title               string `json:"title"`
	Category            string `json:"category"`             // "watched" | "watching" | "wantwatch"
	Rating              int    `json:"rating"`               // 0-10, 0 表示未评分
	Note                string `json:"note"`                 // 个人短评
	Poster              string `json:"poster"`               // 海报文件名（<uid>.<ext>），空字符串表示无海报
	WatchDate           string `json:"watch_date"`           // 观看年月，格式 YYYY-MM，空字符串表示未设置
	PlayLink            string `json:"play_link"`            // 播放链接，空字符串表示未设置
	Position            int    `json:"position"`             // 主页排序位置（同分类内），越小越靠前
	LeaderboardPosition int    `json:"leaderboard_position"` // 排行榜排序位置，越大越靠前
	CreatedAt           string `json:"created_at"`

	// 以下为阶段 B 新增的同步字段
	UpdatedAt string `json:"updated_at"` // 最后修改时间（本地时间，YYYY-MM-DD HH:MM:SS）
	DeletedAt string `json:"deleted_at"` // 删除墓碑时间；非空 = 已删除（REST 不返回，同步时下发）
	ServerRev int64  `json:"server_rev"` // 服务端全局递增修订号；0 = 尚未分配
}

// 分类常量
const (
	categoryWatched   = "watched"
	categoryWatching  = "watching"
	categoryWantWatch = "wantwatch"
)

// ValidCategory 检查分类是否合法
func ValidCategory(c string) bool {
	return c == categoryWatched || c == categoryWatching || c == categoryWantWatch
}

// ValidRating 检查评分是否合法
func ValidRating(r int) bool {
	return r >= 0 && r <= 10
}
