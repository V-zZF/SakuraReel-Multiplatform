package handler

import (
	"context"
	"mal/internal/tmdb"
	"sync"
)

const imageDownloadConcurrency = 6

type imageDownloadTarget struct {
	field string
	name  *string
}

type imageDownloadJob struct {
	path, kind string
	targets    []imageDownloadTarget
}

type imageDownloadBatch struct {
	jobs  []imageDownloadJob
	index map[string]int
}

func (b *imageDownloadBatch) add(path, kind, field string, name *string) {
	if path == "" {
		return
	}
	if b.index == nil {
		b.index = map[string]int{}
	}
	key := kind + ":" + path
	i, found := b.index[key]
	if !found {
		i = len(b.jobs)
		b.index[key] = i
		b.jobs = append(b.jobs, imageDownloadJob{path: path, kind: kind})
	}
	b.jobs[i].targets = append(b.jobs[i].targets, imageDownloadTarget{field, name})
}

func (b *imageDownloadBatch) save(ctx context.Context, c *tmdb.Client) ([]string, map[string]string) {
	type result struct {
		name string
		err  error
	}
	results := make([]result, len(b.jobs))
	work := make(chan int)
	var workers sync.WaitGroup
	for range min(imageDownloadConcurrency, len(b.jobs)) {
		workers.Go(func() {
			for i := range work {
				job := b.jobs[i]
				results[i].name, results[i].err = downloadImage(ctx, c, job.path, job.kind)
			}
		})
	}
	for i := range b.jobs {
		if ctx.Err() != nil {
			// Account for unscheduled jobs so cancellation cannot produce a
			// successful import with missing images.
			for j := i; j < len(b.jobs); j++ {
				results[j].err = ctx.Err()
			}
			break
		}
		work <- i
	}
	close(work)
	// Join before rewriting metadata or cleaning files, even after cancellation.
	workers.Wait()
	files := make([]string, 0, len(b.jobs))
	errors := map[string]string{}
	for i, job := range b.jobs {
		r := results[i]
		if r.err == nil {
			files = append(files, r.name)
		}
		for _, target := range job.targets {
			if r.err != nil {
				message := r.err.Error()
				if job.kind == "portrait" {
					message = "关联图片保存失败，可取消此资料组后重试"
				}
				errors[target.field] = message
			} else {
				*target.name = r.name
			}
		}
	}
	return files, errors
}
