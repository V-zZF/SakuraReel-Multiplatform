package db

import "github.com/google/uuid"

// NewUID 生成全局唯一 ID（UUID v4，36 字符，含连字符）。
// 海报文件名 = <uid>.<ext>，因此 uid 同时决定海报文件名。
func NewUID() string { return uuid.NewString() }
