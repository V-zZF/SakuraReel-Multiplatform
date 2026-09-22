// 一次性迁移命令（阶段 B3 / B4）：
//
//	go run ./cmd/migrate -data /path/to/data-copy
//
// 做三件事：结构升级、补 uid / updated_at、海报改名 <uid>.<ext>。
// 幂等，可反复运行；建议只对着数据副本跑（先备份）。
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"mal/internal/db"
)

func main() {
	dataDir := flag.String("data", ".", "数据目录（内含 anime.db 与 posters/）")
	dbPath := flag.String("db", "", "直接指定 anime.db 路径（优先于 -data）")
	postersDir := flag.String("posters", "", "直接指定 posters 目录（优先于 -data）")
	flag.Parse()

	abs, err := filepath.Abs(*dataDir)
	if err != nil {
		fail("数据目录无效: %v", err)
	}

	dbFile := *dbPath
	if dbFile == "" {
		dbFile = filepath.Join(abs, "anime.db")
	}
	posterDir := *postersDir
	if posterDir == "" {
		posterDir = filepath.Join(abs, "posters")
	}

	fmt.Println("━━━ SakuraReel 阶段 B 一次性迁移 ━━━")
	fmt.Printf("数据库  : %s\n", dbFile)
	fmt.Printf("海报目录: %s\n\n", posterDir)

	rep, err := db.Migrate(dbFile, posterDir)
	if err != nil {
		fmt.Printf("❌ 迁移失败: %v\n", err)
		os.Exit(1)
	}

	printReport(rep)
}

func printReport(rep *db.MigrateReport) {
	if len(rep.AddedColumns) > 0 {
		fmt.Printf("结构升级 · 新增列  : %v\n", rep.AddedColumns)
	}
	if len(rep.DroppedColumns) > 0 {
		fmt.Printf("结构升级 · 删除列  : %v（历史遗留）\n", rep.DroppedColumns)
	}
	fmt.Printf("补 uid             : %d 条\n", rep.UIDBackfilled)
	fmt.Printf("补 updated_at      : %d 条（取 created_at）\n", rep.UpdatedAtBackfilled)
	fmt.Printf("分配基线 rev       : %d 条（当前 rev = %d）\n", rep.RevAssigned, rep.LatestRev)
	fmt.Println()
	fmt.Printf("海报改名 <uid>.<ext>: %d 个\n", rep.PosterRenamed)
	fmt.Printf("海报已是 uid 命名   : %d 个\n", rep.PosterAlreadyOK)
	fmt.Printf("posters 目录文件数  : %d\n", rep.PosterFiles)
	if len(rep.PosterMissing) > 0 {
		fmt.Printf("⚠️  poster 字段指向的文件不存在（字段原样保留）: %d 个\n", len(rep.PosterMissing))
		for _, m := range rep.PosterMissing {
			fmt.Printf("   - %s\n", m)
		}
	}
	if len(rep.PosterSkipped) > 0 {
		fmt.Printf("⚠️  跳过的海报: %d 个\n", len(rep.PosterSkipped))
		for _, s := range rep.PosterSkipped {
			fmt.Printf("   - %s\n", s)
		}
	}
	fmt.Println()
	fmt.Printf("anime 行数          : %d（未删除 %d · 墓碑 %d）\n", rep.TotalRows, rep.LiveRows, rep.Tombstones)
	fmt.Printf("uid 数              : %d 条 / 去重后 %d 个\n", rep.UIDTotal, rep.UIDDistinct)

	bad := false
	if rep.UIDTotal != rep.UIDDistinct {
		fmt.Println("❌ uid 存在重复，需要人工检查")
		bad = true
	}
	if rep.UIDTotal != rep.TotalRows {
		fmt.Println("❌ 有行没有 uid，需要人工检查")
		bad = true
	}
	if bad {
		os.Exit(1)
	}

	fmt.Println("\n✅ 迁移完成（可重复运行，结果不变）")
	fmt.Println("   核对基准：MAL 原始数据 = anime 127 条 / posters 133 个文件")
}

func fail(format string, args ...any) {
	fmt.Printf("❌ "+format+"\n", args...)
	os.Exit(1)
}
